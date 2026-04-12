/**
 * attendanceApprovalPersistence.test.ts
 *
 * Tests the persistence layer introduced in Phase 7:
 *   - Repository (attendanceApprovalRepo)
 *   - Service (attendanceApprovalService)
 *
 * The JsonRepository writes to a real file under config.dataDir.
 * We call _clearForTests() before each test to keep them isolated.
 *
 * Sections:
 *   A. Repository — raw CRUD
 *   B. Service — createLateApprovalIfNeeded
 *   C. Service — createOtApprovalIfNeeded
 *   D. Service — reviewApproval (approve / reject)
 *   E. Service — listPendingApprovals
 *   F. Idempotency — no duplicate PENDING records
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createApproval,
  getPendingApprovals,
  getApprovalById,
  updateApprovalStatus,
  hasPendingApproval,
  _clearForTests,
} from '../modules/attendance/repositories/attendanceApprovalRepo';
import {
  createLateApprovalIfNeeded,
  createOtApprovalIfNeeded,
  reviewApproval,
  listPendingApprovals,
} from '../modules/attendance/services/attendanceApprovalService';

// ─── Reset before every test ──────────────────────────────────────────────────

beforeEach(() => {
  _clearForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
// A. Repository — raw CRUD
// ─────────────────────────────────────────────────────────────────────────────

describe('attendanceApprovalRepo', () => {
  describe('createApproval()', () => {
    it('persists a record and returns it with auto-generated id / timestamps', () => {
      const record = createApproval({
        employeeId: 'emp-1',
        type:       'LATE',
        minutes:    20,
        status:     'PENDING',
      });

      expect(record.id).toBeTruthy();
      expect(record.employeeId).toBe('emp-1');
      expect(record.type).toBe('LATE');
      expect(record.minutes).toBe(20);
      expect(record.status).toBe('PENDING');
      expect(record.createdAt).toBeTruthy();
      expect(record.reviewedAt).toBeUndefined();
      expect(record.reviewerId).toBeUndefined();
    });
  });

  describe('getPendingApprovals()', () => {
    it('returns only PENDING records', () => {
      createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 10, status: 'PENDING' });
      createApproval({ employeeId: 'emp-2', type: 'OT',   minutes: 45, status: 'APPROVED' });
      createApproval({ employeeId: 'emp-3', type: 'OT',   minutes: 30, status: 'PENDING' });

      const pending = getPendingApprovals();
      expect(pending).toHaveLength(2);
      expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
    });

    it('returns empty array when no PENDING records exist', () => {
      createApproval({ employeeId: 'emp-1', type: 'OT', minutes: 30, status: 'APPROVED' });
      expect(getPendingApprovals()).toHaveLength(0);
    });
  });

  describe('getApprovalById()', () => {
    it('returns the record when found', () => {
      const created = createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 5, status: 'PENDING' });
      const found   = getApprovalById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for an unknown id', () => {
      expect(getApprovalById('does-not-exist')).toBeNull();
    });
  });

  describe('updateApprovalStatus()', () => {
    it('updates status, reviewedAt, and reviewerId', () => {
      const record  = createApproval({ employeeId: 'emp-1', type: 'OT', minutes: 60, status: 'PENDING' });
      const updated = updateApprovalStatus(record.id, 'APPROVED', 'mgr-1');

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('APPROVED');
      expect(updated!.reviewerId).toBe('mgr-1');
      expect(updated!.reviewedAt).toBeTruthy();
    });

    it('returns null for an unknown id', () => {
      expect(updateApprovalStatus('no-such-id', 'APPROVED', 'mgr-1')).toBeNull();
    });
  });

  describe('hasPendingApproval()', () => {
    it('returns true when a PENDING record exists for the employee+type', () => {
      createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 10, status: 'PENDING' });
      expect(hasPendingApproval('emp-1', 'LATE')).toBe(true);
    });

    it('returns false when no PENDING record exists', () => {
      expect(hasPendingApproval('emp-1', 'LATE')).toBe(false);
    });

    it('returns false when the record exists but is already APPROVED', () => {
      createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 10, status: 'APPROVED' });
      expect(hasPendingApproval('emp-1', 'LATE')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Service — createLateApprovalIfNeeded
// ─────────────────────────────────────────────────────────────────────────────

describe('createLateApprovalIfNeeded()', () => {
  it('creates a PENDING record when lateApprovalStatus is PENDING', () => {
    const record = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        20,
      lateApprovalStatus: 'PENDING',
    });

    expect(record).not.toBeNull();
    expect(record!.type).toBe('LATE');
    expect(record!.status).toBe('PENDING');
    expect(record!.minutes).toBe(20);
  });

  it('returns null when lateApprovalStatus is NONE', () => {
    const record = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             false,
      lateMinutes:        0,
      lateApprovalStatus: 'NONE',
    });
    expect(record).toBeNull();
    expect(getPendingApprovals()).toHaveLength(0);
  });

  it('returns null when lateApprovalStatus is APPROVED (no approval needed)', () => {
    const record = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        10,
      lateApprovalStatus: 'APPROVED',
    });
    expect(record).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Service — createOtApprovalIfNeeded
// ─────────────────────────────────────────────────────────────────────────────

describe('createOtApprovalIfNeeded()', () => {
  it('creates a PENDING record when otApprovalStatus is PENDING', () => {
    const record = createOtApprovalIfNeeded({
      employeeId:       'emp-2',
      otMinutes:        45,
      otApprovalStatus: 'PENDING',
    });

    expect(record).not.toBeNull();
    expect(record!.type).toBe('OT');
    expect(record!.status).toBe('PENDING');
    expect(record!.minutes).toBe(45);
  });

  it('returns null when otApprovalStatus is NONE (no OT)', () => {
    const record = createOtApprovalIfNeeded({
      employeeId:       'emp-2',
      otMinutes:        0,
      otApprovalStatus: 'NONE',
    });
    expect(record).toBeNull();
    expect(getPendingApprovals()).toHaveLength(0);
  });

  it('returns null when otApprovalStatus is APPROVED', () => {
    const record = createOtApprovalIfNeeded({
      employeeId:       'emp-2',
      otMinutes:        30,
      otApprovalStatus: 'APPROVED',
    });
    expect(record).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Service — reviewApproval (approve / reject)
// ─────────────────────────────────────────────────────────────────────────────

describe('reviewApproval()', () => {
  it('approves a PENDING record and stamps reviewer info', () => {
    const created = createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 15, status: 'PENDING' });
    const updated = reviewApproval(created.id, 'APPROVED', 'mgr-99');

    expect(updated.status).toBe('APPROVED');
    expect(updated.reviewerId).toBe('mgr-99');
    expect(updated.reviewedAt).toBeTruthy();
  });

  it('rejects a PENDING record correctly', () => {
    const created = createApproval({ employeeId: 'emp-1', type: 'OT', minutes: 60, status: 'PENDING' });
    const updated = reviewApproval(created.id, 'REJECTED', 'mgr-99');

    expect(updated.status).toBe('REJECTED');
  });

  it('throws 404 for an unknown approval id', () => {
    expect(() => reviewApproval('no-such-id', 'APPROVED', 'mgr-1'))
      .toThrow(expect.objectContaining({ statusCode: 404, code: 'APPROVAL_NOT_FOUND' }));
  });

  it('throws 409 when the record is already APPROVED', () => {
    const created = createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 10, status: 'PENDING' });
    reviewApproval(created.id, 'APPROVED', 'mgr-1');   // first review

    expect(() => reviewApproval(created.id, 'APPROVED', 'mgr-2'))
      .toThrow(expect.objectContaining({ statusCode: 409, code: 'APPROVAL_ALREADY_REVIEWED' }));
  });

  it('throws 409 when the record is already REJECTED', () => {
    const created = createApproval({ employeeId: 'emp-1', type: 'OT', minutes: 30, status: 'PENDING' });
    reviewApproval(created.id, 'REJECTED', 'mgr-1');

    expect(() => reviewApproval(created.id, 'REJECTED', 'mgr-2'))
      .toThrow(expect.objectContaining({ statusCode: 409, code: 'APPROVAL_ALREADY_REVIEWED' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Service — listPendingApprovals
// ─────────────────────────────────────────────────────────────────────────────

describe('listPendingApprovals()', () => {
  it('returns all PENDING records across all employees', () => {
    createApproval({ employeeId: 'emp-1', type: 'LATE', minutes: 10, status: 'PENDING'  });
    createApproval({ employeeId: 'emp-2', type: 'OT',   minutes: 45, status: 'PENDING'  });
    createApproval({ employeeId: 'emp-3', type: 'OT',   minutes: 30, status: 'APPROVED' });

    const pending = listPendingApprovals();
    expect(pending).toHaveLength(2);
    expect(pending.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('returns empty array when queue is clear', () => {
    expect(listPendingApprovals()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Idempotency — no duplicate PENDING records
// ─────────────────────────────────────────────────────────────────────────────

describe('idempotency guard', () => {
  it('does not create a second LATE record when one is already PENDING', () => {
    // First call — creates the record
    const first = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        15,
      lateApprovalStatus: 'PENDING',
    });

    // Second call with same employee — returns existing record, no new insert
    const second = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        20,           // different minutes — should be ignored
      lateApprovalStatus: 'PENDING',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.id).toBe(first!.id);                 // same record returned
    expect(getPendingApprovals()).toHaveLength(1);        // no duplicate
  });

  it('does not create a second OT record when one is already PENDING', () => {
    const first = createOtApprovalIfNeeded({
      employeeId:       'emp-2',
      otMinutes:        30,
      otApprovalStatus: 'PENDING',
    });

    const second = createOtApprovalIfNeeded({
      employeeId:       'emp-2',
      otMinutes:        60,
      otApprovalStatus: 'PENDING',
    });

    expect(second!.id).toBe(first!.id);
    expect(getPendingApprovals()).toHaveLength(1);
  });

  it('allows a new PENDING record after the previous one is resolved', () => {
    const first = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        10,
      lateApprovalStatus: 'PENDING',
    });

    // Manager resolves it
    reviewApproval(first!.id, 'APPROVED', 'mgr-1');

    // A new PENDING record for the same employee is now allowed
    const second = createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        5,
      lateApprovalStatus: 'PENDING',
    });

    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);   // genuinely new record
    expect(getPendingApprovals()).toHaveLength(1);
  });

  it('LATE and OT are tracked independently — both can be PENDING simultaneously', () => {
    createLateApprovalIfNeeded({
      employeeId:         'emp-1',
      isLate:             true,
      lateMinutes:        10,
      lateApprovalStatus: 'PENDING',
    });

    createOtApprovalIfNeeded({
      employeeId:       'emp-1',
      otMinutes:        45,
      otApprovalStatus: 'PENDING',
    });

    const pending = getPendingApprovals();
    expect(pending).toHaveLength(2);
    expect(pending.some((r) => r.type === 'LATE')).toBe(true);
    expect(pending.some((r) => r.type === 'OT')).toBe(true);
  });
});
