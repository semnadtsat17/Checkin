/**
 * timeOptions — Generate HH:mm option lists for plain <select> pickers.
 *
 * IMPORTANT: "24:00" appears ONLY as a display option in the dropdown.
 * The value must be normalised with normalizeTimeInput() from timeCanonical.ts
 * before being stored in state or sent to the API.
 *
 * The engine-driven OT TimePicker (slots prop) does NOT use this generator —
 * it gets its options from computeAllowedTimeRanges() in timeRangeEngine.ts.
 * Use generateTimeOptions() only for simple, unvalidated time selects.
 */

/**
 * Returns HH:mm strings from 00:00 up to (but not including) 24:00,
 * spaced by `stepMinutes`, with "24:00" appended as a visual end-of-day option.
 *
 * Example (stepMinutes=30):
 *   ["00:00", "00:30", ..., "23:30", "24:00"]
 */
export function generateTimeOptions(stepMinutes = 30): string[] {
  const result: string[] = [];

  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    const h  = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    result.push(`${h}:${mm}`);
  }

  // Visual-only sentinel — represents end of calendar day.
  // Normalize with normalizeTimeInput() before using as a value.
  result.push('24:00');

  return result;
}
