/**
 * BaseLayout — unified responsive layout for ALL roles.
 *
 * Desktop (≥ lg / 1024px):
 *   All roles → LEFT SIDEBAR, no bottom nav
 *
 * Mobile / Tablet (< lg):
 *   Employee/Part-time → bottom nav (5 tabs incl. โปรไฟล์)
 *   Manager+ → bottom nav ONLY on /checkin (4 tabs, no โปรไฟล์)
 *              sidebar accessible via hamburger
 *
 * Profile placement:
 *   Sidebar header (under user name) for all roles
 *   Bottom nav includes it only for employees on mobile
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@hospital-hr/shared';
import { useAuth } from '../../context/AuthContext';
import { hasPermission, type PermissionKey } from '../../config/permissions';
import { useTranslation } from '../../i18n/useTranslation';

// ─── SVG icon helper ──────────────────────────────────────────────────────────

function Ico({ d, cls = 'h-5 w-5' }: { d: string; cls?: string }) {
  return (
    <svg className={`${cls} shrink-0`} fill="none" viewBox="0 0 24 24"
         stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ─── Path constants ────────────────────────────────────────────────────────────

const P = {
  checkin:     'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  history:     'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  summary:     'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  schedule:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  profile:     'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  profileCirc: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  dashboard:   'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  attendance:  'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  schedMgr:    'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  editReq:     'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  reports:     'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  employees:   'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  departments: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  branches:    'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  subRoles:    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  holidays:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  hamburger:   'M4 6h16M4 12h16M4 18h16',
  close:       'M6 18L18 6M6 6l12 12',
  globe:       'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129',
  logout:      'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
};

// ─── Sidebar nav-link ──────────────────────────────────────────────────────────

function SideLink({
  to, icon, children, onClick,
}: {
  to: string; icon: string; children: React.ReactNode; onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
         ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
      }
    >
      <Ico d={icon} />
      {children}
    </NavLink>
  );
}

// ─── Shared sidebar header (user card + profile link) ─────────────────────────

function SidebarUserHeader({
  fullName,
  employeeCode,
  roleLabel,
  onNavClick,
}: {
  fullName:      string;
  employeeCode?: string;
  roleLabel:     string;
  onNavClick?:   () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 border-b border-gray-100 px-4 py-4 space-y-3">
      {/* Avatar + user info */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                        bg-primary-100 text-base font-bold text-primary-700">
          {fullName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800">{fullName}</p>
          <p className="truncate text-xs text-gray-400">{employeeCode}</p>
          <p className="truncate text-xs text-primary-600 font-medium">{roleLabel}</p>
        </div>
      </div>
      {/* Profile link — right under the user name */}
      <NavLink
        to="/profile"
        onClick={onNavClick}
        className={({ isActive }) =>
          `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
           ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'}`
        }
      >
        <Ico d={P.profileCirc} cls="h-4 w-4" />
        {t('nav.profile')}
      </NavLink>
    </div>
  );
}

// ─── Sidebar footer (lang toggle + logout) ────────────────────────────────────

function SidebarFooter({
  locale, onToggleLocale, onLogout,
}: {
  locale: string; onToggleLocale: () => void; onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 border-t border-gray-100 p-2 space-y-0.5">
      <button
        onClick={onToggleLocale}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        <Ico d={P.globe} />
        {locale === 'th' ? 'English' : 'ภาษาไทย'}
      </button>
      <button
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        <Ico d={P.logout} />
        {t('auth.logout')}
      </button>
    </div>
  );
}

// ─── Employee sidebar (desktop only for employee/part_time) ───────────────────

function EmployeeSidebarContent({
  fullName, employeeCode, roleLabel, locale, onToggleLocale, onLogout,
}: {
  fullName: string; employeeCode?: string; roleLabel: string;
  locale: string; onToggleLocale: () => void; onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600">
          <Ico d={P.departments} cls="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-800">Hospital HR</span>
      </div>
      {/* User header with profile */}
      <SidebarUserHeader
        fullName={fullName} employeeCode={employeeCode} roleLabel={roleLabel}
      />
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <SideLink to="/checkin"     icon={P.checkin}>  {t('attendance.checkIn')}</SideLink>
        <SideLink to="/my-schedule" icon={P.schedule}> {t('nav.schedule')}</SideLink>
        <SideLink to="/summary"     icon={P.summary}>  {t('attendance.summary.title')}</SideLink>
        <SideLink to="/history"     icon={P.history}>  {t('attendance.history')}</SideLink>
      </nav>
      <SidebarFooter locale={locale} onToggleLocale={onToggleLocale} onLogout={onLogout} />
    </div>
  );
}

