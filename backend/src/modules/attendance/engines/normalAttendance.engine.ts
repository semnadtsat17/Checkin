/**
 * normalAttendance.engine.ts
 *
 * Attendance status rules for NORMAL (WORKFORCE) mode.
 *
 * This file is the ONLY place that owns NORMAL-mode check-in/check-out logic.
 * Logic is copied verbatim from the original private helpers in
 * attendance.service.ts (determineCheckInStatus / shouldMarkEarlyLeave) so
 * there is zero behaviour change.
 *
 * ALLOWED imports:
 *   @hospital-hr/shared types
 *   Built-in Node.js primitives
 *
 * FORBIDDEN imports (would couple to org-settings or create circular deps):
 *   orgSettings.runtime   — engines are mode-agnostic; the registry picks them
 *   schedule.service      — engines receive already-resolved times as arguments
 *   extra-work.service
 *   approval modules
 */
import type { AttendanceStatus } from '@hospital-hr/shared';
import type { AttendanceEngine } from './attendance.engine';

// ─── Constants ────────────────────────────────────────────────────────────────
// Must stay in sync with the hardcoded values in attendance.service.ts.
// These are compile-time constants that change only with a deliberate deploy.

const LATE_GRACE_MINUTES        = 15;
const EARLY_LEAVE_GRACE_MINUTES = 5;

// ─── Internal helpers (mirrors attendance.service.ts private helpers) ─────────

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ─── Engine implementation ────────────────────────────────────────────────────

export const normalAttendanceEngine: AttendanceEngine = {
  /**
   * Mirrors determineCheckInStatus() from attendance.service.ts exactly.
   *
   *   no scheduled shift today → pending_approval
   *   on time (within grace)   → present
   *   past grace period        → late
   */
  resolveCheckInStatus(
    now:          Date,
    workingTimes: { startTime: string; endTime: string } | null,
  ): AttendanceStatus {
    if (!workingTimes) return 'pending_approval';

    const shiftStartMins = toMinutes(workingTimes.startTime);
    const checkInMins    = now.getHours() * 60 + now.getMinutes();
    return checkInMins > shiftStartMins + LATE_GRACE_MINUTES ? 'late' : 'present';
  },

  /**
   * Mirrors shouldMarkEarlyLeave() from attendance.service.ts exactly.
   *
   *   pending_approval  → untouched (manager decides)
   *   no shift end      → untouched
   *   left ≥5 min early → early_leave
   *   otherwise         → unchanged
   */
  resolveCheckOutStatus(
    previousStatus: AttendanceStatus,
    now:            Date,
    endTime?:       string,
  ): AttendanceStatus {
    // pending_approval records are not touched — manager will decide the final status.
    if (previousStatus !== 'present' && previousStatus !== 'late') return previousStatus;
    if (!endTime) return previousStatus;

    const shiftEndMins = toMinutes(endTime);
    // "00:00" end means midnight — treat as 24 * 60
    const effectiveEnd = shiftEndMins === 0 ? 24 * 60 : shiftEndMins;
    const checkOutMins = now.getHours() * 60 + now.getMinutes();

    return checkOutMins < effectiveEnd - EARLY_LEAVE_GRACE_MINUTES
      ? 'early_leave'
      : previousStatus;
  },
};
