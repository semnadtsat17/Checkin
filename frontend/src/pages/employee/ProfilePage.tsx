import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';
import { authApi } from '../../api/auth';

// ─── Row helper ───────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 flex-shrink-0 w-32">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const fullName = user
    ? (locale === 'th'
        ? `${user.firstNameTh} ${user.lastNameTh}`
        : `${user.firstName || user.firstNameTh} ${user.lastName || user.lastNameTh}`)
    : '';

  const ROLE_LABEL: Record<string, string> = {
    super_admin: t('roles.super_admin'),
    hr:          t('roles.hr'),
    manager:     t('roles.manager'),
    employee:    t('roles.employee'),
    part_time:   t('roles.part_time'),
  };

  // ── Change password ────────────────────────────────────────────────────────
  const [showPwForm, setShowPwForm]       = useState(false);
  const [currentPw,  setCurrentPw]        = useState('');
  const [newPw,      setNewPw]            = useState('');
  const [confirmPw,  setConfirmPw]        = useState('');
  const [pwLoading,  setPwLoading]        = useState(false);
  const [pwError,    setPwError]          = useState('');
  const [pwSuccess,  setPwSuccess]        = useState('');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPw !== confirmPw) {
      setPwError(t('auth.passwordMismatch'));
      return;
    }
    if (newPw.length < 8) {
      setPwError(t('auth.passwordTooShort'));
      return;
    }

    setPwLoading(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setPwSuccess(t('auth.passwordChanged'));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwForm(false);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setPwLoading(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-200';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Avatar + name */}
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 text-3xl font-bold text-primary-700">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <p className="text-lg font-semibold text-gray-900">{fullName}</p>
          <p className="text-sm text-gray-400">{user?.employeeCode}</p>
          {user?.role && (
            <span className="mt-2 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="rounded-2xl bg-white px-5 shadow-sm">
          <InfoRow label={t('employee.email')}      value={user?.email} />
          <InfoRow label={t('employee.phone')}      value={user?.phone} />
          <InfoRow label={t('employee.hireDate')}   value={user?.startDate} />
          <InfoRow label={t('employee.department')} value={user?.departmentId} />
        </div>

        {/* Change password button / form */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {!showPwForm ? (
            <>
              {pwSuccess && (
                <p className="mb-3 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-600">
                  {pwSuccess}
                </p>
              )}
              <button
                onClick={() => { setShowPwForm(true); setPwSuccess(''); }}
                className="w-full rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                {t('auth.changePassword')}
              </button>
            </>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3">
              <p className="text-sm font-semibold text-gray-800">{t('auth.changePassword')}</p>

              <input
                type="password"
                placeholder={t('auth.currentPassword')}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
                className={inputCls}
              />
              <input
                type="password"
                placeholder={t('auth.newPassword')}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                autoComplete="new-password"
                className={inputCls}
              />
              <input
                type="password"
                placeholder={t('auth.confirmPassword')}
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
                className={inputCls}
              />

              {pwError && (
                <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{pwError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowPwForm(false); setPwError(''); }}
                  className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {pwLoading ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
