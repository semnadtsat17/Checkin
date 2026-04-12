/**
 * auditLog.test.ts
 *
 * Tests the audit log system introduced in Phase 9.
 *
 * Sections:
 *   A. Repository — createLog() / getLogs() raw CRUD
 *   B. Service    — logSettingsUpdate()
 *   C. Service    — logApprovalDecision()
 *   D. Service    — logAttendanceEvent()
 *   E. Filtering  — actorId / action / entityType / date range
 *   F. Integration — reviewApproval() side-effects
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createLog, getLogs, _clearForTests } from '../modules/audit/audit.repo';
import {
  logSettingsUpdate,
  logApprovalDecision,
  logAttendanceEvent,
  queryLogs,
} from '../modules/audit/audit.service';
import {
  createApproval,
  _clearForTests as clearApprovals,
} from '../modules/attendance/repositories/attendanceApprovalRepo';
import { reviewApproval } from '../modules/attendance/services/attendanceApprovalService';

// ─── Reset audit log before every test ───────────────────────────────────────
// Only the audit store is cleared globally.
// Approval records are cleared only inside section F to avoid racing with
// attendanceApprovalPersistence.test.ts, which runs in a parallel worker and
// owns the same attendance_approvals.json file.

beforeEach(() => {
  _clearForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. Repository
// ─────────────────────────────────────────────────────────────────────────────

describe('auditLogRepo', () => {
  describe('createLog()', () => {
    it('persists a record and returns it with auto-generated id / timestamps', () => {
      const log = createLog({
        actorId:    'usr-1',
        action:     'CHECK_IN',
        entityType: 'ATTENDANCE',
        entityId:   'att-1',
        metadata:   { employeeId: 'usr-1' },
      });

      expect(log.id).toBeTruthy();
      expect(log.actorId).toBe('usr-1');
      expect(log.action).toBe('CHECK_IN');
      expect(log.entityType).toBe('ATTENDANCE');
      expect(log.entityId).toBe('att-1');
      expect(log.createdAt).toBeTruthy();
    });

    it('stores metadata exactly as supplied', () => {
      const meta = { decision: 'APPROVED', approvalType: 'OT', minutes: 30, employeeId: 'emp-1' };
      const log  = createLog({
        actorId:    'mgr-1',
        action:     'APPROVE_OT',
        entityType: 'APPROVAL',
        entityId:   'apr-1',
        metadata:   meta as Record<string, unknown>,
      });

      expect(log.metadata).toMatchObject(meta);
    });
  });

  describe('getLogs()', () => {
    it('returns empty array when no logs exist', () => {
      expect(getLogs()).toHaveLength(0);
    });

    it('returns all logs when no filter supplied', () => {
      createLog({ actorId: 'a', action: 'CHECK_IN',  entityType: 'ATTENDANCE', metadata: {} });
      createLog({ actorId: 'b', action: 'APPROVE_OT', entityType: 'APPROVAL',   metadata: {} });
      expect(getLogs()).toHaveLength(2);
    });

    it('returns logs newest first', async () => {
      createLog({ actorId: 'a', action: 'CHECK_IN',   entityType: 'ATTENDANCE', metadata: {} });
      // Small delay so createdAt differs
      await new Promise((r) => setTimeout(r, 5));
      createLog({ actorId: 'b', action: 'CHECK_OUT',  entityType: 'ATTENDANCE', metadata: {} });

      const logs = getLogs();
      expect(logs[0].action).toBe('CHECK_OUT');
      expect(logs[1].action).toBe('CHECK_IN');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Service — logSettingsUpdate
// ─────────────────────────────────────────────────────────────────────────────

describe('logSettingsUpdate()', () => {
  it('creates an UPDATE_SETTINGS log with correct entityType', () => {
    const before = { attendanceMode: 'WORKFORCE', requireManagerApproval: true };
    const after  = { attendanceMode: 'SIMPLE',    requireManagerApproval: true };

    const log = logSettingsUpdate('admin-1', ['attendanceMode'], before, after);

    expect(log.action).toBe('UPDATE_SETTINGS');
    expect(log.entityType).toBe('SETTINGS');
    expect(log.actorId).toBe('admin-1');
    // Settings has no single entityId
    expect(log.entityId).toBeUndefined();
  });

  it('stores changedFields, before, and after in metadata', () => {
    const before = { attendanceMode: 'WORKFORCE' };
    const after  = { attendanceMode: 'SIMPLE'    };

    const log = logSettingsUpdate('admin-1', ['attendanceMode'], before, after);

    expect(log.metadata.changedFields).toEqual(['attendanceMode']);
    expect(log.metadata.before).toMatchObject(before);
    expect(log.metadata.after).toMatchObject(after);
  });

  it('records multiple changed fields', () => {
    const before = { attendanceMode: 'WORKFORCE', requireManagerApproval: true  };
    const after  = { attendanceMode: 'SIMPLE',    requireManagerApproval: false };

    const log = logSettingsUpdate(
      'admin-1',
      ['attendanceMode', 'requireManagerApproval'],
      before,
      after,
    );

    expect((log.metadata.changedFields as string[])).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Service — logApprovalDecision
// ─────────────────────────────────────────────────────────────────────────────

describe('logApprovalDecision()', () => {
  it('maps APPROVED + LATE → APPROVE_LATE', () => {
    const log = logApprovalDecision('mgr-1', 'apr-1', 'APPROVED', 'LATE', 15, 'emp-1');
    expect(log.action).toBe('APPROVE_LATE');
  });

  it('maps APPROVED + OT → APPROVE_OT', () => {
    const log = logApprovalDecision('mgr-1', 'apr-1', 'APPROVED', 'OT', 45, 'emp-1');
    expect(log.action).toBe('APPROVE_OT');
  });

  it('maps REJECTED + LATE → REJECT_LATE', () => {
    const log = logApprovalDecision('mgr-1', 'apr-1', 'REJECTED', 'LATE', 10, 'emp-1');
    expect(log.action).toBe('REJECT_LATE');
  });

  it('maps REJECTED + OT → REJECT_OT', () => {
    const log = logApprovalDecision('mgr-1', 'apr-1', 'REJECTED', 'OT', 60, 'emp-1');
    expect(log.action).toBe('REJECT_OT');
  });

  it('sets entityType=APPROVAL and entityId to the approval record id', () => {
    const log = logApprovalDecision('mgr-1', 'apr-99', 'APPROVED', 'OT', 30, 'emp-2');
    expect(log.entityType).toBe('APPROVAL');
    expect(log.entityId).toBe('apr-99');
  });

  it('stores structured metadata', () => {
    const log = logApprovalDecision('mgr-1', 'apr-1', 'APPROVED', 'OT', 45, 'emp-3');
    expect(log.metadata.decision).toBe('APPROVED');
    expect(log.metadata.approvalType).toBe('OT');
    expect(log.metadata.minutes).toBe(45);
    expect(log.metadata.employeeId).toBe('emp-3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Service — logAttendanceEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('logAttendanceEvent()', () => {
  it('creates a CHECK_IN log with entityType=ATTENDANCE', () => {
    const log = logAttendanceEvent('emp-1', 'CHECK_IN', 'att-1');
    expect(log.action).toBe('CHECK_IN');
    expect(log.entityType).toBe('ATTENDANCE');
    expect(log.entityId).toBe('att-1');
    expect(log.actorId).toBe('emp-1');
  });

  it('creates a CHECK_OUT log', () => {
    const log = logAttendanceEvent('emp-1', 'CHECK_OUT', 'att-1');
    expect(log.action).toBe('CHECK_OUT');
  });

  it('stores employeeId in metadata', () => {
    const log = logAttendanceEvent('emp-42', 'CHECK_IN', 'att-99');
    expect(log.metadata.employeeId).toBe('emp-42');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Filtering
// ─────────────────────────────────────────────────────────────────────────────

describe('queryLogs() filtering', () => {
  beforeEach(() => {
    logSettingsUpdate('admin-1', ['attendanceMode'], {}, {});
    logApprovalDecision('mgr-1', 'apr-1', 'APPROVED', 'LATE', 10, 'emp-1');
    logApprovalDecision('mgr-2', 'apr-2', 'REJECTED', 'OT',   30, 'emp-2');
    logAttendanceEvent('emp-1', 'CHECK_IN',  'att-1');
    logAttendanceEvent('emp-1', 'CHECK_OUT', 'att-1');
  });

  it('returns all entries with no filter', () => {
    expect(queryLogs()).toHaveLength(5);
  });

  it('filters by actorId', () => {
    const logs = queryLogs({ actorId: 'mgr-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe('mgr-1');
  });

  it('filters by action', () => {
    const logs = queryLogs({ action: 'CHECK_IN' });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('CHECK_IN');
  });

  it('filters by entityType=APPROVAL', () => {
    const logs = queryLogs({ entityType: 'APPROVAL' });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.entityType === 'APPROVAL')).toBe(true);
  });

  it('filters by entityType=SETTINGS', () => {
    const logs = queryLogs({ entityType: 'SETTINGS' });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('UPDATE_SETTINGS');
  });

  it('filters by entityType=ATTENDANCE', () => {
    const logs = queryLogs({ entityType: 'ATTENDANCE' });
    expect(logs).toHaveLength(2);
  });

  it('combines actorId + entityType filters', () => {
    const logs = queryLogs({ actorId: 'emp-1', entityType: 'ATTENDANCE' });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.actorId === 'emp-1')).toBe(true);
  });

  it('date range from/to filters by createdAt', async () => {
    _clearForTests();

    const before = new Date(Date.now() - 2000).toISOString();  // 2 s ago
    logAttendanceEvent('emp-1', 'CHECK_IN', 'att-old');
    await new Promise((r) => setTimeout(r, 5));
    const between = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    logAttendanceEvent('emp-1', 'CHECK_OUT', 'att-new');
    const after = new Date(Date.now() + 2000).toISOString();   // 2 s ahead

    expect(queryLogs({ from: before, to: after })).toHaveLength(2);
    expect(queryLogs({ from: between })).toHaveLength(1);
    expect(queryLogs({ to: between })).toHaveLength(1);
  });

  it('returns empty array when no entry matches', () => {
    expect(queryLogs({ actorId: 'nobody' })).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Integration — reviewApproval() writes an audit entry automatically
// ─────────────────────────────────────────────────────────────────────────────

describe('reviewApproval() integration', () => {
  // Own the approval store within this describe block only.
  // Keeping this teardown local prevents it from racing with
  // attendanceApprovalPersistence.test.ts in the parallel worker pool.
  beforeEach(() => {
    clearApprovals();
  });

  it('creates an APPROVE_LATE audit log when a LATE record is approved', () => {
    const record = createApproval({
      employeeId: 'emp-1',
      type:       'LATE',
      minutes:    20,
      status:     'PENDING',
    });

    reviewApproval(record.id, 'APPROVED', 'mgr-1');

    const logs = queryLogs({ action: 'APPROVE_LATE' });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(record.id);
    expect(logs[0].actorId).toBe('mgr-1');
    expect(logs[0].metadata.employeeId).toBe('emp-1');
    expect(logs[0].metadata.minutes).toBe(20);
  });

  it('creates a REJECT_OT audit log when an OT record is rejected', () => {
    const record = createApproval({
      employeeId: 'emp-2',
      type:       'OT',
      minutes:    45,
      status:     'PENDING',
    });

    reviewApproval(record.id, 'REJECTED', 'mgr-2');

    const logs = queryLogs({ action: 'REJECT_OT' });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(record.id);
    expect(logs[0].actorId).toBe('mgr-2');
  });

  it('does NOT write an audit log when reviewApproval() throws', () => {
    expect(() => reviewApproval('no-such-id', 'APPROVED', 'mgr-1'))
      .toThrow(expect.objectContaining({ statusCode: 404 }));

    expect(queryLogs()).toHaveLength(0);
  });
});
