/**
 * simpleMode.test.ts
 *
 * Covers:
 *   A. Guard behaviour (SIMPLE_MODE_RESTRICTED throws / does not throw)
 *   B. Processor public API — existing snapshot tests (unchanged contract)
 *   C. Engine isolation — SIMPLE engine never inspects schedule data
 *   D. Registry — returns correct engine based on isSimpleMode() value
 *   E. Engine switch without restart — registry reflects mode change immediately
 *   F. NORMAL engine output identical to pre-engine snapshot values
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Stub isSimpleMode before any consumer is imported ───────────────────────
// vi.mock is hoisted above all imports by Vitest.
// Every module in the import graph (processor → registry → runtime) will see
// this stub, so no file system or EventEmitter is touched during tests.

vi.mock('../modules/org-settings/orgSettings.runtime', () => ({
  isSimpleMode: vi.fn(() => false),   // default: NORMAL mode
  getOrgMode:   vi.fn(() => 'NORMAL'),
}));

import { isSimpleMode } from '../modules/org-settings/orgSettings.runtime';
import { resolveCheckInStatus, resolveCheckOutStatus } from '../modules/attendance/attendance.processor';
import { assertNotSimpleMode } from '../modules/attendance/guards/simpleMode.guard';
import { getAttendanceEngine } from '../modules/attendance/engines/attendanceEngine.registry';
import { normalAttendanceEngine } from '../modules/attendance/engines/normalAttendance.engine';
import { simpleAttendanceEngine }  from '../modules/attendance/engines/simpleAttendance.engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockIsSimpleMode = vi.mocked(isSimpleMode);

function setMode(simple: boolean): void {
  mockIsSimpleMode.mockReturnValue(simple);
}

const SHIFT_9_TO_17 = { startTime: '09:00', endTime: '17:00' };

function makeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

beforeEach(() => setMode(false));

// ─────────────────────────────────────────────────────────────────────────────
// A.  Guard
// ─────────────────────────────────────────────────────────────────────────────

describe('assertNotSimpleMode (guard)', () => {
  it('throws SIMPLE_MODE_RESTRICTED (403) in SIMPLE mode', () => {
    setMode(true);
    expect(() => assertNotSimpleMode('OT creation')).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'SIMPLE_MODE_RESTRICTED' }),
    );
  });

  it('does not throw in NORMAL mode', () => {
    setMode(false);
    expect(() => assertNotSimpleMode('OT creation')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B.  Processor public API — snapshot contract (must not change)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCheckInStatus (processor public API)', () => {
  describe('SIMPLE mode', () => {
    beforeEach(() => setMode(true));

    it('returns present when employee has no schedule', () => {
      expect(resolveCheckInStatus(makeDate('08:00'), null)).toBe('present');
    });

    it('returns present even when arriving late', () => {
      expect(resolveCheckInStatus(makeDate('09:30'), SHIFT_9_TO_17)).toBe('present');
    });

    it('returns present when arriving early', () => {
      expect(resolveCheckInStatus(makeDate('07:00'), SHIFT_9_TO_17)).toBe('present');
    });
  });

  describe('NORMAL mode', () => {
    beforeEach(() => setMode(false));

    it('returns pending_approval when no schedule', () => {
      expect(resolveCheckInStatus(makeDate('09:00'), null)).toBe('pending_approval');
    });

    it('returns present when on time (within grace)', () => {
      expect(resolveCheckInStatus(makeDate('09:10'), SHIFT_9_TO_17)).toBe('present');
    });

    it('returns late when beyond grace period (09:16 > 09:00 + 15 min)', () => {
      expect(resolveCheckInStatus(makeDate('09:16'), SHIFT_9_TO_17)).toBe('late');
    });
  });
});

describe('resolveCheckOutStatus (processor public API)', () => {
  describe('SIMPLE mode', () => {
    beforeEach(() => setMode(true));

    it('preserves present status even when leaving 2 hours early', () => {
      expect(resolveCheckOutStatus('present', makeDate('15:00'), '17:00')).toBe('present');
    });

    it('preserves late status on early checkout', () => {
      expect(resolveCheckOutStatus('late', makeDate('15:00'), '17:00')).toBe('late');
    });
  });

  describe('NORMAL mode', () => {
    beforeEach(() => setMode(false));

    it('marks early_leave when leaving >5 min before shift end', () => {
      expect(resolveCheckOutStatus('present', makeDate('16:54'), '17:00')).toBe('early_leave');
    });

    it('keeps present when leaving at shift end', () => {
      expect(resolveCheckOutStatus('present', makeDate('17:00'), '17:00')).toBe('present');
    });

    it('does not change pending_approval on checkout', () => {
      expect(resolveCheckOutStatus('pending_approval', makeDate('15:00'), '17:00')).toBe('pending_approval');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C.  Engine isolation — SIMPLE engine never reads schedule data
// ─────────────────────────────────────────────────────────────────────────────

describe('simpleAttendanceEngine isolation', () => {
  it('ignores workingTimes entirely — always present regardless of times passed', () => {
    const anyTimes = { startTime: '06:00', endTime: '23:59' };
    // With times
    expect(simpleAttendanceEngine.resolveCheckInStatus(makeDate('09:00'), anyTimes)).toBe('present');
    // Without times
    expect(simpleAttendanceEngine.resolveCheckInStatus(makeDate('09:00'), null)).toBe('present');
  });

  it('ignores endTime entirely — preserves any incoming status', () => {
    const statuses = ['present', 'late', 'pending_approval', 'early_leave'] as const;
    for (const s of statuses) {
      expect(simpleAttendanceEngine.resolveCheckOutStatus(s, makeDate('15:00'), '17:00')).toBe(s);
      expect(simpleAttendanceEngine.resolveCheckOutStatus(s, makeDate('15:00'), undefined)).toBe(s);
    }
  });

  it('never produces early_leave', () => {
    // Even if the employee leaves a second after shift start — SIMPLE mode cannot produce early_leave
    expect(simpleAttendanceEngine.resolveCheckOutStatus('present', makeDate('09:01'), '17:00')).not.toBe('early_leave');
  });

  it('never produces late', () => {
    // Arriving 8 hours past shift start — SIMPLE mode cannot produce late
    expect(simpleAttendanceEngine.resolveCheckInStatus(makeDate('17:00'), SHIFT_9_TO_17)).not.toBe('late');
  });

  it('never produces pending_approval', () => {
    expect(simpleAttendanceEngine.resolveCheckInStatus(makeDate('09:00'), null)).not.toBe('pending_approval');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D.  Registry — returns correct engine for each mode
// ─────────────────────────────────────────────────────────────────────────────

describe('getAttendanceEngine (registry)', () => {
  it('returns normalAttendanceEngine in NORMAL mode', () => {
    setMode(false);
    expect(getAttendanceEngine()).toBe(normalAttendanceEngine);
  });

  it('returns simpleAttendanceEngine in SIMPLE mode', () => {
    setMode(true);
    expect(getAttendanceEngine()).toBe(simpleAttendanceEngine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E.  Engine switch without restart
// ─────────────────────────────────────────────────────────────────────────────

describe('engine switch (no restart required)', () => {
  it('registry reflects mode change on the very next call', () => {
    setMode(false);
    expect(getAttendanceEngine()).toBe(normalAttendanceEngine);

    // Simulate org-settings PATCH changing mode to SIMPLE
    setMode(true);
    expect(getAttendanceEngine()).toBe(simpleAttendanceEngine);

    // Switch back
    setMode(false);
    expect(getAttendanceEngine()).toBe(normalAttendanceEngine);
  });

  it('processor output changes immediately when mode switches mid-session', () => {
    setMode(false);
    // In NORMAL mode, no schedule → pending_approval
    expect(resolveCheckInStatus(makeDate('09:00'), null)).toBe('pending_approval');

    // Mode flips to SIMPLE
    setMode(true);
    // Same call now returns present — no restart, no re-import
    expect(resolveCheckInStatus(makeDate('09:00'), null)).toBe('present');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F.  NORMAL engine output identical to pre-engine snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe('normalAttendanceEngine snapshot parity', () => {
  // These exact assertions were passing against the inline conditional logic in
  // the original attendance.processor.ts.  They must continue to pass against
  // the extracted normalAttendanceEngine to prove zero behaviour change.

  it('on-time check-in → present', () => {
    expect(normalAttendanceEngine.resolveCheckInStatus(makeDate('09:00'), SHIFT_9_TO_17)).toBe('present');
  });

  it('exactly at grace boundary (09:15) → present', () => {
    // Grace is 15 min: 09:15 is NOT beyond the boundary (not strictly greater)
    expect(normalAttendanceEngine.resolveCheckInStatus(makeDate('09:15'), SHIFT_9_TO_17)).toBe('present');
  });

  it('one minute past grace (09:16) → late', () => {
    expect(normalAttendanceEngine.resolveCheckInStatus(makeDate('09:16'), SHIFT_9_TO_17)).toBe('late');
  });

  it('no schedule → pending_approval', () => {
    expect(normalAttendanceEngine.resolveCheckInStatus(makeDate('09:00'), null)).toBe('pending_approval');
  });

  it('leaving at shift end → present (not early_leave)', () => {
    expect(normalAttendanceEngine.resolveCheckOutStatus('present', makeDate('17:00'), '17:00')).toBe('present');
  });

  it('leaving 6 min early → early_leave', () => {
    expect(normalAttendanceEngine.resolveCheckOutStatus('present', makeDate('16:54'), '17:00')).toBe('early_leave');
  });

  it('leaving exactly at grace boundary (16:55, 5 min early) → present', () => {
    // Early-leave grace is 5 min: 16:55 checkout against 17:00 end is NOT early (not strictly less)
    expect(normalAttendanceEngine.resolveCheckOutStatus('present', makeDate('16:55'), '17:00')).toBe('present');
  });

  it('midnight end time ("00:00") treated as 24:00', () => {
    const nightShift = { startTime: '22:00', endTime: '00:00' };
    // Leaving at 23:50 — 10 minutes before 24:00 (past 5 min grace), early_leave
    expect(normalAttendanceEngine.resolveCheckOutStatus('present', makeDate('23:50'), nightShift.endTime)).toBe('early_leave');
    // Leaving at 23:56 — 4 minutes before 24:00, within grace, present
    expect(normalAttendanceEngine.resolveCheckOutStatus('present', makeDate('23:56'), nightShift.endTime)).toBe('present');
  });

  it('pending_approval status is never changed by checkout', () => {
    expect(normalAttendanceEngine.resolveCheckOutStatus('pending_approval', makeDate('15:00'), '17:00')).toBe('pending_approval');
  });

  it('guard does not interfere in NORMAL mode', () => {
    setMode(false);
    expect(() => assertNotSimpleMode('any operation')).not.toThrow();
  });
});
