import type { UserRole } from '@hospital-hr/shared';

/**
 * JWT payload attached to req.user after the auth middleware runs.
 * Kept minimal — only what every middleware/controller needs instantly.
 * Full user record is fetched from storage only when required.
 */
export interface AuthPayload {
  userId:       string;
  role:         UserRole;
  branchId:     string;
  departmentId: string;
  employeeCode: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
