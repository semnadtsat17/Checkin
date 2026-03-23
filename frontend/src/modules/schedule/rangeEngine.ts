/**
 * Range Engine — Absolute Datetime Validation
 *
 * All schedule time validation operates on ABSOLUTE DATETIME RANGES (Date objects).
 * This file is the single overlap truth for the entire application.
 *
 * Core rule (NON-NEGOTIABLE):
 *   Never reason by shift type, shift name, or schedule day ownership.
 *   All validation compares TimeRange objects ONLY.
 *
 * Overlap formula:
 *   a overlaps b  ⟺  a.start < b.end  AND  a.end > b.start
 *   Boundary equality (touching) is NOT overlap.
 *
 * Extensibility for leave system:
 *   Leave periods are modelled as source: 'FUTURE_RESERVED'.
 *   Add leave ranges to the blocked array — validation logic is unchanged.
 *
 * Pure functions only — no React, no async, O(n) per validation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Source tag on every TimeRange.
 *
 * 'FUTURE_RESERVED' — placeholder for the upcoming leave system.
 *   Plug leave periods in as this source; validation works without any changes.
 */
export type RangeSource =
  | 'SHIFT'             // shift-based working time
  | 'WORKING_TIME'      // weekly working time (pattern)
  | 'EXTRA_WORK'        // OT / compensatory work
  | 'HOLIDAY'           // holiday rest period
  | 'FUTURE_RESERVED';  // future: leave system

export interface TimeRange {
  start:  Date;
  end:    Date;
  source: RangeSource;
}

// ─── Overlap — single truth ────────────────────────────────────────────────────

/**
 * THE overlap function for the entire system.
 *
 *   true  ⟺  a.start < b.end  AND  a.end > b.start
 *
 * Boundary touching (a.start === b.end or a.end === b.start) returns false.
 * Only strict interior intersection is an overlap.
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && a.end > b.start;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Combine a YYYY-MM-DD date string and an HH:mm time string into a Date.
 * Treats both as local time (no UTC conversion).
 */
export function toAbsoluteDate(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Return `dateStr` offset by `n` calendar days (positive or negative).
 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── Range constructors ────────────────────────────────────────────────────────

/**
 * Convert an HH:mm start + end pair on a calendar date into an absolute TimeRange.
 *
 * Cross-midnight detection:
 *   If endHhmm <= startHhmm (e.g. start 20:00, end 08:00) the end is placed
 *   on the NEXT calendar day.  This is the ONLY way cross-midnight is encoded.
 *   No shift-label reasoning.
 */
export function normalizeHhmm(
  dateStr:  string,
  startHhmm: string,
  endHhmm:   string,
  source:    RangeSource
): TimeRange {
  const start = toAbsoluteDate(dateStr, startHhmm);
  let   end   = toAbsoluteDate(dateStr, endHhmm);
  // Cross-midnight: end not strictly after start → push end to next day.
  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end, source };
}

/**
 * Convert a list of HH:mm range pairs on a calendar date to absolute TimeRanges.
 * Handles cross-midnight via normalizeHhmm.
 */
export function apiRangesToAbsolute(
  dateStr: string,
  ranges:  { start: string; end: string }[],
  source:  RangeSource
): TimeRange[] {
  return ranges.map((r) => normalizeHhmm(dateStr, r.start, r.end, source));
}

// ─── Cross-day range builder ───────────────────────────────────────────────────

/**
 * Build the complete set of blocked working ranges for a given calendar day,
 * correctly handling shifts that started on the PREVIOUS day and extend
 * past midnight into the current day.
 *
 * Timeline window: [dateStr 00:00, dateStr+1 00:00)
 * Any range overlapping this window is included.
 *
 * @param dateStr         Target day — YYYY-MM-DD.
 * @param currentRanges   Working-time ranges for `dateStr` (HH:mm pairs from API).
 * @param prevDayRanges   Working-time ranges for `dateStr - 1`.  Optional — pass
 *                        when you want cross-day shift protection.
 *
 * Leave system hook:
 *   When the leave system is ready, add leave ranges to the caller's array
 *   using source 'FUTURE_RESERVED' and pass them in `currentRanges`.
 *   No change to this function is needed.
 */
export function buildWorkingRanges(
  dateStr:       string,
  currentRanges: { start: string; end: string }[],
  prevDayRanges?: { start: string; end: string }[]
): TimeRange[] {
  const windowStart = new Date(`${dateStr}T00:00:00`);
  const windowEnd   = new Date(`${addDays(dateStr, 1)}T00:00:00`);
  const result: TimeRange[] = [];

  // Current day ranges — may extend past midnight (cross-midnight into tomorrow)
  for (const r of currentRanges) {
    const range = normalizeHhmm(dateStr, r.start, r.end, 'WORKING_TIME');
    if (range.start < windowEnd && range.end > windowStart) {
      result.push(range);
    }
  }

  // Previous day ranges — only include those that cross midnight into today.
  // A prev-day range is relevant only when its normalized end extends past
  // the current day's start (00:00).
  if (prevDayRanges) {
    const prevDate = addDays(dateStr, -1);
    for (const r of prevDayRanges) {
      const range = normalizeHhmm(prevDate, r.start, r.end, 'WORKING_TIME');
      // range.end > windowStart means the shift extends into (or past) today 00:00
      if (range.start < windowEnd && range.end > windowStart) {
        result.push(range);
      }
    }
  }

  return result;
}

/**
 * Construct the candidate extra-work TimeRange for overlap checking.
 * OT is always same-day — no cross-midnight OT is supported.
 */
export function candidateRange(
  dateStr:   string,
  startHhmm: string,
  endHhmm:   string
): TimeRange {
  return {
    start:  toAbsoluteDate(dateStr, startHhmm),
    end:    toAbsoluteDate(dateStr, endHhmm),
    source: 'EXTRA_WORK',
  };
}
