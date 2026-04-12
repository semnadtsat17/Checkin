/**
 * isEarlyLeave.ts
 *
 * Determines whether a check-out time is considered "early leave" based on
 * the organisation's attendance settings.
 *
 * This is a pure, settings-driven function — no hard-coded constants.
 * Mirror of isLate.ts: same structure, same boundary convention.
 */
import type { AttendanceSettings } from './attendanceSettings.validation';
import { timeToMinutes, dateToMinutes } from './timeUtils';

/**
 * Returns true when the employee checked out before the allowed grace window.
 *
 * Business rules (evaluated in order):
 *   1. Flexible schedule  → never early leave  (short-circuit)
 *   2. checkOutMins < endTimeMins - graceMinutes → EARLY LEAVE
 *   3. checkOutMins ≥ endTimeMins - graceMinutes → NOT early leave (equal = on time)
 *
 * @param checkOutTime  Wall-clock moment of the check-out action.
 * @param settings      Organisation-wide attendance settings (already validated).
 */
export function isEarlyLeave(checkOutTime: Date, settings: AttendanceSettings): boolean {
  if (settings.workSchedule.flexible) {
    return false;
  }

  const endMins         = timeToMinutes(settings.workSchedule.endTime);
  const checkOutMins    = dateToMinutes(checkOutTime);
  const grace           = settings.earlyLeaveRule.graceMinutes;

  return checkOutMins < endMins - grace;
}
