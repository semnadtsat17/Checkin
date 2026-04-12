/**
 * isEarlyLeave.test.ts
 *
 * Unit tests for isEarlyLeave().
 * Structure mirrors isLate.test.ts for consistency.
 */
import { describe, it, expect } from 'vitest';
import { isEarlyLeave } from '../modules/attendance/utils/isEarlyLeave';
import type { AttendanceSettings } from '../modules/attendance/utils/attendanceSettings.validation';

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
  endTime?:      string;
  flexible?:     boolean;
  graceMinutes?: number;
}): AttendanceSettings {
  return {
    mode:                   'FULL',
    requireManagerApproval: false,
    workSchedule: {
      startTime: '08:30',
      endTime:   overrides.endTime   ?? '17:30',
      flexible:  overrides.flexible  ?? false,
    },
    lateRule:       { graceMinutes: 15 },
    earlyLeaveRule: { graceMinutes: overrides.graceMinutes ?? 5 },
    otRule:         { enabled: false, startAfterMinutes: 30, requireApproval: true },
    locationRule:   { enabled: false, radiusMeters: 100 },
    photoRule:      { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:       { imageMode: 'OFF' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// On time / valid leave
// ─────────────────────────────────────────────────────────────────────────────

describe('isEarlyLeave() — on time / valid leave', () => {
  it('returns false when checking out exactly at endTime', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('17:30'), s)).toBe(false);
  });

  it('returns false when checking out within the grace window', () => {
    // 17:30 end, 5 min grace → allowed from 17:25 onward; 17:27 is within
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('17:27'), s)).toBe(false);
  });

  it('returns false when checking out after endTime', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('18:00'), s)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Early leave
// ─────────────────────────────────────────────────────────────────────────────

describe('isEarlyLeave() — early leave', () => {
  it('returns true when checking out 1 minute before the allowed boundary', () => {
    // 17:30 end, 5 min grace → boundary at 17:25; 17:24 is 1 min early
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('17:24'), s)).toBe(true);
  });

  it('returns true when checking out significantly early', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('15:00'), s)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe('isEarlyLeave() — exact boundary', () => {
  it('returns false at exactly (endTime - graceMinutes) — boundary is inclusive, not early', () => {
    // 17:30 end, 5 min grace → 17:25 is the earliest allowed checkout
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('17:25'), s)).toBe(false);
  });

  it('returns true 1 minute before the boundary', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5 });
    expect(isEarlyLeave(makeDate('17:24'), s)).toBe(true);
  });

  it('handles boundary correctly for large grace window', () => {
    // 18:00 end, 30 min grace → boundary at 17:30
    const s = makeSettings({ endTime: '18:00', graceMinutes: 30 });
    expect(isEarlyLeave(makeDate('17:30'), s)).toBe(false);   // exactly at boundary
    expect(isEarlyLeave(makeDate('17:29'), s)).toBe(true);    // 1 min before
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flexible schedule
// ─────────────────────────────────────────────────────────────────────────────

describe('isEarlyLeave() — flexible schedule', () => {
  it('returns false regardless of how early the check-out is', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 5, flexible: true });
    expect(isEarlyLeave(makeDate('08:00'), s)).toBe(false);
  });

  it('returns false even when checking out at shift start', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 0, flexible: true });
    expect(isEarlyLeave(makeDate('08:30'), s)).toBe(false);
  });

  it('ignores graceMinutes completely when flexible is true', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 0, flexible: true });
    expect(isEarlyLeave(makeDate('17:29'), s)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zero grace minutes
// ─────────────────────────────────────────────────────────────────────────────

describe('isEarlyLeave() — zero grace minutes', () => {
  it('returns false when checking out exactly at endTime', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 0 });
    expect(isEarlyLeave(makeDate('17:30'), s)).toBe(false);
  });

  it('returns true when checking out 1 minute before endTime', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 0 });
    expect(isEarlyLeave(makeDate('17:29'), s)).toBe(true);
  });

  it('returns false when checking out after endTime', () => {
    const s = makeSettings({ endTime: '17:30', graceMinutes: 0 });
    expect(isEarlyLeave(makeDate('17:31'), s)).toBe(false);
  });
});
