/**
 * leave.audit.ts
 *
 * Append-only audit trail for leave request state changes.
 * Mirrors the org_settings_audit.json pattern established in Phase 5 of the
 * org-settings guardrails implementation.
 *
 * One record per action — never updated, never deleted.
 * Persisted to: leave_audit.json
 */
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { LeaveAuditAction, LeaveAuditRecord, LeaveStatus } from './leave.types';

const auditStore = new JsonRepository<LeaveAuditRecord>('leave_audit');

/**
 * Append a single audit entry.
 * Called by leave.service.ts immediately after every successful status write.
 *
 * @param leaveRequestId  The leave request that changed.
 * @param action          Human-readable action label.
 * @param actorUserId     Who performed the action.
 * @param previousStatus  Status before the write (null on creation).
 * @param newStatus       Status after the write.
 * @param note            Optional free-text note (e.g. rejection reason).
 */
export function appendLeaveAudit(
  leaveRequestId: string,
  action:         LeaveAuditAction,
  actorUserId:    string,
  previousStatus: LeaveStatus | null,
  newStatus:      LeaveStatus,
  note?:          string,
): void {
  auditStore.create({
    leaveRequestId,
    action,
    actorUserId,
    previousStatus,
    newStatus,
    note,
    timestamp: new Date().toISOString(),
  } as Omit<LeaveAuditRecord, 'id' | 'createdAt' | 'updatedAt'>);
}
