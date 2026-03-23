/**
 * sliceRangeByDay — clip an absolute TimeRange to a single calendar day window.
 *
 * Problem being solved:
 *   A cross-midnight working-time range, e.g. DayN 20:00 → DayN+1 04:00,
 *   must be presented to the time-range engine as only the portion that
 *   falls within the calendar day being rendered.
 *
 *   Without slicing, the full cross-midnight range is passed to
 *   computeAllowedTimeRanges().  For Day N that means the engine reasons
 *   about a range whose END is 04:00 tomorrow — semantically correct for
 *   overlap math, but it means the engine's range extends beyond the visible
 *   dropdown window (00:00–23:30 of today).
 *
 *   With slicing:
 *     Day N view   → [DayN 20:00, DayN 24:00)   (blocks 20:00–23:30 only)
 *     Day N+1 view → [DayN+1 00:00, DayN+1 04:00) (blocks 00:00–03:30 only)
 *
 * Usage:
 *   Apply this to every blocked TimeRange BEFORE calling
 *   computeAllowedTimeRanges().  Null results (range outside window) are
 *   filtered out.
 *
 * Non-regression guarantees:
 *   - rangeEngine.ts / rangesOverlap() — untouched
 *   - normalizeHhmm() — untouched
 *   - overlap formula — untouched
 *   - holiday system — untouched
 *   - future leave ranges (source 'FUTURE_RESERVED') — work automatically
 */

import type { TimeRange } from './rangeEngine';

/**
 * Clip `range` to the 24-hour window of `date` (YYYY-MM-DD).
 *
 * Window:  [date 00:00:00, date+1 00:00:00)
 *
 * Returns the intersection of `range` with this window, preserving the
 * original source tag so the engine can still produce the correct
 * OVERLAP_MAIN / OVERLAP_EXTRA tooltip.
 *
 * Returns null when the range does not intersect the day window at all
 * (range is entirely before or entirely after the day).
 */
export function sliceRangeByDay(range: TimeRange, date: string): TimeRange | null {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd   = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const start = range.start > dayStart ? range.start : dayStart;
  const end   = range.end   < dayEnd   ? range.end   : dayEnd;

  if (start >= end) return null;

  return { ...range, start, end };
}
