import bcrypt from 'bcryptjs';
import { signToken } from '../../shared/middleware/auth';
import { AppError } from '../../shared/middleware/errorHandler';
import { employeeService, sanitizeUser } from '../employees/employee.service';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import type { UserRecord } from '../employees/employee.service';
import type { UserProfile, Branch } from '@hospital-hr/shared';
import { hasHrAccess } from '../../core/permissions';
import type { AuthPayload } from '../../types/express';

const SALT_ROUNDS = 10;

// Re-uses the same employees collection as employee.service
const store:        IRepository<UserRecord> = new JsonRepository<UserRecord>('employees');
const branchStore:  IRepository<Branch>    = new JsonRepository<Branch>('branches');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMP_PWD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generatePassword(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += TEMP_PWD_CHARS[Math.floor(Math.random() * TEMP_PWD_CHARS.length)];
  }
  return result;
}

/** Slim branch shape returned to the frontend branch-picker. */
export interface BranchSlim {
  id:       string;
  nameTh:   string;
  nameEn:   string;
  province: string | undefined;
}

function toBranchSlim(b: Branch): BranchSlim {
  return { id: b.id, nameTh: b.nameTh, nameEn: b.nameEn, province: b.province };
}

/** Branches the user can access based on their role. */
function accessibleBranches(record: UserRecord): Branch[] {
  const all = branchStore.findAll(b => b.isActive);
  if (record.role === 'super_admin' || record.role === 'admin') return all;
  return all.filter(b => b.id === record.branchId);
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface LoginResponse {
  token:              string;
  profile:            UserProfile;
  branches:           BranchSlim[];
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
      branches:           accessibleBranches(record).map(toBranchSlim),
      mustChangePassword: record.mustChangePassword ?? false,
    };
  },

  /**
   * Exchange current token for a branch-scoped token.
   * super_admin/admin can switch to any active branch.
   * Others can only select their own branch.
   */
  selectBranch(userId: string, branchId: string): { token: string; profile: UserProfile } {
    const record = store.findById(userId);
    if (!record || !record.isActive) {
      throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    }

    const branch = branchStore.findById(branchId);
    if (!branch || !branch.isActive) {
      throw new AppError(404, 'Branch not found', 'NOT_FOUND');
    }

    // Non-admin users can only select their own branch
    if (!hasHrAccess(record.role) || (record.role === 'hr_branch' || record.role === 'manager')) {
      if (record.branchId !== branchId) {
        throw new AppError(403, 'You do not have access to this branch', 'FORBIDDEN');
      }
    }

    const payload: AuthPayload = {
      userId:       record.id,
      role:         record.role,
      branchId,
      departmentId: record.departmentId,
      employeeCode: record.employeeCode,
    };

    return { token: signToken(payload), profile: sanitizeUser(record) };
  },

  /** Returns branches accessible to the given user. */
  listBranches(userId: string): BranchSlim[] {
    const record = store.findById(userId);
    if (!record) throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    return accessibleBranches(record).map(toBranchSlim);
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
