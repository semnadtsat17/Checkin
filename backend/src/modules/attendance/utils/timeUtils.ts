/**
 * timeUtils.ts
 *
 * Pure time-conversion utilities for attendance business rules.
 * No side effects, no imports from other modules — safe to use anywhere.
 */

/**
 * Converts an "HH:mm" string to total minutes since midnight.
 *
 * @example timeToMinutes("08:30") === 510
 * @throws  Never — caller must pass a validated "HH:mm" string.
 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Extracts the time portion of a Date as total minutes since midnight.
 */
export function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}
