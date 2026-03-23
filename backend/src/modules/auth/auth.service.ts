import bcrypt from 'bcryptjs';
import { signToken } from '../../shared/middleware/auth';
import { AppError } from '../../shared/middleware/errorHandler';
import { employeeService, sanitizeUser } from '../employees/employee.service';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import type { UserRecord } from '../employees/employee.service';
import type { User } from '@hospital-hr/shared';
import type { AuthPayload } from '../../types/express';

const SALT_ROUNDS = 10;

// Re-uses the same employees collection as employee.service
const store: IRepository<UserRecord> = new JsonRepository<UserRecord>('employees');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMP_PWD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generatePassword(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += TEMP_PWD_CHARS[Math.floor(Math.random() * TEMP_PWD_CHARS.length)];
  }
  return result;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface LoginResponse {
  token:              string;
  profile:            User;
  mustChangePassword: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const authService = {

  /**
   * Authenticate an employee by email + plain-text password.
   * Returns a signed JWT and the sanitized user profile on success.
   *
   * Throws 401 for any invalid credential (no info leakage about which field
   * was wrong).
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    if (!email?.trim() || !password) {
      throw new AppError(400, 'email and password are required', 'VALIDATION_ERROR');
    }

    const record = employeeService.findByEmail(email.trim().toLowerCase());

    if (!record || !record.isActive) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!record.passwordHash) {
      throw new AppError(401, 'Account has no password set — contact HR', 'NO_PASSWORD');
    }

    const match = await bcrypt.compare(password, record.passwordHash);
    if (!match) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const payload: AuthPayload = {
      userId:       record.id,
      role:         record.role,
      branchId:     record.branchId,
      departmentId: record.departmentId,
      employeeCode: record.employeeCode,
    };

    return {
      token:              signToken(payload),
      profile:            sanitizeUser(record),
      mustChangePassword: record.mustChangePassword ?? false,
    };
  },

  /**
   * HR generates a new temporary password for any employee.
   * Returns the plain-text password once — it is never stored in plain text.
   * Sets mustChangePassword = true so the employee is forced to change it.
   */
  async resetPassword(targetUserId: string): Promise<string> {
    const record = store.findById(targetUserId);
    if (!record) {
      throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    }

    const tempPassword = generatePassword(8);
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    store.updateById(targetUserId, { passwordHash, mustChangePassword: true });
    return tempPassword;
  },

  /**
   * Authenticated employee changes their own password.
   * Requires the current password for verification.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!currentPassword || !newPassword) {
      throw new AppError(400, 'currentPassword and newPassword are required', 'VALIDATION_ERROR');
    }
    if (newPassword.length < 8) {
      throw new AppError(400, 'New password must be at least 8 characters', 'VALIDATION_ERROR');
    }

    const record = store.findById(userId);
    if (!record) {
      throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    }

    if (!record.passwordHash) {
      throw new AppError(400, 'No password is set — contact HR', 'NO_PASSWORD');
    }

    const match = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!match) {
      throw new AppError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    store.updateById(userId, { passwordHash, mustChangePassword: false });
  },
};
