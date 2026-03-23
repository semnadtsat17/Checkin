import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/auth';
import { ROLE_LEVEL } from '@hospital-hr/shared';

export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user, clearMustChange } = useAuth();
  const navigate = useNavigate();

  const [oldPassword,     setOldPassword]     = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!oldPassword)           { setError(t('auth.currentPassword') + ' ' + t('common.required')); return; }
    if (newPassword.length < 8) { setError(t('auth.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { setError(t('auth.passwordMismatch')); return; }

    setSaving(true);
    try {
      await authApi.changePassword(oldPassword, newPassword);
      clearMustChange();
      setSuccess(true);
      // Redirect after short delay
      setTimeout(() => {
        const level = user ? ROLE_LEVEL[user.role] : 0;
        navigate(level <= 2 ? '/checkin' : '/dashboard', { replace: true });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
            <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{t('auth.changePassword')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('auth.mustChangePassword')}</p>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-center text-sm text-green-700">
            {t('auth.passwordChanged')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('auth.oldPassword')}
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className={inputCls}
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('auth.newPassword')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t('auth.confirmNewPassword')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={inputCls}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? t('common.loading') : t('auth.changePassword')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
