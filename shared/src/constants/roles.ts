import type { UserRole } from '../types';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  HR_BRANCH:   'hr_branch',
  MANAGER:     'manager',
  EMPLOYEE:    'employee',
  PARTTIME:    'part_time',
} as const satisfies Record<string, UserRole>;

/**
 * Numeric levels — ordering only, not for permission checks.
 * admin and hr_branch are siblings at level 4 with different scope.
 */
export const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 5,
  admin:       4,   // all-branch HR (formerly hr_global)
  hr_branch:   4,   // branch-scoped HR (peer of admin, different scope)
  manager:     3,
  employee:    2,
  part_time:   2,
};

export const ROLE_ORDER: UserRole[] = [
  'super_admin',
  'admin',
  'hr_branch',
  'manager',
  'employee',
  'part_time',
];
