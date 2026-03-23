import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';

// ─── Bottom tab definition ────────────────────────────────────────────────────

interface Tab {
  path:  string;
  label: string;
  icon:  string;  // SVG path data
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const { t, locale, changeLocale } = useTranslation();
  const navigate = useNavigate();

  const fullName = user
    ? (locale === 'th'
        ? `${user.firstNameTh} ${user.lastNameTh}`
        : `${user.firstName || user.firstNameTh} ${user.lastName || user.lastNameTh}`)
    : '';

  const tabs: Tab[] = [
    {
      path:  '/checkin',
      label: t('attendance.checkIn'),
      icon:  'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      path:  '/history',
      label: t('attendance.history'),
      icon:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
      path:  '/summary',
      label: t('attendance.summary.title'),
      icon:  'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
    {
      path:  '/my-schedule',
      label: t('nav.schedule'),
      icon:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
      path:  '/profile',
      label: t('nav.profile'),
      icon:  'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    },
  ];

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">

      {/* ── Top header ── */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between
                         bg-white px-4 shadow-sm">
        {/* User name + code */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full
                          bg-primary-100 text-sm font-bold text-primary-700">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-none">{fullName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{user?.employeeCode}</p>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={() => changeLocale(locale === 'th' ? 'en' : 'th')}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500
                       hover:bg-gray-100"
          >
            {locale === 'th' ? 'EN' : 'TH'}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            title={t('auth.logout')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-stretch
                      border-t border-gray-200 bg-white">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors
               ${isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`
            }
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
