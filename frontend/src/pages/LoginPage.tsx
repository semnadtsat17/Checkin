import { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROLE_LEVEL } from '@hospital-hr/shared';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/useTranslation';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, locale, changeLocale } = useTranslation();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // After login, go where the user was trying to go (or role-default)
  const from = (location.state as { from?: string })?.from;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);

      // Determine redirect based on role stored in context
      // We re-read from localStorage because state may not have updated yet
      const stored = localStorage.getItem('auth_user');
      const user   = stored ? JSON.parse(stored) : null;
      const level  = user ? ROLE_LEVEL[user.role as keyof typeof ROLE_LEVEL] : 0;

      if (from) {
        navigate(from, { replace: true });
      } else if (level <= 2) {
        navigate('/checkin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      {/* Language toggle */}
      <div className="absolute right-4 top-4">
        <button
          onClick={() => changeLocale(locale === 'th' ? 'en' : 'th')}
          className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
        >
          {locale === 'th' ? 'EN' : 'TH'}
        </button>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('auth.loginSubtitle')}</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t('employee.email')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none
                         focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="name@hospital.com"
            />
          </div>

          {/* Password */}
          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t('auth.password')}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm outline-none
                         focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary-600 py-3 text-base font-semibold text-white
                       shadow-sm hover:bg-primary-700 active:bg-primary-800
                       disabled:opacity-60 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 3 10.373 3 12h1z" />
              </svg>
            )}
            {loading ? t('common.loading') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
