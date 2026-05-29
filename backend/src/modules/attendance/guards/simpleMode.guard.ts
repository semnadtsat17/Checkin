/**
 * simpleMode.guard.ts
 *
 * Reusable domain guard for SIMPLE attendance mode.
 *
 * Usage — call at the entry boundary of any mutating operation that is
 * disallowed in SIMPLE mode BEFORE any business logic runs:
 *
 *   assertNotSimpleMode('OT creation');
 *
 * Throws AppError(403, ..., 'SIMPLE_MODE_RESTRICTED') so the global
 * errorHandler converts it to a standard { success: false, code, error }
 * JSON response.  No changes to route handlers required.
 *
 * Guard is intentionally NOT tied to Express — it is a plain function so
 * it can be called from service layers, batch jobs, or tests alike.
 *
 * SAFE OPERATIONS (do NOT add a guard here):
 *   • check-in / check-out (attendance.service)
 *   • attendance reads    (attendanceService.list / getToday / …)
 *   • monthly summary     (getMySummary)
 *   • reporting           (report.service)
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { getEffectiveBranchSettings } from '../../branch-settings/branchSettings.runtime';

/**
 * Throws SIMPLE_MODE_RESTRICTED (403) when the branch is in SIMPLE attendance mode.
 *
 * @param operation  Human-readable name for the blocked action.
 * @param branchId   Branch to check; when omitted the guard is a no-op (safe default).
 */
export function assertNotSimpleMode(operation: string, branchId?: string): void {
  if (!branchId) return;
  const mode = getEffectiveBranchSettings(branchId).attendanceMode;
  if (mode === 'SIMPLE') {
    throw new AppError(
      403,
      `'${operation}' is not available in SIMPLE attendance mode`,
      'SIMPLE_MODE_RESTRICTED',
    );
  }
}
