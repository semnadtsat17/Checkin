import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { hasPermission }  from './config/permissions';
import ProtectedRoute, { PermissionGuard } from './components/ProtectedRoute';
import LoginPage           from './pages/LoginPage';
import ChangePasswordPage  from './pages/ChangePasswordPage';
import CheckInPage         from './pages/CheckInPage';
import HistoryPage         from './pages/employee/HistoryPage';
import SummaryPage         from './pages/employee/SummaryPage';
import ProfilePage         from './pages/employee/ProfilePage';
import MySchedulePage      from './pages/employee/MySchedulePage';
import DashboardPage       from './pages/admin/DashboardPage';
import DepartmentsPage     from './pages/admin/DepartmentsPage';
import EmployeesPage       from './pages/admin/EmployeesPage';
import SubRolesPage        from './pages/admin/SubRolesPage';
import SchedulesPage         from './pages/admin/SchedulesPage';
import ScheduleApprovalPage from './pages/admin/ScheduleApprovalPage';
import ReportsPage           from './pages/admin/ReportsPage';
import ApprovalsPage       from './pages/admin/ApprovalsPage';
import EditRequestsPage    from './pages/admin/EditRequestsPage';
import HolidaysPage        from './pages/admin/HolidaysPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-primary-700">{title}</h1>
        <p className="mt-2 text-gray-400">Coming soon</p>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { isAuthenticated, isLoading, user, mustChangePassword } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={hasPermission(user?.role, 'ADMIN_ACCESS') ? '/dashboard' : '/checkin'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/"                element={<RootRedirect />} />

          {/* ── Manager+ admin zone ── */}
          <Route element={<ProtectedRoute permission="ADMIN_ACCESS" />}>
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/attendance"    element={<ApprovalsPage />} />
            <Route path="/schedules"                        element={<SchedulesPage />} />
            <Route path="/schedules/approval/:scheduleId"  element={<ScheduleApprovalPage />} />
            <Route path="/edit-requests" element={<EditRequestsPage />} />
            <Route path="/reports"       element={<ReportsPage />} />

            {/* ── HR + Super Admin only ── */}
            <Route element={<PermissionGuard permission="EMPLOYEES_MANAGE" />}>
              <Route path="/employees" element={<EmployeesPage />} />
            </Route>
            <Route element={<PermissionGuard permission="DEPARTMENTS_MANAGE" />}>
              <Route path="/departments" element={<DepartmentsPage />} />
            </Route>
            <Route element={<PermissionGuard permission="BRANCHES_MANAGE" />}>
              <Route path="/branches" element={<Placeholder title="Branches" />} />
            </Route>
            <Route element={<PermissionGuard permission="WORK_PATTERNS_MANAGE" />}>
              <Route path="/work-schedule-patterns" element={<SubRolesPage />} />
            </Route>
            <Route element={<PermissionGuard permission="HOLIDAYS_MANAGE" />}>
              <Route path="/holidays" element={<HolidaysPage />} />
            </Route>
          </Route>

          {/* ── All authenticated users (employee-style bottom nav) ── */}
          <Route element={<ProtectedRoute />}>
            <Route path="/checkin"      element={<CheckInPage />} />
            <Route path="/history"      element={<HistoryPage />} />
            <Route path="/summary"      element={<SummaryPage />} />
            <Route path="/my-schedule"  element={<MySchedulePage />} />
            <Route path="/profile"      element={<ProfilePage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
