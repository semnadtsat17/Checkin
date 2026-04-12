/**
 * attendanceProcessor.ts
 *
 * Service-layer integration of attendance business rules.
 *
 * This file is the ONLY place that composes isLate / isEarlyLeave /
 * calculateOT / approvalUtils into structured results.  It contains NO
 * duplicated logic — all predicates and OT math delegate to the utility layer.
 *
 * Responsibilities:
 *   - Call utility functions with the correct arguments
 *   - Compute derived minute-deltas from the same operands those utilities use
 *   - Derive approval statuses from already-computed results
 *   - Return plain, typed result objects (no side effects, no persistence)
 *
 * Non-responsibilities:
 *   - Database writes
 *   - Persisting approval records
 *   - API routing
 */
import type { AttendanceSettings } from '../utils/attendanceSettings.validation';
import { isLate }        from '../utils/isLate';
import { isEarlyLeave }  from '../utils/isEarlyLeave';
import { calculateOT }   from '../utils/calculateOT';
import { timeToMinutes, dateToMinutes } from '../utils/timeUtils';
import {
  resolveLateApprovalStatus,
  resolveOtApprovalStatus,
  type ApprovalStatus,
} from '../utils/approvalUtils';

// ─── Re-export for consumers ──────────────────────────────────────────────────
// Callers import ApprovalStatus from here rather than reaching into approvalUtils.
export type { ApprovalStatus };

// ─── I/O types ────────────────────────────────────────────────────────────────

export type CheckInInput = {
  employeeId:  string;
  checkInTime: Date;
  settings:    AttendanceSettings;
};

export type CheckInResult = {
  isLate:             boolean;
  lateMinutes:        number;          // 0 when not late
  lateApprovalStatus: ApprovalStatus;  // NONE | PENDING | APPROVED
};

export type CheckOutInput = {
  employeeId:   string;
  checkOutTime: Date;
  settings:     AttendanceSettings;
};

export type CheckOutResult = {
  isEarlyLeave:      boolean;
  earlyLeaveMinutes: number;           // 0 when not early
  otMinutes:         number;           // 0 when no OT
  otApprovalStatus:  ApprovalStatus;   // NONE | PENDING | APPROVED
};

// ─── Check-in ─────────────────────────────────────────────────────────────────

/**
 * Processes a check-in event and returns late status, minute delta, and
 * the derived approval status — all from the same pass.
 *
 * lateMinutes derivation (only when isLate() === true):
 *   lateMinutes = checkInMins − (startMins + graceMinutes)
 *
 * lateApprovalStatus is derived AFTER lateMinutes — it never alters the
 * calculation, only labels its outcome.
 */
export function processCheckIn(input: CheckInInput): CheckInResult {
  const { checkInTime, settings } = input;

  const late = isLate(checkInTime, settings);

  if (!late) {
    return {
      isLate:             false,
      lateMinutes:        0,
      lateApprovalStatus: 'NONE',
    };
  }

  const startMins   = timeToMinutes(settings.workSchedule.startTime);
  const checkInMins = dateToMinutes(checkInTime);
  const grace       = settings.lateRule.graceMinutes;
  const lateMinutes = checkInMins - (startMins + grace);

  return {
    isLate:             true,
    lateMinutes,
    lateApprovalStatus: resolveLateApprovalStatus(true, settings),
  };
}

// ─── Check-out ────────────────────────────────────────────────────────────────

/**
 * Processes a check-out event and returns early-leave status, OT minutes,
 * and the derived OT approval status — all from the same pass.
 *
 * earlyLeaveMinutes derivation (only when isEarlyLeave() === true):
 *   earlyLeaveMinutes = (endMins − graceMinutes) − checkOutMins
 *
 * otApprovalStatus is derived from the computed otMinutes value — it never
 * alters the calculation, only labels its outcome.
 *
 * Mutual exclusion: early leave and OT cannot coexist.  When isEarlyLeave
 * is true, otMinutes is 0, so otApprovalStatus will always be NONE.
 */
export function processCheckOut(input: CheckOutInput): CheckOutResult {
  const { checkOutTime, settings } = input;

  const earlyLeave = isEarlyLeave(checkOutTime, settings);
  const otMinutes  = calculateOT(checkOutTime, settings);

  if (!earlyLeave) {
    return {
      isEarlyLeave:      false,
      earlyLeaveMinutes: 0,
      otMinutes,
      otApprovalStatus:  resolveOtApprovalStatus(otMinutes, settings),
    };
  }

  const endMins           = timeToMinutes(settings.workSchedule.endTime);
  const checkOutMins      = dateToMinutes(checkOutTime);
  const grace             = settings.earlyLeaveRule.graceMinutes;
  const earlyLeaveMinutes = (endMins - grace) - checkOutMins;

  return {
    isEarlyLeave:      true,
    earlyLeaveMinutes,
    otMinutes:         0,
    otApprovalStatus:  'NONE',   // early leave → otMinutes is 0 → always NONE
  };
}
