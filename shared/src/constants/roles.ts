import type { UserRole } from '../types';

/**
 * Role constants — use these instead of bare strings to avoid typos.
 *
 * ROLES.MANAGER === 'manager'
 */
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  HR:          'hr',
  MANAGER:     'manager',
  EMPLOYEE:    'employee',
  PARTTIME:    'part_time',
} as const satisfies Record<string, UserRole>;

/**
 * Numeric levels used for ordering only — do NOT use for permission checks.
 * Use hasPermission() in the backend permissions module for that.
 *
 * EMPLOYEE and PARTTIME intentionally share level 2 — they are siblings,
 * neither inherits from the other.
 */
export const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 5,
  hr:          4,
  manager:     3,
  employee:    2,
  part_time:   2, // peer of employee, NOT subordinate
};

/**
 * Display-order array, highest privilege first.
 * Useful for dropdowns, sort orders, etc.
 */
export const ROLE_ORDER: UserRole[] = [
  'super_admin',
  'hr',
  'manager',
  'employee',
  'part_time',
];
