/**
 * attendance.processor.ts  —  Thin Delegator
 *
 * Reads runtime settings and passes an EngineConfig to the active engine.
 * All status computation lives in the engine files — no logic here.
 */
import type { AttendanceStatus } from '@hospital-hr/shared';
import type { EngineConfig, LeaveInfo } from './engines/attendance.engine';
import { getAttendanceEngine } from './engines/attendanceEngine.registry';
import { getEffectiveBranchSettings } from '../branch-settings/branchSettings.runtime';

/** Build an EngineConfig from branch settings. */
function buildConfig(branchId: string): EngineConfig {
  const s = getEffectiveBranchSettings(branchId);
  return {
    lateGraceMinutes:       s.lateGraceMinutes,
    earlyLeaveGraceMinutes: s.earlyLeaveGraceMinutes,
    flexible:               false,
  };
}

export function resolveCheckInStatus(
  checkInTime: Date,
  times:       { startTime: string; endTime: string } | null,
  leaveInfo?:  LeaveInfo,
  branchId?:   string,
): AttendanceStatus {
  const config = branchId ? buildConfig(branchId) : undefined;
  return getAttendanceEngine(branchId).resolveCheckInStatus(checkInTime, times, leaveInfo, config);
}

export function resolveCheckOutStatus(
  currentStatus: AttendanceStatus,
  checkOutTime:  Date,
  shiftEnd?:     string,
  leaveInfo?:    LeaveInfo,
  branchId?:     string,
): AttendanceStatus {
  const config = branchId ? buildConfig(branchId) : undefined;
  return getAttendanceEngine(branchId).resolveCheckOutStatus(currentStatus, checkOutTime, shiftEnd, leaveInfo, config);
}
