/**
 * isLate.ts
 *
 * Determines whether a check-in time is considered "late" based on
 * the organisation's attendance settings.
 *
 * This is a pure, settings-driven function — no hard-coded constants.
 * The engine layer may delegate to this function instead of embedding
 * its own grace-minute logic.
 */
import type { AttendanceSettings } from './attendanceSettings.validation';
import { timeToMinutes, dateToMinutes } from './timeUtils';

/**
 * Returns true when the employee checked in after the allowed grace window.
 *
 * Business rules (evaluated in order):
 *   1. Flexible schedule  → never late  (short-circuit)
 *   2. checkInMins > startTimeMins + graceMinutes → LATE
 *   3. checkInMins ≤ startTimeMins + graceMinutes → NOT late (equal = on time)
 *
 * @param checkInTime  Wall-clock moment of the check-in action.
 * @param settings     Organisation-wide attendance settings (already validated).
 */
export function isLate(checkInTime: Date, settings: AttendanceSettings): boolean {
  if (settings.workSchedule.flexible) {
    return false;
  }

  const startMins  = timeToMinutes(settings.workSchedule.startTime);
  const checkInMins = dateToMinutes(checkInTime);
  const grace       = settings.lateRule.graceMinutes;

  return checkInMins > startMins + grace;
}
