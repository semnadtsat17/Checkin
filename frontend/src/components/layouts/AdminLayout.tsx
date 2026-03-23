import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { ROLE_LEVEL } from '@hospital-hr/shared';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';
import { scheduleApprovalApi } from '../../api/scheduleApprovals';
import { notificationsApi } from '../../api/notifications';

// ─── Nav item definition ──────────────────────────────────────────────────────

interface NavItem {
  key:      string;
  path:     string;
  label:    string;
  minLevel: number;
  icon:     React.ReactNode;
  badge?:   number;
}

// ─── Inline SVG icons (heroicons outline 24px) ────────────────────────────────

function Icon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24"
         stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICONS = {
  dashboard:    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  attendance:   'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  schedules:    'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  editRequests: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  reports:      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  employees:    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  departments:  'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  branches:     'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  subRoles:     'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  holidays:     'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

// ─── Sidebar content (shared between desktop sidebar & mobile drawer) ─────────

function SidebarContent({
  navItems,
  fullName,
  employeeCode,
  locale,
  onChangeLocale,
  onLogout,
  onNavClick,
}: {
  navItems:       NavItem[];
  fullName:       string;
  employeeCode?:  string;
  locale:         string;
  onChangeLocale: () => void;
  onLogout:       () => void;
  onNavClick?:    () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-5 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-800 leading-tight">
          Hospital HR<br />
          <span className="font-normal text-gray-400 text-xs">Management</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
               ${isActive
                 ? 'bg-primary-50 text-primary-700'
                 : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
            }
          >
            {item.icon}
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-100 p-3 space-y-1 shrink-0">
        {/* Language toggle */}
        <button
          onClick={onChangeLocale}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          {locale === 'th' ? 'English' : 'ภาษาไทย'}
        </button>

        {/* User info */}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
            {fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">{fullName}</p>
            <p className="truncate text-xs text-gray-400">{employeeCode}</p>
          </div>
        </div>

        {/* Profile */}
        <Link
          to="/profile"
          onClick={onNavClick}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('nav.profile')}
        </Link>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {t('auth.logout')}
        </button>
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { t, locale, changeLocale } = useTranslation();
  const navigate = useNavigate();

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [scheduleBadge, setScheduleBadge] = useState(0);

  const userLevel = user ? ROLE_LEVEL[user.role] : 0;

  // Fetch badge count once on mount: HR sees pending approval count, managers see unread notifications
  useEffect(() => {
    if (userLevel >= 4) {
      scheduleApprovalApi.pendingCount()
        .then((r) => setScheduleBadge(r.count))
        .catch(() => {});
    } else if (userLevel >= 3) {
      notificationsApi.unreadCount()
        .then((r) => setScheduleBadge(r.count))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLevel]);

  const navItems: NavItem[] = [
    { key: 'dashboard',    path: '/dashboard',    label: t('nav.dashboard'),      minLevel: 3, icon: <Icon path={ICONS.dashboard} /> },
    { key: 'attendance',   path: '/attendance',   label: t('nav.attendance'),     minLevel: 3, icon: <Icon path={ICONS.attendance} /> },
    { key: 'schedules',    path: '/schedules',    label: t('nav.schedule'),       minLevel: 3, icon: <Icon path={ICONS.schedules} />, badge: scheduleBadge || undefined },
    { key: 'editRequests', path: '/edit-requests',label: t('editRequest.title'),  minLevel: 3, icon: <Icon path={ICONS.editRequests} /> },
    { key: 'reports',      path: '/reports',      label: t('nav.reports'),        minLevel: 3, icon: <Icon path={ICONS.reports} /> },
    { key: 'employees',    path: '/employees',    label: t('nav.employees'),      minLevel: 4, icon: <Icon path={ICONS.employees} /> },
    { key: 'departments',  path: '/departments',  label: t('nav.departments'),    minLevel: 4, icon: <Icon path={ICONS.departments} /> },
    { key: 'branches',     path: '/branches',     label: t('nav.branches'),       minLevel: 4, icon: <Icon path={ICONS.branches} /> },
    { key: 'subRoles',     path: '/work-schedule-patterns', label: t('workPattern.title'), minLevel: 4, icon: <Icon path={ICONS.subRoles} /> },
    { key: 'holidays',     path: '/holidays',               label: t('holiday.title'),     minLevel: 4, icon: <Icon path={ICONS.holidays} /> },
  ].filter((item) => userLevel >= item.minLevel);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const fullName = user
    ? (locale === 'th'
        ? `${user.firstNameTh} ${user.lastNameTh}`
        : `${user.firstName || user.firstNameTh} ${user.lastName || user.lastNameTh}`)
    : '';

  const sidebarProps = {
    navItems,
    fullName,
    employeeCode: user?.employeeCode,
    locale,
    onChangeLocale: () => changeLocale(locale === 'th' ? 'en' : 'th'),
    onLogout: handleLogout,
  };

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Desktop sidebar (lg+) ── */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-60 lg:flex-col bg-white shadow-md">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl transition-transform duration-200 lg:hidden
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="absolute right-3 top-3 rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          aria-label="ปิดเมนู"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <SidebarContent {...sidebarProps} onNavClick={() => setDrawerOpen(false)} />
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col lg:ml-60 min-w-0">

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white px-4 shadow-sm lg:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 active:bg-gray-200"
            aria-label="เปิดเมนู"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800">Hospital HR</span>
        </header>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
