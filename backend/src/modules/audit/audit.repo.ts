/**
 * audit.repo.ts
 *
 * Append-only storage layer for audit log entries.
 * Backed by JsonRepository — swap to any IRepository adapter without
 * touching this file or its callers.
 *
 * Collection file: <dataDir>/audit_logs.json
 *
 * IMMUTABILITY CONTRACT
 * Only createLog() and getLogs() are exposed.
 * There is no update, delete, or soft-delete — audit records must be permanent.
 */
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { AuditLogRecord, AuditLogFilters } from './audit.types';

// ─── Store ────────────────────────────────────────────────────────────────────

const store = new JsonRepository<AuditLogRecord>('audit_logs');

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Append a new audit entry.
 * Returns the persisted record (with auto-generated id / timestamps).
 *
 * Fire-and-forget in most callers — the return value is only used in tests.
 */
export function createLog(
  data: Omit<AuditLogRecord, 'id' | 'createdAt' | 'updatedAt'>,
): AuditLogRecord {
  return store.create(data);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return all matching audit entries, newest first.
 *
 * All filters are optional and ANDed together.
 * Date range uses lexicographic ISO comparison (works because createdAt is always
 * full ISO 8601, e.g. "2024-03-15T09:00:00.000Z").
 */
export function getLogs(filters: AuditLogFilters = {}): AuditLogRecord[] {
  return store
    .findAll((r) => {
      if (filters.actorId    && r.actorId    !== filters.actorId)    return false;
      if (filters.action     && r.action     !== filters.action)     return false;
      if (filters.entityType && r.entityType !== filters.entityType) return false;
      if (filters.from       && r.createdAt  <  filters.from)        return false;
      if (filters.to         && r.createdAt  >  filters.to)          return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Wipe all records. Exposed for tests only — never call in production code. */
export function _clearForTests(): void {
  store.clear();
}
