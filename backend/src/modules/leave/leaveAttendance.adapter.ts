/**
 * leaveAttendance.adapter.ts
 *
 * THE ONLY BRIDGE between the leave domain and the attendance domain.
 *
 * Contract: this file only READS leave data and translates it into a
 * shape that attendance code can consume.  It NEVER writes to attendance.
 *
 * ─── DEPENDENCY FIREWALL ───────────────────────────────────────────────────
 * Allowed imports:
 *   ✓  leave.types          (type definitions)
 *   ✓  leave.service        (findApprovedLeaveForDate — read-only)
 *
 * DO NOT import:
 *   ✗  attendance engines
 *   ✗  attendance.service
 *   ✗  schedule.service
 *   ✗  extra-work.service
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Integration path (future phases):
 *
 *   Phase 4 (current)  — attendance.service.ts calls this adapter
 *                         as a read-only context hook; nothing acts on it yet.
 *
 *   Phase 5 (future)   — AttendanceEngine interface gains optional leaveInfo
 *                         param; engines use it to return 'on_leave' status.
 *
 *   Phase 6 (future)   — LEAVE_APPROVED event subscriber auto-marks past
 *                         attendance records as 'on_leave' (retroactive).
 *
 * Adding new attendance behaviour from leave data:
 *   1. Extend LeaveStatusForDate if needed.
 *   2. Consume the richer shape in the engine (via the processor).
 *   3. Touch ONLY the engine files — this adapter stays unchanged.
 */
import type { LeaveType } from './leave.types';
import { findApprovedLeaveForDate } from './leave.service';

// ─── Return shape ─────────────────────────────────────────────────────────────

export interface LeaveStatusForDate {
  /** True when an HR-approved leave covers this date for this employee. */
  isOnLeave:  boolean;
  /** Present when isOnLeave is true. */
  leaveType?: LeaveType;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Determine whether a given employee is on approved leave on a specific date.
 *
 * Called by attendance.service.ts as a context hook before status computation.
 * Synchronous — JSON read is in-process, no network I/O.
 *
 * @param userId  The employee to check.
 * @param date    YYYY-MM-DD calendar date.
 */
export function getLeaveStatusForDate(
  userId: string,
  date:   string,
): LeaveStatusForDate {
  const leave = findApprovedLeaveForDate(userId, date);

  if (!leave) return { isOnLeave: false };

  return {
    isOnLeave: true,
    leaveType: leave.leaveType,
  };
}
