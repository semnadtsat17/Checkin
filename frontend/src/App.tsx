import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrgSettingsProvider } from './context/OrgSettingsContext';
import { hasPermission }  from './config/permissions';
import ProtectedRoute, { PermissionGuard } from './components/ProtectedRoute';
import LoginPage           from './pages/LoginPage';
import BranchSelectPage    from './pages/BranchSelectPage';
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
import BranchesPage        from './pages/admin/BranchesPage';
import HRSettings          from './pages/admin/HRSettings';
import ApprovalDashboard  from './pages/manager/ApprovalDashboard';
import EmployeeDashboard  from './pages/employee/EmployeeDashboard';
import LeavePage          from './pages/employee/LeavePage';
import LeaveApprovalsPage from './pages/admin/LeaveApprovalsPage';
import OvertimeApprovalsPage from './pages/admin/OvertimeApprovalsPage';
import OvertimePage        from './pages/employee/OvertimePage';
import ShiftTransferPage  from './pages/employee/ShiftTransferPage';


function RootRedirect() {
  const { isAuthenticated, isLoading, user, mustChangePassword, pendingBranches } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (pendingBranches)  return <Navigate to="/select-branch" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Navigate to={hasPermission(user?.role, 'ADMIN_ACCESS') ? '/dashboard' : '/employee-dashboard'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* OrgSettingsProvider lives inside AuthProvider so it can read
            isAuthenticated before fetching. Fetches once on login, resets
            on logout. All routes have access via useOrgSettings(). */}
        <OrgSettingsProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/select-branch"   element={<BranchSelectPage />} />
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
              <Route path="/branches" element={<BranchesPage />} />
            </Route>
            <Route element={<PermissionGuard permission="WORK_PATTERNS_MANAGE" />}>
              <Route path="/work-schedule-patterns" element={<SubRolesPage />} />
            </Route>
            <Route element={<PermissionGuard permission="HOLIDAYS_MANAGE" />}>
              <Route path="/holidays" element={<HolidaysPage />} />
            </Route>
            <Route element={<PermissionGuard permission="APPROVALS_VIEW" />}>
              <Route path="/approval-dashboard" element={<ApprovalDashboard />} />
            </Route>
            <Route element={<PermissionGuard permission="LEAVE_APPROVALS_VIEW" />}>
              <Route path="/leave-approvals" element={<LeaveApprovalsPage />} />
            </Route>
            <Route element={<PermissionGuard permission="APPROVALS_VIEW" />}>
              <Route path="/overtime-approvals" element={<OvertimeApprovalsPage />} />
            </Route>
            <Route element={<PermissionGuard permission="SETTINGS_MANAGE" />}>
              <Route path="/hr-settings" element={<HRSettings />} />
            </Route>
          </Route>

          {/* ── All authenticated users (employee-style bottom nav) ── */}
          <Route element={<ProtectedRoute />}>
            <Route path="/employee-dashboard" element={<EmployeeDashboard />} />
            <Route path="/checkin"      element={<CheckInPage />} />
            <Route path="/history"      element={<HistoryPage />} />
            <Route path="/summary"      element={<SummaryPage />} />
            <Route path="/my-schedule"  element={<MySchedulePage />} />
            <Route path="/leave"        element={<LeavePage />} />
            <Route path="/overtime"        element={<OvertimePage />} />
            <Route path="/shift-transfer" element={<ShiftTransferPage />} />
            <Route path="/profile"         element={<ProfilePage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </OrgSettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
