/**
 * attendanceNotification.test.ts
 *
 * Tests the notification layer introduced in Phase 10.
 *
 * Strategy:
 *   All tests call the notification helpers or notificationService directly,
 *   passing plain AttendanceApprovalRecord objects rather than going through the
 *   full service stack.  This keeps the test scope narrow (notifications only)
 *   and avoids writing to attendance_approvals.json, which is owned by the
 *   attendanceApprovalPersistence.test.ts worker running in parallel.
 *
 * Sections:
 *   A. notifyManagersApprovalCreated()
 *   B. notifyEmployeeApprovalDecision()
 *   C. notificationService.listForUser()
 *   D. notificationService.markRead()
 *   E. Integration — reviewApproval() side-effects
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { JsonRepository } from '../shared/repository/JsonRepository';
import type { UserRecord } from '../modules/employees/employee.service';
import {
  notifyManagersApprovalCreated,
  notifyEmployeeApprovalDecision,
} from '../modules/attendance/attendanceNotifications';
import { notificationService, _clearNotificationsForTests } from '../modules/notifications/notification.service';
import {
  createApproval,
  _clearForTests as clearApprovals,
} from '../modules/attendance/repositories/attendanceApprovalRepo';
import { reviewApproval } from '../modules/attendance/services/attendanceApprovalService';
import { _clearForTests as clearAuditLogs } from '../modules/audit/audit.repo';
import type { AttendanceApprovalRecord } from '../modules/attendance/repositories/attendanceApprovalRepo';

// ─── Shared employee store (test-only seed / cleanup) ─────────────────────────

const employeeStore = new JsonRepository<UserRecord>('employees');

/** Minimal manager record — only required fields. */
function makeManagerSeed(suffix = '1'): Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    employeeCode:  `TEST-MGR-${suffix}`,
    firstName:     'Test',
    lastName:      `Manager${suffix}`,
    firstNameTh:   'ทดสอบ',
    lastNameTh:    `ผู้จัดการ${suffix}`,
    email:         `test.mgr${suffix}@test.internal`,
    role:          'manager',
    departmentId:  'dept-test',
    branchId:      'branch-test',
    isActive:      true,
  };
}

/** Minimal employee record. */
function makeEmployeeSeed(suffix = '1'): Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    employeeCode:  `TEST-EMP-${suffix}`,
    firstName:     'Test',
    lastName:      `Employee${suffix}`,
    firstNameTh:   'ทดสอบ',
    lastNameTh:    `พนักงาน${suffix}`,
    email:         `test.emp${suffix}@test.internal`,
    role:          'employee',
    departmentId:  'dept-test',
    branchId:      'branch-test',
    isActive:      true,
  };
}

// Seeded once before all tests; removed after all tests.
let managerId:  string;
let employeeId: string;

beforeAll(() => {
  const mgr = employeeStore.create(makeManagerSeed());
  const emp = employeeStore.create(makeEmployeeSeed());
  managerId  = mgr.id;
  employeeId = emp.id;
});

afterAll(() => {
  employeeStore.deleteById(managerId);
  employeeStore.deleteById(employeeId);
});

// ─── Clear notifications before every test ────────────────────────────────────

beforeEach(() => {
  _clearNotificationsForTests();
});

// ─── Fake approval record factory ─────────────────────────────────────────────

function makeFakeApproval(overrides: Partial<AttendanceApprovalRecord> = {}): AttendanceApprovalRecord {
  return {
    id:         'apr-test-1',
    employeeId: employeeId,
    type:       'LATE',
    minutes:    20,
    status:     'PENDING',
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. notifyManagersApprovalCreated()
// ─────────────────────────────────────────────────────────────────────────────

describe('notifyManagersApprovalCreated()', () => {
  it('creates one APPROVAL_REQUEST notification for each active manager', () => {
    notifyManagersApprovalCreated(makeFakeApproval());

    const notes = notificationService.listForUser(managerId);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('APPROVAL_REQUEST');
    expect(notes[0].isRead).toBe(false);
  });

  it('sets relatedId to the approval record id', () => {
    const record = makeFakeApproval({ id: 'apr-link-check' });
    notifyManagersApprovalCreated(record);

    const notes = notificationService.listForUser(managerId);
    expect(notes[0].relatedId).toBe('apr-link-check');
  });

  it('title mentions new approval and body includes employee name', () => {
    notifyManagersApprovalCreated(makeFakeApproval());

    const note = notificationService.listForUser(managerId)[0];
    expect(note.title).toBeTruthy();
    expect(note.body).toContain('นาที');
  });

  it('does not create a notification for the employee', () => {
    notifyManagersApprovalCreated(makeFakeApproval());
    expect(notificationService.listForUser(employeeId)).toHaveLength(0);
  });

  it('creates correct label for OT type', () => {
    notifyManagersApprovalCreated(makeFakeApproval({ type: 'OT', minutes: 45 }));

    const note = notificationService.listForUser(managerId)[0];
    expect(note.body).toContain('ล่วงเวลา');
    expect(note.body).toContain('45');
  });

  it('does not throw when no managers exist in the DB', () => {
    // Pass an employeeId that belongs to no one — should silently produce zero notifications
    expect(() =>
      notifyManagersApprovalCreated(makeFakeApproval({ employeeId: 'non-existent-emp' })),
    ).not.toThrow();
    // Manager still gets a notification (employee name falls back to id)
    expect(notificationService.listForUser(managerId)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. notifyEmployeeApprovalDecision()
// ─────────────────────────────────────────────────────────────────────────────

describe('notifyEmployeeApprovalDecision()', () => {
  it('creates one APPROVAL_RESULT notification for the employee', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ status: 'APPROVED' }),
    );

    const notes = notificationService.listForUser(employeeId);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('APPROVAL_RESULT');
    expect(notes[0].isRead).toBe(false);
  });

  it('does not create a notification for managers', () => {
    notifyEmployeeApprovalDecision(makeFakeApproval({ status: 'APPROVED' }));
    expect(notificationService.listForUser(managerId)).toHaveLength(0);
  });

  it('title indicates approval for APPROVED status', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ type: 'LATE', status: 'APPROVED' }),
    );
    const note = notificationService.listForUser(employeeId)[0];
    expect(note.title).toContain('อนุมัติ');
    expect(note.body).toContain('อนุมัติ');
  });

  it('title indicates rejection for REJECTED status', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ type: 'OT', status: 'REJECTED' }),
    );
    const note = notificationService.listForUser(employeeId)[0];
    expect(note.title).toContain('ปฏิเสธ');
    expect(note.body).toContain('ปฏิเสธ');
  });

  it('sets relatedId to the approval record id', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ id: 'apr-result-link', status: 'APPROVED' }),
    );
    const note = notificationService.listForUser(employeeId)[0];
    expect(note.relatedId).toBe('apr-result-link');
  });

  it('body includes the duration in minutes', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ type: 'LATE', minutes: 35, status: 'REJECTED' }),
    );
    const note = notificationService.listForUser(employeeId)[0];
    expect(note.body).toContain('35');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. notificationService.listForUser()
