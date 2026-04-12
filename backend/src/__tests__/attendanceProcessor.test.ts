/**
 * attendanceProcessor.test.ts
 *
 * Integration tests for processCheckIn() and processCheckOut().
 * These tests validate that the service layer composes utility functions
 * correctly and returns consistent, non-negative minute deltas.
 *
 * Phase 6 note: makeSettings() uses requireManagerApproval=false and
 * otRule.requireApproval=false, so the expected approval statuses here
 * are always 'NONE' (not late / no OT) or 'APPROVED' (late or OT present,
 * no approval required). Approval-specific scenarios live in attendanceApproval.test.ts.
 *
 * Structure mirrors isLate.test.ts / isEarlyLeave.test.ts / calculateOT.test.ts.
 */
import { describe, it, expect } from 'vitest';
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
  startTime?:          string;
  endTime?:            string;
  flexible?:           boolean;
  lateGrace?:          number;
  earlyLeaveGrace?:    number;
  otEnabled?:          boolean;
  startAfterMinutes?:  number;
}): AttendanceSettings {
  return {
    mode:                   'FULL',
    requireManagerApproval: false,   // approval tests are in attendanceApproval.test.ts
    workSchedule: {
      startTime: overrides.startTime ?? '09:00',
      endTime:   overrides.endTime   ?? '17:00',
      flexible:  overrides.flexible  ?? false,
    },
    lateRule:       { graceMinutes: overrides.lateGrace       ?? 15 },
    earlyLeaveRule: { graceMinutes: overrides.earlyLeaveGrace ?? 5  },
    otRule: {
      enabled:           overrides.otEnabled          ?? true,
      startAfterMinutes: overrides.startAfterMinutes  ?? 30,
      requireApproval:   false,      // approval tests are in attendanceApproval.test.ts
    },
    locationRule: { enabled: false, radiusMeters: 100 },
    photoRule:    { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:     { imageMode: 'OFF' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// processCheckIn
// ─────────────────────────────────────────────────────────────────────────────

describe('processCheckIn()', () => {

  describe('on time', () => {
    it('returns isLate=false and lateMinutes=0 when arriving before start', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('08:50'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });

    it('returns isLate=false and lateMinutes=0 when arriving exactly at start', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:00'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });

    it('returns isLate=false and lateMinutes=0 within the grace window', () => {
      // 09:00 + 15 min grace → deadline 09:15; arriving at 09:10 is within
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:10'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });
  });

  describe('exact boundary', () => {
    it('returns isLate=false at exactly (startTime + graceMinutes)', () => {
      // 09:00 + 15 min → 09:15 is the last safe moment
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:15'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });

    it('returns isLate=true with lateMinutes=1 at one minute past the boundary', () => {
      // requireManagerApproval=false → APPROVED (not PENDING)
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:16'), settings: s });
      expect(result).toEqual({ isLate: true, lateMinutes: 1, lateApprovalStatus: 'APPROVED' });
    });
  });

  describe('late', () => {
    it('returns correct lateMinutes for a moderate delay', () => {
      // deadline 09:15, check-in 09:30 → 15 min late
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:30'), settings: s });
      expect(result).toEqual({ isLate: true, lateMinutes: 15, lateApprovalStatus: 'APPROVED' });
    });

    it('returns correct lateMinutes for a large delay', () => {
      // deadline 09:15, check-in 11:00 → 105 min late
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('11:00'), settings: s });
      expect(result).toEqual({ isLate: true, lateMinutes: 105, lateApprovalStatus: 'APPROVED' });
    });

    it('lateMinutes is never negative', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 15 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:16'), settings: s });
      expect(result.lateMinutes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('zero grace', () => {
    it('returns isLate=false exactly at startTime', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 0 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:00'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });

    it('returns isLate=true with lateMinutes=1 one minute after startTime', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 0 });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('09:01'), settings: s });
      expect(result).toEqual({ isLate: true, lateMinutes: 1, lateApprovalStatus: 'APPROVED' });
    });
  });

  describe('flexible schedule', () => {
    it('returns isLate=false regardless of check-in time', () => {
      const s = makeSettings({ startTime: '09:00', lateGrace: 0, flexible: true });
      const result = processCheckIn({ employeeId: 'e1', checkInTime: makeDate('23:59'), settings: s });
      expect(result).toEqual({ isLate: false, lateMinutes: 0, lateApprovalStatus: 'NONE' });
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// processCheckOut
// ─────────────────────────────────────────────────────────────────────────────

describe('processCheckOut()', () => {

  describe('normal checkout (no early leave, no OT)', () => {
    it('returns all zeros when checking out at endTime', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:00'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('returns no flags when checking out within the grace window', () => {
      // 17:00 end, 5 min grace → allowed from 16:55; 16:57 is within
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:57'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });
  });

  describe('exact boundary — early leave', () => {
    it('returns isEarlyLeave=false at exactly (endTime - graceMinutes)', () => {
      // 17:00 end, 5 min grace → boundary at 16:55
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:55'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('returns isEarlyLeave=true with earlyLeaveMinutes=1 one minute before the boundary', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:54'), settings: s });
      expect(result).toEqual({ isEarlyLeave: true, earlyLeaveMinutes: 1, otMinutes: 0, otApprovalStatus: 'NONE' });
    });
  });

  describe('early leave', () => {
    it('returns correct earlyLeaveMinutes for a moderate early exit', () => {
      // boundary 16:55, checkout 16:30 → 25 min early
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:30'), settings: s });
      expect(result).toEqual({ isEarlyLeave: true, earlyLeaveMinutes: 25, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('returns correct earlyLeaveMinutes for a large early exit', () => {
      // boundary 16:55, checkout 14:00 → 175 min early
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('14:00'), settings: s });
      expect(result).toEqual({ isEarlyLeave: true, earlyLeaveMinutes: 175, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('earlyLeaveMinutes is never negative', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:54'), settings: s });
      expect(result.earlyLeaveMinutes).toBeGreaterThanOrEqual(0);
    });

    it('forces otMinutes=0 when isEarlyLeave is true', () => {
      // Even with OT enabled, an early checkout cannot produce OT
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: true, startAfterMinutes: 30 });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:00'), settings: s });
      expect(result.isEarlyLeave).toBe(true);
      expect(result.otMinutes).toBe(0);
    });
  });

  describe('OT', () => {
    it('returns correct otMinutes when checking out past the OT threshold', () => {
      // endTime 17:00 + 30 min → OT threshold 17:30; checkout 18:00 → 30 OT min
      // requireApproval=false → APPROVED
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: true, startAfterMinutes: 30 });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('18:00'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 30, otApprovalStatus: 'APPROVED' });
    });

    it('returns otMinutes=0 at the exact OT threshold', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: true, startAfterMinutes: 30 });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:30'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('returns otMinutes=1 one minute past the OT threshold', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: true, startAfterMinutes: 30 });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:31'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 1, otApprovalStatus: 'APPROVED' });
    });

    it('returns otMinutes=0 when OT is disabled', () => {
      const s = makeSettings({ endTime: '17:00', otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('20:00'), settings: s });
      expect(result.otMinutes).toBe(0);
    });
  });

  describe('mutual exclusion — early leave and OT cannot coexist', () => {
    it('never produces both isEarlyLeave=true and otMinutes>0', () => {
      // A checkout time cannot simultaneously be before the grace floor AND after the OT threshold
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 5, otEnabled: true, startAfterMinutes: 30 });

      // Sweep a range of checkout times and assert the invariant holds for all of them
      const times = ['14:00', '16:00', '16:54', '16:55', '17:00', '17:30', '17:31', '20:00'];
      for (const t of times) {
        const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate(t), settings: s });
        const both = result.isEarlyLeave && result.otMinutes > 0;
        expect(both, `Invariant violated at checkout time ${t}`).toBe(false);
      }
    });
  });

  describe('zero early leave grace', () => {
    it('returns isEarlyLeave=false exactly at endTime', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 0, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('17:00'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('returns isEarlyLeave=true with earlyLeaveMinutes=1 one minute before endTime', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 0, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('16:59'), settings: s });
      expect(result).toEqual({ isEarlyLeave: true, earlyLeaveMinutes: 1, otMinutes: 0, otApprovalStatus: 'NONE' });
    });
  });

  describe('flexible schedule', () => {
    it('returns isEarlyLeave=false regardless of check-out time', () => {
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 0, flexible: true, otEnabled: false });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('09:00'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 0, otApprovalStatus: 'NONE' });
    });

    it('still calculates OT normally when flexible and OT-enabled', () => {
      // endTime 17:00 + 30 → OT at 17:30; checkout 18:15 → 45 OT min; requireApproval=false → APPROVED
      const s = makeSettings({ endTime: '17:00', earlyLeaveGrace: 0, flexible: true, otEnabled: true, startAfterMinutes: 30 });
      const result = processCheckOut({ employeeId: 'e1', checkOutTime: makeDate('18:15'), settings: s });
      expect(result).toEqual({ isEarlyLeave: false, earlyLeaveMinutes: 0, otMinutes: 45, otApprovalStatus: 'APPROVED' });
    });
  });

});
