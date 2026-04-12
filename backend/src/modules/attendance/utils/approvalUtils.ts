/**
 * approvalUtils.ts
 *
 * Pure helpers that derive an ApprovalStatus from already-computed results
 * and settings.  Contains ZERO business logic of its own — it only maps the
 * boolean/numeric outputs of the calculation layer to the approval vocabulary.
 *
 * Design intent:
 *   - One function per approval domain (late, OT)
 *   - Each function is a straight decision table — no side effects, no I/O
 *   - The attendanceProcessor is the ONLY caller; nothing else should import these
 */
import type { AttendanceSettings } from './attendanceSettings.validation';

// ─── Shared type ──────────────────────────────────────────────────────────────

/**
 * NONE      — the event is not subject to approval (not late / no OT)
 * PENDING   — approval is required and has not yet been given
 * APPROVED  — either approval is not required, or a manager has approved
 * REJECTED  — a manager has explicitly rejected (set externally, not here)
 */
export type ApprovalStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

// ─── Late approval ────────────────────────────────────────────────────────────

/**
 * Derives the late-arrival approval status.
 *
 * Decision table:
 *   isLate = false                               → NONE
 *   isLate = true  AND requireManagerApproval    → PENDING
 *   isLate = true  AND !requireManagerApproval   → APPROVED
 *
 * @param isLate   Output of isLate() / processCheckIn().isLate
 * @param settings Organisation-wide attendance settings (already validated).
 */
export function resolveLateApprovalStatus(
  isLate:   boolean,
  settings: AttendanceSettings,
): ApprovalStatus {
  if (!isLate) return 'NONE';
  return settings.requireManagerApproval ? 'PENDING' : 'APPROVED';
}

// ─── OT approval ──────────────────────────────────────────────────────────────

/**
 * Derives the overtime approval status.
 *
 * Decision table:
 *   otMinutes === 0                              → NONE
 *   otMinutes > 0  AND requireApproval           → PENDING
 *   otMinutes > 0  AND !requireApproval          → APPROVED
 *
 * Note: otRule.enabled is implicitly satisfied — calculateOT() already
 * returns 0 when OT is disabled, so the otMinutes === 0 branch covers it.
 *
 * @param otMinutes  Output of calculateOT() / processCheckOut().otMinutes
 * @param settings   Organisation-wide attendance settings (already validated).
 */
export function resolveOtApprovalStatus(
  otMinutes: number,
  settings:  AttendanceSettings,
): ApprovalStatus {
  if (otMinutes === 0) return 'NONE';
  return settings.otRule.requireApproval ? 'PENDING' : 'APPROVED';
}
