/**
 * Canonical week-start utilities for the Hospital HR frontend.
 *
 * Why NOT toISOString().slice(0, 10):
 *   toISOString() always returns UTC. On a UTC+7 machine, local midnight
 *   2026-02-23T00:00:00+07:00 becomes 2026-02-22T17:00:00Z, so slicing
 *   gives "2026-02-22" instead of "2026-02-23". This caused draft week
 *   keys to be one day behind, producing ghost overwrites and uneditable
 *   schedule cells.
 *
 * Fix: read date parts from the LOCAL Date object (getFullYear / getMonth /
 * getDate) which always reflect the machine's timezone correctly.
 */

/** Format a Date as YYYY-MM-DD using local timezone date parts. */
export function toLocalIso(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Returns the ISO-8601 week start (Monday) for the week that contains `date`.
 *
 * @param date - YYYY-MM-DD string OR a Date object.
 * @returns    YYYY-MM-DD string of the Monday of that week.
 */
export function getWeekStart(date: string | Date): string {
  const d = typeof date === 'string'
    ? new Date(date + 'T00:00:00')   // parse as LOCAL midnight
    : new Date(date);
  const dow = d.getDay();            // 0 = Sunday
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const result = toLocalIso(d);
  console.debug('[getWeekStart]', {
    input: typeof date === 'string' ? date : toLocalIso(date),
    computedWeekStart: result,
  });
  return result;
}

/**
 * Returns the 7 ISO dates (Mon → Sun) for the week starting at `weekStart`.
 *
 * @param weekStart - YYYY-MM-DD string of a Monday.
 */
export function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toLocalIso(d);
  });
}
