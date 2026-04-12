/**
 * audit.service.ts
 *
 * High-level helpers for appending audit entries.
 *
 * Each function accepts domain-level inputs (not raw DB shapes) and constructs
 * the structured metadata internally.  Callers never build metadata objects
 * directly — that keeps the metadata contract in one place.
 *
 * Integration points:
 *   attendanceApprovalService.reviewApproval()  → logApprovalDecision()
 *   org-settings.router PATCH                   → logSettingsUpdate()
 *   attendance.controller checkIn / checkOut    → logAttendanceEvent()
 */
import { createLog, getLogs } from './audit.repo';
import type {
  AuditAction,
  AuditLogFilters,
  AuditLogRecord,
  ApprovalMetadata,
  AttendanceMetadata,
  SettingsMetadata,
} from './audit.types';

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Append an UPDATE_SETTINGS entry.
 *
 * @param actorId       userId of the super_admin who made the change
 * @param changedFields List of top-level field names that actually changed
 * @param before        Full settings snapshot before the write
 * @param after         Full settings snapshot after the write
 */
export function logSettingsUpdate(
  actorId:       string,
  changedFields: string[],
  before:        Record<string, unknown>,
  after:         Record<string, unknown>,
): AuditLogRecord {
  const metadata: SettingsMetadata = { changedFields, before, after };
  return createLog({
    actorId,
    action:     'UPDATE_SETTINGS',
    entityType: 'SETTINGS',
    // entityId is omitted — there is only one settings record in the system
    metadata:   metadata as unknown as Record<string, unknown>,
  });
}

// ─── Approvals ────────────────────────────────────────────────────────────────

/**
 * Append an APPROVE_* or REJECT_* entry.
 *
 * @param actorId      userId of the reviewing manager
 * @param approvalId   Primary key of the AttendanceApprovalRecord
 * @param decision     'APPROVED' or 'REJECTED'
 * @param approvalType 'LATE' or 'OT'
 * @param minutes      Duration stored on the approval record
 * @param employeeId   Employee who originally triggered the approval
 */
export function logApprovalDecision(
  actorId:      string,
  approvalId:   string,
  decision:     'APPROVED' | 'REJECTED',
  approvalType: 'LATE' | 'OT',
  minutes:      number,
  employeeId:   string,
): AuditLogRecord {
  const action: AuditAction =
    decision === 'APPROVED'
      ? approvalType === 'LATE' ? 'APPROVE_LATE' : 'APPROVE_OT'
      : approvalType === 'LATE' ? 'REJECT_LATE'  : 'REJECT_OT';

  const metadata: ApprovalMetadata = { decision, approvalType, minutes, employeeId };
  return createLog({
    actorId,
    action,
    entityType: 'APPROVAL',
    entityId:   approvalId,
    metadata:   metadata as unknown as Record<string, unknown>,
  });
}

// ─── Attendance ───────────────────────────────────────────────────────────────

/**
 * Append a CHECK_IN or CHECK_OUT entry.
 *
 * @param actorId      userId of the employee (same as employeeId)
 * @param action       'CHECK_IN' or 'CHECK_OUT'
 * @param attendanceId Primary key of the created/updated AttendanceRecord
 */
export function logAttendanceEvent(
  actorId:      string,
  action:       'CHECK_IN' | 'CHECK_OUT',
  attendanceId: string,
): AuditLogRecord {
  const metadata: AttendanceMetadata = { employeeId: actorId };
  return createLog({
    actorId,
    action,
    entityType: 'ATTENDANCE',
    entityId:   attendanceId,
    metadata:   metadata as unknown as Record<string, unknown>,
  });
}

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * Return audit entries matching the given filters, newest first.
 * All filters are optional and ANDed together.
 */
export function queryLogs(filters: AuditLogFilters = {}): AuditLogRecord[] {
  return getLogs(filters);
}
