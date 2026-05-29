import type { UserRole } from '@hospital-hr/shared';
import { ROLE_LEVEL } from '@hospital-hr/shared';

/**
 * Role hierarchy — explicit coverage map.
 *
 * admin     = all-branch HR (formerly hr_global) — same privilege level as hr_branch
 * hr_branch = branch-scoped HR — same privilege level as admin, different scope
 *
 * Both admin and hr_branch cover manager and below.
 * scope enforcement (which branch) is done at the route/service layer.
 */
export const ROLE_HIERARCHY: Record<UserRole, ReadonlyArray<UserRole>> = {
  super_admin: ['super_admin', 'admin', 'hr_branch', 'manager', 'employee', 'part_time'],
  admin:       ['admin',       'hr_branch', 'manager', 'employee', 'part_time'],
  hr_branch:   ['hr_branch',   'manager', 'employee', 'part_time'],
  manager:     ['manager',     'employee', 'part_time'],
  employee:    ['employee'],
  part_time:   ['part_time'],
};

/**
 * Core permission check.
 * Returns true when `userRole` is allowed to access a route requiring `requiredRole`.
 */
export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] as UserRole[]).includes(requiredRole);
}

/**
 * Convenience: check if a role has HR-level access (admin or hr_branch).
 * Use this instead of hasPermission(role, 'hr') throughout the codebase.
 */
export function hasHrAccess(userRole: UserRole): boolean {
  return userRole === 'super_admin' || userRole === 'admin' || userRole === 'hr_branch';
}

/**
 * Returns true when `actor` has authority to manage a user with `targetRole`.
 */
export function canManage(actor: UserRole, target: UserRole): boolean {
  if (actor === 'super_admin') return true;
  return hasPermission(actor, target) && ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/**
 * Returns true when `actor` is strictly more privileged than `target`.
 */
export function isHigherThan(actor: UserRole, target: UserRole): boolean {
  if (actor === 'super_admin' && target !== 'super_admin') return true;
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

export function coverableRoles(role: UserRole): ReadonlyArray<UserRole> {
  return ROLE_HIERARCHY[role];
}
