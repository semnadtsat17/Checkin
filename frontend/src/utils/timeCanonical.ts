/**
 * timeCanonical — Single source of truth for time-string normalization.
 *
 * Internal rule:
 *   "00:00" is the canonical representation of midnight / end-of-day.
 *   "24:00" is a display-only label produced by TimePicker (endMode).
 *   The backend NEVER receives "24:00".
 *
 * Call normalizeTimeInput() on any user-facing time value before it
 * is placed in API payloads or state that flows to the backend.
 */

/** Convert a display-facing time string to canonical internal form.
 *  "24:00" → "00:00"; all other values pass through unchanged. */
export function normalizeTimeInput(time: string): string {
  if (time === '24:00') return '00:00';
  return time;
}

/** UI display helper — no transformation in the current design.
 *  Exported so display logic can be updated in one place if needed. */
export function displayTime(time: string): string {
  return time;
}

/** True when `time` is the end-of-day display sentinel ("24:00"). */
export function isEndOfDay(time: string): boolean {
  return time === '24:00';
}
