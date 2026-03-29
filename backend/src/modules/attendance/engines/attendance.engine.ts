/**
 * attendance.engine.ts
 *
 * Contract every attendance engine must satisfy.
 *
 * An engine encapsulates the status-determination rules for a single
 * organisation mode (NORMAL or SIMPLE).  The registry selects the active
 * engine at runtime; the processor delegates to it.  Neither the service
 * layer nor the route handlers ever reference a concrete engine directly.
 *
 * Design intent:
 *   Adding a new mode == writing a new file that implements this interface.
 *   Changing NORMAL logic == editing normalAttendance.engine.ts only.
 *   Changing SIMPLE logic == editing simpleAttendance.engine.ts only.
 *   The two files are physically isolated — no shared mutable state.
 */
import type { AttendanceStatus } from '@hospital-hr/shared';

export interface AttendanceEngine {
  /**
   * Determine the status to stamp on a new check-in record.
   *
   * @param now          Wall-clock time of the check-in action.
   * @param workingTimes Resolved shift window for this employee today,
   *                     or null when no schedule exists.
   */
  resolveCheckInStatus(
    now:          Date,
    workingTimes: { startTime: string; endTime: string } | null,
  ): AttendanceStatus;

  /**
   * Determine whether a check-out should change the record's status.
   *
   * @param previousStatus  The status already stored on the record.
   * @param now             Wall-clock time of the check-out action.
   * @param endTime         HH:mm shift end from the resolver, or undefined
   *                        when no schedule exists.
   */
  resolveCheckOutStatus(
    previousStatus: AttendanceStatus,
    now:            Date,
    endTime?:       string,
  ): AttendanceStatus;
}
