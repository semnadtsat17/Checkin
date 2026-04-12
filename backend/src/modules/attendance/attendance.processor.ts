/**
 * attendance.processor.ts  —  Thin Delegator
 *
 * Public API surface for the attendance service layer.
 * Contains ZERO business logic — it exists solely to:
 *
 *   1. Present a stable function-based API to attendance.service.ts
 *      (so the service never references engines directly).
 *   2. Delegate every call to the engine returned by the registry.
 *
 * All status computation lives in:
 *   engines/normalAttendance.engine.ts  — NORMAL mode logic
 *   engines/simpleAttendance.engine.ts  — SIMPLE mode logic
 *   engines/attendanceEngine.registry.ts — selects the active engine
 *
 * If you find business logic creeping back into this file, move it to
 * the appropriate engine instead.
 */
import type { AttendanceStatus } from '@hospital-hr/shared';
import type { LeaveInfo } from './engines/attendance.engine';
import { getAttendanceEngine } from './engines/attendanceEngine.registry';

/**
 * Determine the check-in status for a new attendance record.
 * leaveInfo is passed through to the engine unchanged — no logic here.
 */
export function resolveCheckInStatus(
  checkInTime: Date,
  times:       { startTime: string; endTime: string } | null,
  leaveInfo?:  LeaveInfo,
): AttendanceStatus {
  return getAttendanceEngine().resolveCheckInStatus(checkInTime, times, leaveInfo);
}

/**
 * Determine the final status after check-out.
 * leaveInfo is passed through to the engine unchanged — no logic here.
 */
export function resolveCheckOutStatus(
  currentStatus: AttendanceStatus,
  checkOutTime:  Date,
  shiftEnd?:     string,
  leaveInfo?:    LeaveInfo,
): AttendanceStatus {
  return getAttendanceEngine().resolveCheckOutStatus(currentStatus, checkOutTime, shiftEnd, leaveInfo);
}
