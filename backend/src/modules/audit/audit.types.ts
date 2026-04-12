/**
 * audit.types.ts
 *
 * Pure type definitions for the cross-cutting audit log system.
 * Zero runtime code — follows the same contract as leave.types.ts.
 *
 * DEPENDENCY FIREWALL
 * DO NOT import from any domain module.
 * This file is the root of the audit type graph.
 */
import type { BaseEntity } from '../../shared/storage/JsonStorageService';

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type AuditEntityType = 'SETTINGS' | 'APPROVAL' | 'ATTENDANCE';

/**
 * All auditable actions across the platform.
 *
 * Naming convention:  <VERB>_<SUBJECT>
 *   SETTINGS  — UPDATE_SETTINGS
 *   APPROVAL  — APPROVE_LATE | REJECT_LATE | APPROVE_OT | REJECT_OT
 *   ATTENDANCE — CHECK_IN | CHECK_OUT
 */
export type AuditAction =
  | 'UPDATE_SETTINGS'
  | 'APPROVE_LATE' | 'REJECT_LATE'
  | 'APPROVE_OT'   | 'REJECT_OT'
  | 'CHECK_IN'     | 'CHECK_OUT';

// ─── Storage record ───────────────────────────────────────────────────────────

/**
 * One append-only row per auditable event.
 * Never mutated after creation — see auditLogRepo.ts.
 */
export interface AuditLogRecord extends BaseEntity {
  /** User who triggered the action. */
  actorId:    string;
  /** Human-readable action label. */
  action:     AuditAction;
  /** Domain of the affected entity. */
  entityType: AuditEntityType;
  /** Primary key of the affected entity (omitted for SETTINGS). */
  entityId?:  string;
  /**
   * Structured context — avoid free text.
   * Shape varies per action type; consumers must check `action` before reading.
   */
  metadata:   Record<string, unknown>;
}

// ─── Filter contract ──────────────────────────────────────────────────────────

export interface AuditLogFilters {
  actorId?:    string;
  action?:     AuditAction;
  entityType?: AuditEntityType;
  /** createdAt >= from  (ISO 8601) */
  from?:       string;
  /** createdAt <= to    (ISO 8601) */
  to?:         string;
}

// ─── Metadata shapes (documented, not enforced at runtime) ───────────────────

/** metadata for UPDATE_SETTINGS */
export interface SettingsMetadata {
  changedFields: string[];
  before:        Record<string, unknown>;
  after:         Record<string, unknown>;
}

/** metadata for APPROVE_* / REJECT_* */
export interface ApprovalMetadata {
  decision:     'APPROVED' | 'REJECTED';
  approvalType: 'LATE' | 'OT';
  minutes:      number;
  employeeId:   string;
}

/** metadata for CHECK_IN / CHECK_OUT */
export interface AttendanceMetadata {
  employeeId: string;
}
