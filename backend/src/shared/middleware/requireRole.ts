import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@hospital-hr/shared';
import { hasPermission } from '../../core/permissions';
import { AppError } from './errorHandler';

/**
 * requireRole(role | role[])
 *
 * Middleware factory that guards routes by role.
 * Must be used AFTER the `authenticate` middleware (which sets req.user).
 *
 * Passing a single role:
 *   requireRole('manager')
 *   → passes for super_admin, hr, manager
 *   → fails for employee (403) and part_time (403)
 *
 * Passing an array (OR logic — satisfying ANY is enough):
 *   requireRole(['hr', 'manager'])
 *   → passes for super_admin, hr, manager
 *   → fails for employee, part_time
 *
 * The sibling exception is enforced inside hasPermission():
 *   requireRole('employee') → part_time FAILS
 *   requireRole('part_time') → employee FAILS
 *
 * Usage:
 *   // Route-level guard
 *   router.get('/employees', authenticate, requireRole('hr'), listEmployees)
 *
 *   // Router-level guard (all routes in this router require manager+)
 *   router.use(authenticate, requireRole('manager'))
 *
 *   // Either HR or Manager can approve OT
 *   router.patch('/overtime/:id/approve', authenticate, requireRole(['hr', 'manager']), approveOT)
 */
export function requireRole(
  required: UserRole | UserRole[]
): (req: Request, res: Response, next: NextFunction) => void {
  const roles: UserRole[] = Array.isArray(required) ? required : [required];

  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    // authenticate middleware must run first
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    const { role: userRole } = req.user;

    // Pass if user's role has permission for AT LEAST ONE of the required roles
    const allowed = roles.some((r) => hasPermission(userRole, r));

    if (!allowed) {
      return next(
        new AppError(
          403,
          `Role '${userRole}' is not allowed to access this resource`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}

/**
 * requireSelf(paramName?)
 *
 * Passes only when the authenticated user is accessing their own resource,
 * OR the user has manager-level access or above.
 *
 * Useful for: GET /users/:userId/attendance (employee sees own, manager sees all)
 *
 * @param paramName - URL param that holds the target userId (default: 'userId')
 */
export function requireSelf(paramName = 'userId') {
  return function selfGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
    }

    const { userId, role } = req.user;
    const targetId = req.params[paramName];

    // Manager and above can access anyone's resource
    if (hasPermission(role, 'manager')) return next();

    // Employee/parttime can only access their own
    if (userId === targetId) return next();

    return next(new AppError(403, 'Access to this resource is not allowed', 'FORBIDDEN'));
  };
}
