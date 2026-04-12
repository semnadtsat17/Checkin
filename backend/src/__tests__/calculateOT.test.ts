/**
 * calculateOT.test.ts
 *
 * Unit tests for calculateOT().
 * Structure mirrors isLate.test.ts and isEarlyLeave.test.ts for consistency.
 */
import { describe, it, expect } from 'vitest';
import { calculateOT } from '../modules/attendance/utils/calculateOT';
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
  endTime?:            string;
  flexible?:           boolean;
  otEnabled?:          boolean;
  startAfterMinutes?:  number;
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
    earlyLeaveRule: { graceMinutes: 5 },
    otRule: {
      enabled:           overrides.otEnabled          ?? true,
      startAfterMinutes: overrides.startAfterMinutes  ?? 30,
      requireApproval:   false,
    },
    locationRule: { enabled: false, radiusMeters: 100 },
    photoRule:    { requireCheckInPhoto: false, requireCheckOutPhoto: false },
    hrReport:     { imageMode: 'OFF' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OT disabled
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — OT disabled', () => {
  it('returns 0 regardless of check-out time', () => {
    const s = makeSettings({ otEnabled: false });
    expect(calculateOT(makeDate('20:00'), s)).toBe(0);
  });

  it('returns 0 even when check-out is hours past shift end', () => {
    const s = makeSettings({ otEnabled: false });
    expect(calculateOT(makeDate('23:59'), s)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No OT yet (before or at threshold)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — no OT yet', () => {
  // endTime 17:30 + 30 min → OT threshold at 18:00

  it('returns 0 when checking out before the OT threshold', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('17:45'), s)).toBe(0);
  });

  it('returns 0 when checking out exactly at the OT threshold', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('18:00'), s)).toBe(0);
  });

  it('returns 0 when checking out at shift end (before threshold)', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('17:30'), s)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Valid OT
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — valid OT', () => {
  // endTime 17:30 + 30 min → OT threshold at 18:00

  it('returns 1 when checking out 1 minute after the threshold', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('18:01'), s)).toBe(1);
  });

  it('returns correct minutes for a 2-hour OT session', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    // threshold 18:00, checkout 20:00 → 120 OT minutes
    expect(calculateOT(makeDate('20:00'), s)).toBe(120);
  });

  it('returns correct minutes for a partial OT session', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    // threshold 18:00, checkout 18:45 → 45 OT minutes
    expect(calculateOT(makeDate('18:45'), s)).toBe(45);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Boundary precision
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — boundary precision', () => {
  it('returns 0 at exactly (endTime + startAfterMinutes)', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('18:00'), s)).toBe(0);
  });

  it('returns 1 at exactly 1 minute past the threshold', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30 });
    expect(calculateOT(makeDate('18:01'), s)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zero startAfterMinutes
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — zero startAfterMinutes', () => {
  // OT threshold == endTime exactly

  it('returns 0 when checking out exactly at endTime', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 0 });
    expect(calculateOT(makeDate('17:30'), s)).toBe(0);
  });

  it('returns 1 when checking out 1 minute after endTime', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 0 });
    expect(calculateOT(makeDate('17:31'), s)).toBe(1);
  });

  it('returns 0 when checking out before endTime', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 0 });
    expect(calculateOT(makeDate('17:00'), s)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flexible schedule
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateOT() — flexible schedule', () => {
  it('still calculates OT normally when flexible is true', () => {
    // Flexible does NOT cancel OT — OT is determined by the clock, not shift rigidity
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30, flexible: true });
    // threshold 18:00, checkout 18:45 → 45 OT minutes
    expect(calculateOT(makeDate('18:45'), s)).toBe(45);
  });

  it('returns 0 at the OT threshold even with flexible schedule', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30, flexible: true });
    expect(calculateOT(makeDate('18:00'), s)).toBe(0);
  });

  it('returns correct OT for 1 minute past threshold with flexible schedule', () => {
    const s = makeSettings({ endTime: '17:30', startAfterMinutes: 30, flexible: true });
    expect(calculateOT(makeDate('18:01'), s)).toBe(1);
  });
});
