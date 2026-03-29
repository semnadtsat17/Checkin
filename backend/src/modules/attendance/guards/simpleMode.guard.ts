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
import { isSimpleMode } from '../../org-settings/orgSettings.runtime';

/**
 * Throws SIMPLE_MODE_RESTRICTED (403) when the organisation is in SIMPLE mode.
 *
 * @param operation  Human-readable name for the blocked action, used in the
 *                   error message returned to the client.
 */
export function assertNotSimpleMode(operation: string): void {
  if (isSimpleMode()) {
    throw new AppError(
      403,
      `'${operation}' is not available in SIMPLE attendance mode`,
      'SIMPLE_MODE_RESTRICTED',
    );
  }
}
