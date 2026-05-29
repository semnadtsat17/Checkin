/**
 * attendance.engine.ts
 *
 * Contract every attendance engine must satisfy.
 * EngineConfig carries the configurable thresholds so engines never import
 * orgSettings.runtime directly (keeps engines mode-agnostic and testable).
 */
import type { AttendanceStatus } from '@hospital-hr/shared';

export interface LeaveInfo {
  isOnLeave:  boolean;
  leaveType?: string;
}

/** Runtime-supplied thresholds passed into engine methods. */
export interface EngineConfig {
  /** Minutes after shift start before check-in is "late". */
  lateGraceMinutes:       number;
  /** Minutes before shift end before check-out is "early leave". */
  earlyLeaveGraceMinutes: number;
  /** Whether work schedule is flexible (no late/early-leave penalty). */
  flexible:               boolean;
}

export interface AttendanceEngine {
  /**
   * Determine the status to stamp on a new check-in record.
   *
   * @param now          Wall-clock time of the check-in action.
   * @param workingTimes Resolved shift window, or null when no schedule exists.
   * @param leaveInfo    Optional leave context; engines MUST return 'on_leave' when isOnLeave=true.
   * @param config       Runtime thresholds; engines fall back to safe defaults when omitted.
   */
  resolveCheckInStatus(
    now:          Date,
    workingTimes: { startTime: string; endTime: string } | null,
    leaveInfo?:   LeaveInfo,
    config?:      EngineConfig,
  ): AttendanceStatus;

  /**
   * Determine whether a check-out should change the record's status.
   *
   * @param previousStatus  Status already stored on the record.
   * @param now             Wall-clock time of the check-out action.
   * @param endTime         HH:mm shift end, or undefined when no schedule.
   * @param leaveInfo       Optional leave context.
   * @param config          Runtime thresholds.
   */
  resolveCheckOutStatus(
    previousStatus: AttendanceStatus,
    now:            Date,
    endTime?:       string,
    leaveInfo?:     LeaveInfo,
    config?:        EngineConfig,
  ): AttendanceStatus;
}
