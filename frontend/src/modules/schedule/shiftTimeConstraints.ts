/**
 * shiftTimeConstraints — Shift time validity helpers
 *
 * Invariant: startTime ALWAYS belongs to the selected date.
 *   isOvernight=false — endTime is on the SAME calendar day.
 *                       '00:00' is a special midnight sentinel meaning 24:00 same day.
 *   isOvernight=true  — endTime is on the NEXT calendar day.
 *
 * Forbidden state: startTime='00:00' AND isOvernight=true.
 *   normalizeHhmm() relies on the heuristic `end <= start` to detect cross-midnight.
 *   When startTime='00:00' this heuristic fails for any endTime > '00:00', so the
 *   overnight flag would be silently ignored.  The state MUST be prevented at input.
 *
 * NO business logic other than shift-time constraints lives here.
 */

import type { SlotState } from './timeRangeEngine';

// ─── All 15-min time slots in HH:mm order (00:00 … 23:45) ────────────────────

const ALL_SLOTS_ORDERED: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    ALL_SLOTS_ORDERED.push(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    );
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * True when start='00:00' AND isOvernight=true — a state normalizeHhmm() cannot
 * represent correctly.  Must be prevented in the UI and rejected by the backend.
 */
export function isForbiddenShiftState(start: string, isOvernight: boolean): boolean {
  return start === '00:00' && isOvernight;
}

/**
 * True when the (start, end, isOvernight) triple is internally consistent.
 * Assumes start and end are already valid HH:mm strings.
 *
 * Rules:
 *   isOvernight=true  → end must be strictly before start (end < start).
 *   isOvernight=false → end must be strictly after start  (end > start),
 *                       OR end='00:00' with start ≠ '00:00' (midnight sentinel).
 */
export function isValidShiftTime(
  start: string,
  end:   string,
  isOvernight: boolean
): boolean {
  if (!start || !end)                          return false;
  if (isForbiddenShiftState(start, isOvernight)) return false;

  if (isOvernight) {
    return end < start;                         // end on next day, must precede start
  }
  return end > start || (end === '00:00' && start !== '00:00');
}

/**
 * Build the SlotState[] for the end-time picker given a shift's startTime and
 * isOvernight flag.  All 96 slots are returned so the <select> shows the full
 * clock; invalid slots are marked `disabled` with reason 'INVALID_ORDER'.
 *
 * isOvernight=false layout: '00:15'…'23:45' in order, then '00:00' at the
 *   bottom as the midnight sentinel (represents 24:00 same day).
 *
 * isOvernight=true layout: '00:00'…'23:45' in order; slots ≥ start are disabled.
 *
 * Returns [] when isForbiddenShiftState(start, isOvernight) is true.
 */
export function getAllowedEndSlots(start: string, isOvernight: boolean): SlotState[] {
  if (isForbiddenShiftState(start, isOvernight)) return [];

  if (isOvernight) {
    // Valid ends: strictly before start in HH:mm space
    return ALL_SLOTS_ORDERED.map((slot) => ({
      value:    slot,
      disabled: slot >= start,
      reason:   slot >= start ? ('INVALID_ORDER' as const) : undefined,
    }));
  }

  // overnight=false: non-midnight slots first, midnight sentinel at the end
  const nonMidnight = ALL_SLOTS_ORDERED.filter((s) => s !== '00:00');
  const regular: SlotState[] = nonMidnight.map((slot) => ({
    value:    slot,
    disabled: slot <= start,                    // must be strictly after start
    reason:   slot <= start ? ('INVALID_ORDER' as const) : undefined,
  }));
  const midnight: SlotState = {
    value:    '00:00',
    disabled: start === '00:00',                // zero-duration when start is also midnight
    reason:   start === '00:00' ? ('INVALID_ORDER' as const) : undefined,
  };
  return [...regular, midnight];
}
