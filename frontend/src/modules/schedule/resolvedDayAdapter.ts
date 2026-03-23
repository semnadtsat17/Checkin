/**
 * Resolved Day Adapter
 *
 * Pure adapter — converts ResolvedCalendarDay (API shape) into absolute
 * TimeRange[] (rangeEngine shape) suitable for OT validation.
 *
 * Rules:
 *   WEEKLY_WORKING_TIME — one range from weeklyTime.
 *     weeklyTime is absent on holidays, so holiday rest days return []
 *     without any special holiday branch.
 *   SHIFT_TIME — one range per assigned shift.
 *     Cross-midnight shifts (endTime ≤ startTime) are normalised to extend
 *     into the next calendar day via normalizeHhmm().
 *   Day-off / empty — returns [].
 *
 * NO business logic lives here.  All overlap math stays in rangeEngine.ts.
 *
 * Leave system hook:
 *   When leave is implemented, the caller appends leave ranges
 *   (source 'FUTURE_RESERVED') to the array returned by
 *   buildBlockedFromResolvedDays().  No change to this file needed.
 */

import { normalizeHhmm, addDays, type TimeRange } from './rangeEngine';
import type { ResolvedCalendarDay } from '../../api/schedules';

/**
 * Convert one resolved calendar day into absolute TimeRanges.
 *
 * @param day   ResolvedCalendarDay from the employee-calendar endpoint.
 * @param date  The calendar date this day represents — YYYY-MM-DD.
 *              Passed separately so the adapter can handle cross-midnight
 *              shifts by anchoring to the correct calendar date.
 */
export function resolvedDayToRanges(day: ResolvedCalendarDay, date: string): TimeRange[] {
  if (day.isDayOff) return [];

  const ranges: TimeRange[] = [];

  // WEEKLY_WORKING_TIME path.
  // weeklyTime is absent on holidays (backend omits it) so this branch
  // naturally returns [] for holiday rest days without a holiday guard.
  if (day.weeklyTime) {
    ranges.push(
      normalizeHhmm(date, day.weeklyTime.startTime, day.weeklyTime.endTime, 'WORKING_TIME')
    );
  }

  // SHIFT_TIME path — all assigned shifts.
  // normalizeHhmm handles cross-midnight: if endTime ≤ startTime the range
  // automatically extends into the next calendar day.
  for (const shift of day.shifts) {
    if (shift.startTime && shift.endTime) {
      ranges.push(normalizeHhmm(date, shift.startTime, shift.endTime, 'SHIFT'));
    }
  }

  return ranges;
}

/**
 * Build the complete set of blocked working-time ranges for a given OT date.
 *
 * Combines:
 *   1. Current-day ranges (may extend past midnight via normalizeHhmm).
 *   2. Previous-day ranges that cross midnight into today.
 *
 * Cross-day detection:
 *   normalizeHhmm() places cross-midnight shift ends on the next calendar day.
 *   We then filter previous-day results to only those that overlap the
 *   current day's window [date 00:00, date+1 00:00).
 *   All comparisons use absolute Date objects — no string heuristics.
 *
 * @param date    The OT date — YYYY-MM-DD.
 * @param current Resolved calendar day for `date`.
 * @param prev    Resolved calendar day for the day before `date`.
 *                Pass undefined when unavailable; previous-day check is skipped.
 */
export function buildBlockedFromResolvedDays(
  date:    string,
  current: ResolvedCalendarDay | undefined,
  prev:    ResolvedCalendarDay | undefined
): TimeRange[] {
  const prevDate    = addDays(date, -1);
  const windowStart = new Date(`${date}T00:00:00`);
  const windowEnd   = new Date(`${addDays(date, 1)}T00:00:00`);

  const currentRanges = current ? resolvedDayToRanges(current, date)    : [];
  const prevRanges    = prev    ? resolvedDayToRanges(prev,    prevDate) : [];

  // Keep only prev-day ranges whose end crosses midnight into today.
  // No range from the previous day with end ≤ 00:00 of today can block anything.
  const prevOverflow = prevRanges.filter(
    (r) => r.start < windowEnd && r.end > windowStart
  );

  return [...currentRanges, ...prevOverflow];
}
