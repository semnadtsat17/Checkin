import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasPermission, type PermissionKey } from '../config/permissions';
import BaseLayout from './layouts/BaseLayout';

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

interface Props {
  /**
   * Permission required to enter this route group.
   * Defaults to 'AUTHENTICATED' (any logged-in user regardless of role).
   */
  permission?: PermissionKey;
}

/**
 * Guards a group of routes.
 *
 * - Not authenticated → /login (preserving the attempted path)
 * - Authenticated but lacks permission → role-appropriate home page
 * - Authorized → renders BaseLayout (which contains the Outlet for nested routes)
 */
export default function ProtectedRoute({ permission = 'AUTHENTICATED' }: Props) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!hasPermission(user?.role, permission)) {
    const home = hasPermission(user?.role, 'ADMIN_ACCESS') ? '/dashboard' : '/checkin';
    return <Navigate to={home} replace />;
  }

  return <BaseLayout />;
}

// ─── PermissionGuard ──────────────────────────────────────────────────────────

/**
 * Fine-grained permission guard for individual pages nested inside a
 * ProtectedRoute group that has broader permission requirements.
 *
 * Renders nested routes when the user has the required permission;
 * redirects to their role-appropriate home page otherwise.
 *
 * Usage in App.tsx:
 *   <Route element={<PermissionGuard permission="HOLIDAYS_MANAGE" />}>
 *     <Route path="/holidays" element={<HolidaysPage />} />
 *   </Route>
 */
export function PermissionGuard({ permission }: { permission: PermissionKey }) {
  const { user } = useAuth();
  if (hasPermission(user?.role, permission)) return <Outlet />;
  const home = hasPermission(user?.role, 'ADMIN_ACCESS') ? '/dashboard' : '/checkin';
  return <Navigate to={home} replace />;
}
