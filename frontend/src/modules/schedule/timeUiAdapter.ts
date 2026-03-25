/**
 * timeUiAdapter — UI ↔ API serialization helpers for time values.
 *
 * "24:00" is a DISPLAY-ONLY value representing next-day midnight (24:00 same day).
 * Backend and DB always store this as "00:00".
 *
 * Rules:
 *   serializeUiTime  — "24:00" → "00:00" before any API call.
 *   displayUiEndTime — "00:00" → "24:00" when loading endTime from saved records.
 *
 * Engines (normalizeHhmm, rangesOverlap, timeRangeEngine) are UNCHANGED.
 * toAbsoluteDate(date, "24:00") resolves correctly via JS setHours(24) rollover.
 */

/** Convert a UI time value to the canonical HH:mm format sent to the API. */
export function serializeUiTime(value: string): string {
  return value === '24:00' ? '00:00' : value;
}

/**
 * Convert an API/DB endTime value to its UI display form.
 * "00:00" as endTime represents midnight of the same day (24:00) — shown as "24:00".
 * Apply when loading saved records into form state for endTime fields.
 *
 * NOTE: Do NOT apply to startTime — "00:00" is a valid midnight start.
 */
export function displayUiEndTime(end: string): string {
  return end === '00:00' ? '24:00' : end;
}
