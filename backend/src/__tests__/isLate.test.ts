/**
 * isLate.test.ts
 *
 * Unit tests for isLate() and AttendanceSettingsSchema.
 *
 * Sections:
 *   A. isLate — core business rules
 *   B. AttendanceSettingsSchema — Zod validation
 */
import { describe, it, expect } from 'vitest';
import { isLate } from '../modules/attendance/utils/isLate';
import { AttendanceSettingsSchema, type AttendanceSettings } from '../modules/attendance/utils/attendanceSettings.validation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a Date whose time-of-day matches the given "HH:mm" string. */
function makeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2024, 0, 15);   // fixed calendar date — irrelevant to tests
  d.setHours(h, m, 0, 0);
  return d;
}

/** Factory for a minimal valid settings object.  Override only what the test needs. */
function makeSettings(overrides: {
  startTime?:    string;
  endTime?:      string;
  flexible?:     boolean;
  graceMinutes?: number;
}): AttendanceSettings {
  return {
    mode:                   'FULL',
    requireManagerApproval: false,
    workSchedule: {
      startTime: overrides.startTime  ?? '08:30',
      endTime:   overrides.endTime    ?? '17:30',
      flexible:  overrides.flexible   ?? false,
    },
    lateRule:      { graceMinutes: overrides.graceMinutes ?? 15 },
    earlyLeaveRule: { graceMinutes: 5 },
    otRule:         { enabled: false, startAfterMinutes: 30, requireApproval: true },
    locationRule:   { enabled: false, radiusMeters: 100 },
    photoRule:      { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:       { imageMode: 'OFF' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A.  isLate — business rules
// ─────────────────────────────────────────────────────────────────────────────

describe('isLate()', () => {
  describe('on time', () => {
    it('returns false when check-in is before start time', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 15 });
      expect(isLate(makeDate('08:00'), s)).toBe(false);
    });

    it('returns false when check-in is exactly at start time', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 15 });
      expect(isLate(makeDate('08:30'), s)).toBe(false);
    });

    it('returns false when check-in is within the grace window', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 15 });
      expect(isLate(makeDate('08:44'), s)).toBe(false);   // 14 min past start
    });
  });

  describe('late', () => {
    it('returns true when check-in is one minute past the grace boundary', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 15 });
      expect(isLate(makeDate('08:46'), s)).toBe(true);    // 16 min past start
    });

    it('returns true when check-in is well beyond the grace window', () => {
      const s = makeSettings({ startTime: '09:00', graceMinutes: 10 });
      expect(isLate(makeDate('10:30'), s)).toBe(true);
    });
  });

  describe('exact grace boundary', () => {
    it('returns false at exactly startTime + graceMinutes (boundary is inclusive — not late)', () => {
      // 09:00 start + 15 min grace → 09:15 is the last allowed moment
      const s = makeSettings({ startTime: '09:00', graceMinutes: 15 });
      expect(isLate(makeDate('09:15'), s)).toBe(false);
    });

    it('returns true one minute after the boundary', () => {
      const s = makeSettings({ startTime: '09:00', graceMinutes: 15 });
      expect(isLate(makeDate('09:16'), s)).toBe(true);
    });
  });

  describe('flexible schedule', () => {
    it('returns false regardless of how late the check-in is', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 0, flexible: true });
      expect(isLate(makeDate('23:59'), s)).toBe(false);
    });

    it('ignores graceMinutes completely when flexible is true', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 0, flexible: true });
      expect(isLate(makeDate('08:31'), s)).toBe(false);
    });
  });

  describe('zero grace minutes', () => {
    it('returns false when check-in is exactly at start time', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 0 });
      expect(isLate(makeDate('08:30'), s)).toBe(false);
    });

    it('returns true when check-in is one minute after start time', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 0 });
      expect(isLate(makeDate('08:31'), s)).toBe(true);
    });

    it('returns false when check-in is early', () => {
      const s = makeSettings({ startTime: '08:30', graceMinutes: 0 });
      expect(isLate(makeDate('07:00'), s)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B.  AttendanceSettingsSchema — Zod validation
// ─────────────────────────────────────────────────────────────────────────────

describe('AttendanceSettingsSchema', () => {
  const validPayload = {
    mode:                   'FULL',
    requireManagerApproval: false,
    workSchedule:           { startTime: '08:30', endTime: '17:30', flexible: false },
    lateRule:               { graceMinutes: 15 },
    earlyLeaveRule:         { graceMinutes: 5 },
    otRule:                 { enabled: false, startAfterMinutes: 30, requireApproval: true },
    locationRule:           { enabled: false, radiusMeters: 100 },
    photoRule:              { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:               { imageMode: 'OFF' },
  };

  it('accepts a fully valid settings object', () => {
    expect(() => AttendanceSettingsSchema.parse(validPayload)).not.toThrow();
  });

  describe('time format', () => {
    it('rejects startTime with invalid format', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { ...validPayload.workSchedule, startTime: '8:30' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects endTime with seconds included', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { ...validPayload.workSchedule, endTime: '17:30:00' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects hour > 23', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { ...validPayload.workSchedule, startTime: '24:00' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts boundary times 00:00 and 23:59', () => {
      // 23:59 end > 00:00 start — valid ordering
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { startTime: '00:00', endTime: '23:59', flexible: false },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('graceMinutes', () => {
    it('rejects negative graceMinutes', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        lateRule: { graceMinutes: -1 },
      });
      expect(result.success).toBe(false);
    });

    it('accepts graceMinutes of 0', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        lateRule: { graceMinutes: 0 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('endTime > startTime', () => {
    it('rejects when endTime equals startTime', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { startTime: '08:30', endTime: '08:30', flexible: false },
      });
      expect(result.success).toBe(false);
    });

    it('rejects when endTime is before startTime', () => {
      const result = AttendanceSettingsSchema.safeParse({
        ...validPayload,
        workSchedule: { startTime: '17:00', endTime: '08:00', flexible: false },
      });
      expect(result.success).toBe(false);
    });
  });
});
