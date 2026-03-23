/**
 * Availability Engine — Employee Busy Timeline
 *
 * Converts schedule data (resolved calendar days + extra-work entries) into a
 * single merged busy timeline of absolute TimeRange[].
 *
 * OT validation rule:
 *   A candidate OT range is valid iff it does NOT overlap any range in the
 *   busy timeline.  All overlap math delegates to rangesOverlap() in
 *   rangeEngine.ts — the single overlap truth for the entire application.
 *
 * Cross-midnight shifts:
 *   resolvedDayToRanges() calls normalizeHhmm(day.date, …) for every range.
 *   normalizeHhmm() is the ONLY cross-midnight interpreter — no date arithmetic
 *   is performed here.  Cross-midnight ranges naturally extend into the next
 *   calendar day and are handled correctly by the merge step.
 *
 * Leave extensibility (Phase 5 hook):
 *   When leave is implemented, add leave TimeRange[] to the input and append
 *   them to the merge input array.  No logic in this file changes.
 *
 *   Example future caller:
 *     buildEmployeeBusyTimeline({ resolvedDays, extraWorks, leaveRanges })
 */

import { apiRangesToAbsolute, type TimeRange } from '../schedule/rangeEngine';
import { resolvedDayToRanges }                 from '../schedule/resolvedDayAdapter';
import { normalizeEndTime }                    from './timeSemantics';
import type { ResolvedCalendarDay }             from '../../api/schedules';
import type { ExtraWork }                       from '@hospital-hr/shared';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Merge overlapping or touching absolute TimeRanges into the smallest set of
 * non-overlapping intervals, sorted by start time.
 *
 * Touching ranges (a.end === b.start) ARE merged — a shift ending at 16:00
 * and an OT starting at 16:00 form a single busy block.
 */
function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const result: TimeRange[] = [];

  for (const r of sorted) {
    const last = result[result.length - 1];
    if (!last || last.end <= r.start) {
      result.push({ ...r });
    } else {
      last.end = new Date(
        Math.max(last.end.getTime(), r.end.getTime())
      );
    }
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the employee's complete busy timeline from resolved schedule days
 * and existing extra-work entries.
 *
 * Steps:
 *   1. Convert every resolved day to absolute TimeRange[] via resolvedDayToRanges().
 *   2. Convert every extra-work entry to an absolute TimeRange via apiRangesToAbsolute().
 *   3. Merge all ranges into a sorted, non-overlapping busy timeline.
 *
 * @param resolvedDays  Calendar days from the API (any span).  Pass ALL days
 *                      available — the function processes every day so that
 *                      cross-midnight overflow is captured without prevDay lookups.
 * @param extraWorks    Existing OT entries to treat as busy time.  The caller
 *                      is responsible for excluding the entry currently being
 *                      created or edited (self-block prevention).
 */
export function buildEmployeeBusyTimeline(params: {
  resolvedDays: ResolvedCalendarDay[];
  extraWorks:   ExtraWork[];
}): TimeRange[] {
  const { resolvedDays, extraWorks } = params;

  // Shift / weekly working-time ranges.
  // resolvedDayToRanges anchors every range to day.date — invariant preserved.
  const shiftRanges: TimeRange[] = resolvedDays.flatMap((day) =>
    resolvedDayToRanges(day, day.date)
  );

  // Extra-work ranges anchored to each entry's own date.
  const ewRanges: TimeRange[] = extraWorks.flatMap((ew) =>
    apiRangesToAbsolute(
      ew.date,
      [{ start: ew.startTime, end: normalizeEndTime(ew.endTime) }],
      'EXTRA_WORK'
    )
  );

  return mergeRanges([...shiftRanges, ...ewRanges]);
}