// ─── Admin sidebar ─────────────────────────────────────────────────────────────

function AdminSidebarContent({
  userRole, fullName, employeeCode, roleLabel, locale, onToggleLocale, onLogout, onNavClick,
}: {
  userRole: UserRole | undefined; fullName: string; employeeCode?: string; roleLabel: string;
  locale: string; onToggleLocale: () => void; onLogout: () => void; onNavClick?: () => void;
}) {
  const { t } = useTranslation();

  const adminTools = ([
    { path: '/dashboard',              label: t('nav.dashboard'),     icon: P.dashboard,   permission: 'ADMIN_ACCESS' },
    { path: '/attendance',             label: t('nav.attendance'),    icon: P.attendance,  permission: 'ATTENDANCE_VIEW' },
    { path: '/schedules',              label: 'จัดตารางเวร',          icon: P.schedMgr,    permission: 'SCHEDULES_VIEW' },
    { path: '/edit-requests',          label: t('editRequest.title'), icon: P.editReq,     permission: 'EDIT_REQUESTS_VIEW' },
    { path: '/reports',                label: t('nav.reports'),       icon: P.reports,     permission: 'REPORTS_VIEW' },
    { path: '/employees',              label: t('nav.employees'),     icon: P.employees,   permission: 'EMPLOYEES_MANAGE' },
    { path: '/departments',            label: t('nav.departments'),   icon: P.departments, permission: 'DEPARTMENTS_MANAGE' },
    { path: '/branches',               label: t('nav.branches'),      icon: P.branches,    permission: 'BRANCHES_MANAGE' },
    { path: '/work-schedule-patterns', label: t('workPattern.title'), icon: P.subRoles,    permission: 'WORK_PATTERNS_MANAGE' },
    { path: '/holidays',               label: t('holiday.title'),     icon: P.holidays,    permission: 'HOLIDAYS_MANAGE' },
  ] satisfies Array<{ path: string; label: string; icon: string; permission: PermissionKey }>)
    .filter(i => hasPermission(userRole, i.permission));

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-100 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600">
          <Ico d={P.departments} cls="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-800 leading-tight">
          Hospital HR
          <span className="block text-xs font-normal text-gray-400">Management</span>
        </span>
      </div>

      {/* User header with profile */}
      <SidebarUserHeader
        fullName={fullName} employeeCode={employeeCode} roleLabel={roleLabel}
        onNavClick={onNavClick}
      />

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {/* Employee shortcuts */}
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">พนักงาน</p>
        <SideLink to="/checkin"     icon={P.checkin}  onClick={onNavClick}>{t('attendance.checkIn')}</SideLink>
        <SideLink to="/my-schedule" icon={P.schedule} onClick={onNavClick}>{t('nav.schedule')}</SideLink>
        <SideLink to="/summary"     icon={P.summary}  onClick={onNavClick}>{t('attendance.summary.title')}</SideLink>
        <SideLink to="/history"     icon={P.history}  onClick={onNavClick}>{t('attendance.history')}</SideLink>

        {/* Admin tools */}
        {adminTools.length > 0 && (
          <>
            <div className="my-2 border-t border-gray-100" />
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Admin</p>
            {adminTools.map(item => (
              <SideLink key={item.path} to={item.path} icon={item.icon} onClick={onNavClick}>
                {item.label}
              </SideLink>
            ))}
          </>
        )}
      </nav>

      <SidebarFooter locale={locale} onToggleLocale={onToggleLocale} onLogout={onLogout} />
    </div>
  );
}

// ─── Bottom tab bar ────────────────────────────────────────────────────────────

type TabDef = { path: string; labelKey: Parameters<ReturnType<typeof useTranslation>['t']>[0]; icon: string };

const EMPLOYEE_TABS: TabDef[] = [
  { path: '/checkin',     labelKey: 'attendance.checkIn',       icon: P.checkin },
  { path: '/history',     labelKey: 'attendance.history',       icon: P.history },
  { path: '/summary',     labelKey: 'attendance.summary.title', icon: P.summary },
  { path: '/my-schedule', labelKey: 'nav.schedule',             icon: P.schedule },
  { path: '/profile',     labelKey: 'nav.profile',              icon: P.profile },
];

