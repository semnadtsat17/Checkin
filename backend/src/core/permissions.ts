import type { UserRole } from '@hospital-hr/shared';
import { ROLE_LEVEL } from '@hospital-hr/shared';

/**
 * Role hierarchy — explicit coverage map.
 *
 * Answers: "what roles does this role have permission to act as?"
 *
 * Key rule: EMPLOYEE and PARTTIME are siblings.
 *   MANAGER (and above) can access both employee routes AND part_time routes.
 *   EMPLOYEE  can ONLY access employee routes.
 *   PARTTIME  can ONLY access part_time routes.
 *
 * This is the ONLY place this logic lives. Every permission check calls hasPermission().
 */
export const ROLE_HIERARCHY: Record<UserRole, ReadonlyArray<UserRole>> = {
  super_admin: ['super_admin', 'hr', 'manager', 'employee', 'part_time'],
  hr:          ['hr',          'manager', 'employee', 'part_time'],
  manager:     ['manager',     'employee', 'part_time'],
  employee:    ['employee'],    // cannot access part_time routes
  part_time:   ['part_time'],   // cannot access employee routes
};

/**
 * Core permission check.
 *
 * Returns true when `userRole` is allowed to access a route/resource
 * that requires `requiredRole`.
 *
 * Examples:
 *   hasPermission('manager',  'employee')   → true  (managers cover employees)
 *   hasPermission('employee', 'part_time')  → false (the sibling exception)
 *   hasPermission('part_time','employee')   → false
 *   hasPermission('hr',       'manager')    → true
 *   hasPermission('employee', 'employee')   → true  (same role)
 */
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] as UserRole[]).includes(requiredRole);
}

/**
 * Returns true when `actor` has authority to manage (create/edit/delete)
 * a user with `targetRole`.
 *
 * Rules:
 *   - super_admin can manage everyone, including other super_admins.
 *   - All other roles must both cover the target role AND be strictly higher level.
 *
 * Examples:
 *   canManage('hr',      'manager')    → true  (hr level 4 > manager level 3)
 *   canManage('manager', 'employee')   → true
 *   canManage('manager', 'manager')    → false (same level, not super_admin)
 *   canManage('employee','employee')   → false
 *   canManage('super_admin','super_admin') → true  (special case)
 */
export function canManage(actor: UserRole, target: UserRole): boolean {
  if (actor === 'super_admin') return true;
  return hasPermission(actor, target) && ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/**
 * Returns true when `actor` is strictly more privileged than `target`.
 * Used to prevent privilege escalation (e.g., HR cannot promote someone to super_admin).
 */
export function isHigherThan(actor: UserRole, target: UserRole): boolean {
  if (actor === 'super_admin' && target !== 'super_admin') return true;
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/**
 * Convenience: return all roles a given role can cover.
 * Useful for building filter dropdowns that show only manageable roles.
 */
export function coverableRoles(role: UserRole): ReadonlyArray<UserRole> {
  return ROLE_HIERARCHY[role];
}