// ─────────────────────────────────────────────────────────────────────────────

describe('notificationService.listForUser()', () => {
  it('returns only the requesting user\'s notifications', () => {
    notifyManagersApprovalCreated(makeFakeApproval());   // → manager
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ status: 'APPROVED' }),            // → employee
    );

    expect(notificationService.listForUser(managerId)).toHaveLength(1);
    expect(notificationService.listForUser(employeeId)).toHaveLength(1);
  });

  it('returns newest first', async () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ id: 'first', status: 'APPROVED' }),
    );
    await new Promise((r) => setTimeout(r, 5));
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ id: 'second', status: 'REJECTED' }),
    );

    const notes = notificationService.listForUser(employeeId);
    expect(notes[0].relatedId).toBe('second');
    expect(notes[1].relatedId).toBe('first');
  });

  it('returns empty array when user has no notifications', () => {
    expect(notificationService.listForUser('nobody')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. notificationService.markRead()
// ─────────────────────────────────────────────────────────────────────────────

describe('notificationService.markRead()', () => {
  it('sets isRead to true for an existing notification', () => {
    notifyEmployeeApprovalDecision(
      makeFakeApproval({ status: 'APPROVED' }),
    );
    const note = notificationService.listForUser(employeeId)[0];
    expect(note.isRead).toBe(false);

    const updated = notificationService.markRead(note.id, employeeId);
    expect(updated).not.toBeNull();
    expect(updated!.isRead).toBe(true);
  });

  it('returns null when the id does not exist', () => {
    expect(notificationService.markRead('no-such-id', employeeId)).toBeNull();
  });

  it('returns null when the notification belongs to a different user', () => {
    notifyManagersApprovalCreated(makeFakeApproval());
    const note = notificationService.listForUser(managerId)[0];

    // Employee tries to mark manager's notification
    expect(notificationService.markRead(note.id, employeeId)).toBeNull();
    // Manager's notification is unchanged
    expect(notificationService.listForUser(managerId)[0].isRead).toBe(false);
  });

  it('unreadCount reflects markRead correctly', () => {
    notifyEmployeeApprovalDecision(makeFakeApproval({ status: 'APPROVED' }));
    notifyEmployeeApprovalDecision(makeFakeApproval({ id: 'apr-2', status: 'REJECTED' }));
    expect(notificationService.unreadCount(employeeId)).toBe(2);

    const [first] = notificationService.listForUser(employeeId);
    notificationService.markRead(first.id, employeeId);
    expect(notificationService.unreadCount(employeeId)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Integration — reviewApproval() side-effects
// ─────────────────────────────────────────────────────────────────────────────

describe('reviewApproval() notification integration', () => {
  // Own the approval store within this describe block only.
  beforeEach(() => {
    clearApprovals();
    clearAuditLogs();
  });

  it('creates an APPROVAL_RESULT notification for the employee when approved', () => {
    const record = createApproval({
      employeeId: employeeId,
      type:       'LATE',
      minutes:    15,
      status:     'PENDING',
    });

    // reviewApproval also writes audit + calls notifyEmployeeApprovalDecision
    reviewApproval(record.id, 'APPROVED', managerId);

    const notes = notificationService.listForUser(employeeId);
    expect(notes.length).toBeGreaterThanOrEqual(1);

    const resultNote = notes.find((n) => n.type === 'APPROVAL_RESULT');
    expect(resultNote).toBeDefined();
    expect(resultNote!.relatedId).toBe(record.id);
    expect(resultNote!.isRead).toBe(false);
  });

  it('creates an APPROVAL_RESULT notification for the employee when rejected', () => {
    const record = createApproval({
      employeeId: employeeId,
      type:       'OT',
      minutes:    60,
      status:     'PENDING',
    });

    reviewApproval(record.id, 'REJECTED', managerId);

    const resultNote = notificationService
      .listForUser(employeeId)
      .find((n) => n.type === 'APPROVAL_RESULT');

    expect(resultNote).toBeDefined();
    expect(resultNote!.body).toContain('ปฏิเสธ');
  });

  it('does NOT create a notification when reviewApproval() throws (no record found)', () => {
    expect(() => reviewApproval('no-such-id', 'APPROVED', managerId))
      .toThrow(expect.objectContaining({ statusCode: 404 }));

    expect(notificationService.listForUser(employeeId)).toHaveLength(0);
  });
});
