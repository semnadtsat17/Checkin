/**
 * attendanceApproval.test.ts
 *
 * Tests the approval-status layer added in Phase 6.
 *
 * Sections:
 *   A. resolveLateApprovalStatus() in isolation
 *   B. resolveOtApprovalStatus() in isolation
 *   C. processCheckIn() — approval field
 *   D. processCheckOut() — approval field
 *   E. Combined scenarios (late + OT evaluated independently, early leave)
 */
import { describe, it, expect } from 'vitest';
import { resolveLateApprovalStatus, resolveOtApprovalStatus } from '../modules/attendance/utils/approvalUtils';
import { processCheckIn, processCheckOut } from '../modules/attendance/services/attendanceProcessor';
import type { AttendanceSettings } from '../modules/attendance/utils/attendanceSettings.validation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2024, 0, 15);
  d.setHours(h, m, 0, 0);
  return d;
}

function makeSettings(overrides: {
  startTime?:            string;
  endTime?:              string;
  flexible?:             boolean;
  lateGrace?:            number;
  earlyLeaveGrace?:      number;
  requireManagerApproval?: boolean;
  otEnabled?:            boolean;
  otStartAfter?:         number;
  otRequireApproval?:    boolean;
}): AttendanceSettings {
  return {
    mode:                   'FULL',
    requireManagerApproval: overrides.requireManagerApproval ?? true,
    workSchedule: {
      startTime: overrides.startTime ?? '09:00',
      endTime:   overrides.endTime   ?? '17:00',
      flexible:  overrides.flexible  ?? false,
    },
    lateRule:       { graceMinutes: overrides.lateGrace       ?? 15 },
    earlyLeaveRule: { graceMinutes: overrides.earlyLeaveGrace ?? 5  },
    otRule: {
      enabled:           overrides.otEnabled          ?? true,
      startAfterMinutes: overrides.otStartAfter        ?? 30,
      requireApproval:   overrides.otRequireApproval   ?? true,
    },
    locationRule: { enabled: false, radiusMeters: 100 },
    photoRule:    { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:     { imageMode: 'OFF' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A. resolveLateApprovalStatus — unit
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveLateApprovalStatus()', () => {
  it('returns NONE when not late', () => {
    const s = makeSettings({ requireManagerApproval: true });
    expect(resolveLateApprovalStatus(false, s)).toBe('NONE');
  });

  it('returns NONE when not late even if approval is disabled', () => {
    const s = makeSettings({ requireManagerApproval: false });
    expect(resolveLateApprovalStatus(false, s)).toBe('NONE');
  });

  it('returns PENDING when late AND approval is required', () => {
    const s = makeSettings({ requireManagerApproval: true });
    expect(resolveLateApprovalStatus(true, s)).toBe('PENDING');
  });

  it('returns APPROVED when late AND approval is NOT required', () => {
    const s = makeSettings({ requireManagerApproval: false });
    expect(resolveLateApprovalStatus(true, s)).toBe('APPROVED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. resolveOtApprovalStatus — unit
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveOtApprovalStatus()', () => {
  it('returns NONE when otMinutes is 0', () => {
    const s = makeSettings({ otRequireApproval: true });
    expect(resolveOtApprovalStatus(0, s)).toBe('NONE');
  });

  it('returns NONE when otMinutes is 0 even if approval is disabled', () => {
    const s = makeSettings({ otRequireApproval: false });
    expect(resolveOtApprovalStatus(0, s)).toBe('NONE');
  });

  it('returns PENDING when OT > 0 AND requireApproval is true', () => {
    const s = makeSettings({ otRequireApproval: true });
    expect(resolveOtApprovalStatus(45, s)).toBe('PENDING');
  });

  it('returns APPROVED when OT > 0 AND requireApproval is false', () => {
    const s = makeSettings({ otRequireApproval: false });
    expect(resolveOtApprovalStatus(45, s)).toBe('APPROVED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. processCheckIn — lateApprovalStatus field
// ─────────────────────────────────────────────────────────────────────────────

describe('processCheckIn() — lateApprovalStatus', () => {
  // 09:00 start, 15 min grace → deadline 09:15; 09:30 is late

  it('is NONE when on time', () => {
    const s = makeSettings({ requireManagerApproval: true });
    const r = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:00'), settings: s });
    expect(r.lateApprovalStatus).toBe('NONE');
    expect(r.isLate).toBe(false);
    expect(r.lateMinutes).toBe(0);
  });

  it('is PENDING when late AND approval required', () => {
    const s = makeSettings({ requireManagerApproval: true });
    const r = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:30'), settings: s });
    expect(r.lateApprovalStatus).toBe('PENDING');
    expect(r.isLate).toBe(true);
    expect(r.lateMinutes).toBe(15);   // 09:30 − (09:00 + 15 min)
  });

  it('is APPROVED when late AND approval NOT required', () => {
    const s = makeSettings({ requireManagerApproval: false });
    const r = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:30'), settings: s });
    expect(r.lateApprovalStatus).toBe('APPROVED');
    expect(r.isLate).toBe(true);
  });

  it('is NONE at the exact grace boundary (not late)', () => {
    const s = makeSettings({ requireManagerApproval: true });
    const r = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:15'), settings: s });
    expect(r.lateApprovalStatus).toBe('NONE');
    expect(r.isLate).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. processCheckOut — otApprovalStatus field
// ─────────────────────────────────────────────────────────────────────────────

describe('processCheckOut() — otApprovalStatus', () => {
  // 17:00 end, 30 min OT threshold → OT starts at 17:30

  it('is NONE when no OT (checkout before threshold)', () => {
    const s = makeSettings({ otEnabled: true, otRequireApproval: true });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:00'), settings: s });
    expect(r.otApprovalStatus).toBe('NONE');
    expect(r.otMinutes).toBe(0);
  });

  it('is NONE when OT is disabled', () => {
    const s = makeSettings({ otEnabled: false, otRequireApproval: true });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('20:00'), settings: s });
    expect(r.otApprovalStatus).toBe('NONE');
    expect(r.otMinutes).toBe(0);
  });

  it('is PENDING when OT > 0 AND requireApproval', () => {
    const s = makeSettings({ otEnabled: true, otRequireApproval: true });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('18:00'), settings: s });
    expect(r.otApprovalStatus).toBe('PENDING');
    expect(r.otMinutes).toBe(30);   // 18:00 − 17:30 threshold
  });

  it('is APPROVED when OT > 0 AND requireApproval is false', () => {
    const s = makeSettings({ otEnabled: true, otRequireApproval: false });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('18:00'), settings: s });
    expect(r.otApprovalStatus).toBe('APPROVED');
    expect(r.otMinutes).toBe(30);
  });

  it('is NONE at the exact OT threshold (boundary = no OT)', () => {
    const s = makeSettings({ otEnabled: true, otRequireApproval: true });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:30'), settings: s });
    expect(r.otApprovalStatus).toBe('NONE');
    expect(r.otMinutes).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Combined scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('combined scenarios', () => {
  it('late check-in is evaluated independently of OT settings', () => {
    // OT settings have no bearing on the late approval result
    const s = makeSettings({
      requireManagerApproval: true,
      otEnabled:              true,
      otRequireApproval:      false,   // OT doesn't need approval
    });
    const r = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:30'), settings: s });
    expect(r.lateApprovalStatus).toBe('PENDING');   // late approval uses requireManagerApproval
    expect(r.isLate).toBe(true);
  });

  it('OT approval evaluated independently of late settings', () => {
    // requireManagerApproval has no bearing on OT approval status
    const s = makeSettings({
      requireManagerApproval: false,   // late doesn't need approval
      otEnabled:              true,
      otRequireApproval:      true,    // OT does need approval
    });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('18:00'), settings: s });
    expect(r.otApprovalStatus).toBe('PENDING');   // OT uses otRule.requireApproval
    expect(r.otMinutes).toBe(30);
  });

  it('early leave always produces otApprovalStatus=NONE (no OT possible)', () => {
    // 17:00 end, 5 min grace → early if before 16:55; checkout 16:00
    const s = makeSettings({
      otEnabled:         true,
      otRequireApproval: true,
    });
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:00'), settings: s });
    expect(r.isEarlyLeave).toBe(true);
    expect(r.otMinutes).toBe(0);
    expect(r.otApprovalStatus).toBe('NONE');
  });

  it('no early leave and no OT gives NONE for both cases', () => {
    // Checkout within normal range (after grace floor, before OT threshold)
    const s = makeSettings({
      requireManagerApproval: true,
      otEnabled:              true,
      otRequireApproval:      true,
    });
    // 17:00 end, 5 min grace → floor 16:55; OT threshold 17:30
    // checkout at 17:10: not early, not OT
    const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:10'), settings: s });
    expect(r.isEarlyLeave).toBe(false);
    expect(r.earlyLeaveMinutes).toBe(0);
    expect(r.otMinutes).toBe(0);
    expect(r.otApprovalStatus).toBe('NONE');
  });

  it('approval statuses remain correct across a sweep of check-out times', () => {
    const s = makeSettings({
      endTime:           '17:00',
      earlyLeaveGrace:   5,
      otEnabled:         true,
      otStartAfter:      30,
      otRequireApproval: true,
    });

    type Case = { time: string; expectedOtStatus: 'NONE' | 'PENDING' };
    const cases: Case[] = [
      { time: '16:00', expectedOtStatus: 'NONE'    },   // early leave
      { time: '16:55', expectedOtStatus: 'NONE'    },   // exactly at grace floor
      { time: '17:00', expectedOtStatus: 'NONE'    },   // at end time, no OT
      { time: '17:30', expectedOtStatus: 'NONE'    },   // at OT threshold, no OT
      { time: '17:31', expectedOtStatus: 'PENDING' },   // 1 min past threshold
      { time: '19:00', expectedOtStatus: 'PENDING' },   // large OT
    ];

    for (const { time, expectedOtStatus } of cases) {
      const r = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate(time), settings: s });
      expect(r.otApprovalStatus, `checkout at ${time}`).toBe(expectedOtStatus);
    }
  });
});
