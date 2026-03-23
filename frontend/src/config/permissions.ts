/**
 * permissions.ts
 *
 * SINGLE SOURCE OF TRUTH for all frontend role-based visibility decisions.
 *
 * Consumed by:
 *   - ProtectedRoute  (broad route-group gating — auth + role zone)
 *   - PermissionGuard (per-page route gating within an already-authed group)
 *   - BaseLayout      (sidebar nav-item visibility filtering)
 *
 * IMPORTANT: The server remains the enforcement authority.
 * Client-side checks are defense-in-depth, preventing confusing UX for
 * unauthorized direct URL access.  API calls will be rejected by the server
 * regardless of what the client allows.
 *
 * Adding a new page:
 *   1. Add a permission key here with the allowed role set.
 *   2. Add the nav entry in BaseLayout.tsx adminTools using that key.
 *   3. Wrap the Route in App.tsx with <PermissionGuard permission="KEY" />.
 *   No other files need to change.
 */

import type { UserRole } from '@hospital-hr/shared';

// ─── Permission map ───────────────────────────────────────────────────────────

/**
 * Maps permission keys to the set of roles that may access the feature.
 * Roles not listed are implicitly denied.
 */
export const PERMISSIONS = {
  // ── Any authenticated user ───────────────────────────────────────────────
  AUTHENTICATED:         ['super_admin', 'hr', 'manager', 'employee', 'part_time'],

  // ── Manager, HR, Super Admin — admin UI zone ─────────────────────────────
  ADMIN_ACCESS:          ['super_admin', 'hr', 'manager'],
  SCHEDULES_VIEW:        ['super_admin', 'hr', 'manager'],
  ATTENDANCE_VIEW:       ['super_admin', 'hr', 'manager'],
  REPORTS_VIEW:          ['super_admin', 'hr', 'manager'],
  EDIT_REQUESTS_VIEW:    ['super_admin', 'hr', 'manager'],

  // ── HR + Super Admin only ────────────────────────────────────────────────
  EMPLOYEES_MANAGE:      ['super_admin', 'hr'],
  DEPARTMENTS_MANAGE:    ['super_admin', 'hr'],
  BRANCHES_MANAGE:       ['super_admin', 'hr'],
  WORK_PATTERNS_MANAGE:  ['super_admin', 'hr'],
  HOLIDAYS_MANAGE:       ['super_admin', 'hr'],
} as const satisfies Record<string, readonly UserRole[]>;

export type PermissionKey = keyof typeof PERMISSIONS;

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns true if `role` appears in the allowed-role list for `permission`.
 * Safe for null/undefined role — always returns false.
 */
export function hasPermission(
  role: UserRole | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
