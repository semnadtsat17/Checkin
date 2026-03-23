/**
 * buildHolidayDate — construct a Date from an MM-DD anchor and a reference year.
 *
 * Used for sorting (chronological order) and upcoming-holiday detection.
 * Pure computation — never persisted, never sent to any API.
 */
export function buildHolidayDate(
  mmdd: string,
  referenceYear: number = new Date().getFullYear(),
): Date {
  const [month, day] = mmdd.split('-').map(Number);
  return new Date(referenceYear, month - 1, day);
}

/**
 * formatHolidayDate — display-only formatter for MM-DD holiday dates.
 *
 * Input:  "04-13"  (holiday_dates.date storage format — never modified here)
 * Output: locale-aware full date string using the current (or provided) year.
 *
 * Thai  (th-TH): "13 เมษายน 2569"  — Buddhist Era via Intl, no manual +543
 * English (en-US): "April 13, 2026"
 *
 * IMPORTANT: This function is purely presentational.
 * It does NOT modify stored values, API payloads, or sorting keys.
 */
export function formatHolidayDate(
  mmdd: string,
  locale: 'th' | 'en',
  referenceYear?: number,
): string {
  const [mm, dd] = mmdd.split('-').map(Number);
  if (!mm || !dd) return mmdd; // fallback: return raw value if malformed

  const year = referenceYear ?? new Date().getFullYear();
  const date = new Date(year, mm - 1, dd);

  if (locale === 'th') {
    return new Intl.DateTimeFormat('th-TH', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
    }).format(date);
  }

  return new Intl.DateTimeFormat('en-US', {
    day:   'numeric',
    month: 'long',
    year:  'numeric',
  }).format(date);
}
