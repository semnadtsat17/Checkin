/**
 * timeSemantics — Scheduling end-time normalisation helper
 *
 * End "00:00" has dual meaning in scheduling:
 *   • As a START time it means the beginning of the calendar day.
 *   • As an END time it means 24:00 — the end of the calendar day.
 *
 * normalizeHhmm() already handles the cross-midnight case via the
 * `end <= start` heuristic, but that heuristic is bypassed when the
 * end slot is compared against start using toAbsoluteDate() directly
 * (e.g. inside timeRangeEngine.ts endSlots).
 *
 * Solution: convert "00:00" to "24:00" BEFORE any normalization call.
 * toAbsoluteDate("24:00") rolls over to next-day midnight via
 * JavaScript's Date.setHours(24) semantics — identical to the result
 * of normalizeHhmm's cross-midnight push.
 *
 * INVARIANT: call this function only on END times, never on START times.
 */

export function normalizeEndTime(end: string): string {
  // Scheduling semantic: end 00:00 = end of day (24:00)
  return end === '00:00' ? '24:00' : end;
}
