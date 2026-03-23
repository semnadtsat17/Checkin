import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { employeeService } from '../employees/employee.service';
import { ok } from '../../shared/utils/response';

// POST /auth/login  { email, password }
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);
    ok(res, result, 'Login successful');
  } catch (e) { next(e); }
}

// GET /auth/me  — returns the caller's fresh profile
export function me(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, employeeService.findById(req.user!.userId));
  } catch (e) { next(e); }
}

// PATCH /auth/password/:userId  — HR resets an employee's password (returns temp password once)
export async function setPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const tempPassword = await authService.resetPassword(req.params.userId);
    ok(res, { temporaryPassword: tempPassword }, 'Password reset');
  } catch (e) { next(e); }
}

// PATCH /auth/me/password  { currentPassword, newPassword }  — self change
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    ok(res, null, 'Password changed');
  } catch (e) { next(e); }
}
