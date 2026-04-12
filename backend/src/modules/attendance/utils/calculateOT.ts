/**
 * calculateOT.ts
 *
 * Calculates overtime minutes earned after a check-out.
 *
 * This is a pure, settings-driven function — no hard-coded constants.
 * Approval logic (otRule.requireApproval) is intentionally out of scope here;
 * this function only answers "how many OT minutes were worked?"
 */
import type { AttendanceSettings } from './attendanceSettings.validation';
import { timeToMinutes, dateToMinutes } from './timeUtils';

/**
 * Returns the number of overtime minutes worked, or 0 if no OT applies.
 *
 * Business rules (evaluated in order):
 *   1. otRule.enabled === false → 0  (short-circuit)
 *   2. otStartMins = endTimeMins + startAfterMinutes
 *   3. checkOutMins ≤ otStartMins   → 0  (boundary is inclusive — equal = no OT)
 *   4. checkOutMins > otStartMins   → checkOutMins - otStartMins
 *
 * Note: flexible schedule does NOT cancel OT — OT is still calculated normally.
 *
 * @param checkOutTime  Wall-clock moment of the check-out action.
 * @param settings      Organisation-wide attendance settings (already validated).
 * @returns             OT duration in whole minutes (always >= 0).
 */
export function calculateOT(checkOutTime: Date, settings: AttendanceSettings): number {
  if (!settings.otRule.enabled) {
    return 0;
  }

  const endMins      = timeToMinutes(settings.workSchedule.endTime);
  const checkOutMins = dateToMinutes(checkOutTime);
  const otStartMins  = endMins + settings.otRule.startAfterMinutes;

  if (checkOutMins <= otStartMins) {
    return 0;
  }

  return checkOutMins - otStartMins;
}