const ADMIN_TABS: TabDef[] = [
  { path: '/checkin',     labelKey: 'attendance.checkIn',       icon: P.checkin },
  { path: '/history',     labelKey: 'attendance.history',       icon: P.history },
  { path: '/summary',     labelKey: 'attendance.summary.title', icon: P.summary },
  { path: '/my-schedule', labelKey: 'nav.schedule',             icon: P.schedule },
];

function BottomTabBar({ tabs }: { tabs: TabDef[] }) {
  const { t } = useTranslation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-stretch border-t border-gray-200 bg-white lg:hidden">
      {tabs.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors
             ${isActive ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`
          }
        >
          {({ isActive }) => (
            <>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className={isActive ? 'text-primary-600' : ''}>{t(tab.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ─── Role label helper ────────────────────────────────────────────────────────

function useRoleLabel(role?: string): string {
  const { t } = useTranslation();
  if (!role) return '';
  const key = `roles.${role}` as Parameters<ReturnType<typeof useTranslation>['t']>[0];
  return t(key);
}

// ─── BaseLayout ────────────────────────────────────────────────────────────────

export default function BaseLayout() {
  const { user, logout } = useAuth();
  const { locale, changeLocale } = useTranslation();
  const navigate   = useNavigate();
  const location   = useLocation();
  const roleLabel  = useRoleLabel(user?.role);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = hasPermission(user?.role, 'ADMIN_ACCESS');
  const isCheckin = location.pathname === '/checkin';

  // Mobile bottom nav: employees always, admins only on /checkin
  const showMobileBottomNav = !isAdmin || isCheckin;
  const bottomTabs = isAdmin ? ADMIN_TABS : EMPLOYEE_TABS;

  const fullName = user
    ? (locale === 'th'
        ? `${user.firstNameTh} ${user.lastNameTh}`
        : `${user.firstName || user.firstNameTh} ${user.lastName || user.lastNameTh}`)
    : '';

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const sharedProps = {
    fullName,
    employeeCode:   user?.employeeCode,
    roleLabel,
    locale,
    onToggleLocale: () => changeLocale(locale === 'th' ? 'en' : 'th'),
    onLogout:       handleLogout,
  };

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ══ DESKTOP SIDEBAR (hidden on mobile) ══ */}

      {isAdmin ? (
        /* Admin desktop sidebar */
        <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-60 lg:flex-col bg-white shadow-md">
          <AdminSidebarContent userRole={user?.role} {...sharedProps} />
        </aside>
      ) : (
        /* Employee desktop sidebar — replaces bottom nav on desktop */
        <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-60 lg:flex-col bg-white shadow-md">
          <EmployeeSidebarContent {...sharedProps} />
        </aside>
      )}

      {/* ══ MOBILE ADMIN DRAWER ══ */}
      {isAdmin && (
        <>
          {/* Backdrop */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}
          {/* Drawer */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl
                        transition-transform duration-200 lg:hidden
                        ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              aria-label="ปิดเมนู"
            >
              <Ico d={P.close} />
            </button>
            <AdminSidebarContent
              userRole={user?.role}
              {...sharedProps}
              onNavClick={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      )}

      {/* ══ MAIN COLUMN ══ */}
      <div className={[
        'flex min-w-0 flex-1 flex-col',
        'lg:ml-60',                                           // sidebar offset on desktop (all roles)
        showMobileBottomNav ? 'pb-16 lg:pb-0' : 'lg:pb-0',  // bottom-nav clearance on mobile only
      ].join(' ')}>

        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-white px-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            {/* Hamburger: mobile admin only */}
            {isAdmin && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 active:bg-gray-200 lg:hidden"
                aria-label="เปิดเมนู"
              >
                <Ico d={P.hamburger} />
              </button>
            )}
            {/* User info */}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                {fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-none">{fullName}</p>
                <p className="text-xs text-gray-400 mt-0.5">{user?.employeeCode}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => changeLocale(locale === 'th' ? 'en' : 'th')}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              {locale === 'th' ? 'EN' : 'TH'}
            </button>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `rounded-md p-1.5 hover:bg-gray-100 ${isActive ? 'text-primary-600' : 'text-gray-400'}`
              }
              title={useRoleLabel(user?.role)}
            >
              <Ico d={P.profileCirc} cls="h-5 w-5" />
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* ══ MOBILE BOTTOM NAV ══ */}
      {showMobileBottomNav && <BottomTabBar tabs={bottomTabs} />}
    </div>
  );
}
