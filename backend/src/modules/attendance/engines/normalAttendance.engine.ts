/**
 * normalAttendance.engine.ts
 *
 * Attendance status rules for NORMAL (WORKFORCE) mode.
 * Grace-minute thresholds come from EngineConfig so they are configurable
 * via HR Settings without a redeploy.
 */
import type { AttendanceStatus } from '@hospital-hr/shared';
import type { AttendanceEngine, EngineConfig, LeaveInfo } from './attendance.engine';

// Safe fallbacks used only when no config is passed (e.g. in unit tests).
const DEFAULT_LATE_GRACE        = 15;
const DEFAULT_EARLY_LEAVE_GRACE = 5;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const normalAttendanceEngine: AttendanceEngine = {
  /**
   * Evaluation order:
   *   1. on approved leave           → on_leave   (short-circuit)
   *   2. no scheduled shift today    → pending_approval
   *   3. flexible schedule           → present    (no late check)
   *   4. within grace window         → present
   *   5. past grace window           → late
   */
  resolveCheckInStatus(
    now:          Date,
    workingTimes: { startTime: string; endTime: string } | null,
    leaveInfo?:   LeaveInfo,
    config?:      EngineConfig,
  ): AttendanceStatus {
    if (leaveInfo?.isOnLeave) return 'on_leave';
    if (!workingTimes) return 'pending_approval';

    if (config?.flexible) return 'present';

    const grace        = config?.lateGraceMinutes ?? DEFAULT_LATE_GRACE;
    const shiftStart   = toMinutes(workingTimes.startTime);
    const checkInMins  = now.getHours() * 60 + now.getMinutes();

    return checkInMins > shiftStart + grace ? 'late' : 'present';
  },

  /**
   * Evaluation order:
   *   1. on approved leave           → on_leave   (short-circuit)
   *   2. pending_approval            → untouched  (manager decides)
   *   3. no shift end                → untouched
   *   4. flexible schedule           → unchanged  (no early-leave check)
   *   5. left early (past grace)     → early_leave
   *   6. otherwise                   → unchanged
   */
  resolveCheckOutStatus(
    previousStatus: AttendanceStatus,
    now:            Date,
    endTime?:       string,
    leaveInfo?:     LeaveInfo,
    config?:        EngineConfig,
  ): AttendanceStatus {
    if (leaveInfo?.isOnLeave) return 'on_leave';
    if (previousStatus !== 'present' && previousStatus !== 'late') return previousStatus;
    if (!endTime) return previousStatus;

    if (config?.flexible) return previousStatus;

    const grace        = config?.earlyLeaveGraceMinutes ?? DEFAULT_EARLY_LEAVE_GRACE;
    const shiftEnd     = toMinutes(endTime);
    const effectiveEnd = shiftEnd === 0 ? 24 * 60 : shiftEnd;  // "00:00" = midnight
    const checkOutMins = now.getHours() * 60 + now.getMinutes();

    return checkOutMins < effectiveEnd - grace ? 'early_leave' : previousStatus;
  },
};
