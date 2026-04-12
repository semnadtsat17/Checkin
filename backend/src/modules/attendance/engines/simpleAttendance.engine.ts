/**
 * simpleAttendance.engine.ts
 *
 * Attendance status rules for SIMPLE mode.
 *
 * SIMPLE mode guarantees (hard constraints — never relax without a design decision):
 *   • Every check-in produces status = 'present', unconditionally.
 *   • Check-out never changes the status (no early_leave, no lateness).
 *   • scheduleHours = 0  (enforced by computeMonthlySummary via status, not here)
 *   • otHours = 0        (no extra-work records can be created in SIMPLE mode)
 *   • No lateness evaluation.
 *   • No absence evaluation.
 *   • No approval workflow triggered.
 *   • Snapshots (check-in/out photos) work unchanged — they are orthogonal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPENDENCY FIREWALL — DO NOT IMPORT ANY OF THE FOLLOWING:
 *
 *   ✗  schedule.service      (no schedule resolution in SIMPLE mode)
 *   ✗  extra-work.service    (no OT in SIMPLE mode)
 *   ✗  schedule-approvals    (no approval flow in SIMPLE mode)
 *   ✗  orgSettings.runtime   (engines are mode-agnostic)
 *
 * If you find an import to any of the above in this file: FAIL THE BUILD.
 * The engine interface receives pre-resolved times as arguments precisely so
 * that this file never needs to call a schedule service.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ALLOWED imports:
 *   @hospital-hr/shared types
 *   Built-in Node.js primitives
 */
import type { AttendanceStatus } from '@hospital-hr/shared';
import type { AttendanceEngine, LeaveInfo } from './attendance.engine';

export const simpleAttendanceEngine: AttendanceEngine = {
  /**
   * In SIMPLE mode every check-in is 'present' — unless the employee has
   * an approved leave, in which case 'on_leave' takes precedence.
   * workingTimes is intentionally ignored (SIMPLE has no schedule concept).
   */
  resolveCheckInStatus(
    _now:          Date,
    _workingTimes: { startTime: string; endTime: string } | null,
    leaveInfo?:    LeaveInfo,
  ): AttendanceStatus {
    if (leaveInfo?.isOnLeave) return 'on_leave';
    return 'present';
  },

  /**
   * In SIMPLE mode check-out never alters the status — except when the
   * existing record is 'on_leave', which is preserved as-is.
   * (on_leave is already a terminal status for this engine.)
   */
  resolveCheckOutStatus(
    previousStatus: AttendanceStatus,
    _now:           Date,
    _endTime?:      string,
    _leaveInfo?:    LeaveInfo,
  ): AttendanceStatus {
    return previousStatus;
  },
};
