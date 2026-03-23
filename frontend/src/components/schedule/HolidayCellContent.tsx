/**
 * HolidayCellContent.tsx
 *
 * Shared holiday rendering primitives used by BOTH the admin SchedulesPage
 * and the employee MySchedulePage.
 *
 * Business rules encoded here:
 *   WEEKLY_WORKING_TIME + holiday → HolidayNameBlock replaces working-time display
 *   SHIFT_TIME + holiday          → HolidayNameAnnotation appears below shift badges;
 *                                   shift creation/editing remain unblocked
 *
 * Both components show ONLY the holiday name — no "วันหยุด" label anywhere.
 *
 * `isToday` is used by the employee calendar to invert colours on the
 * highlighted-today cell.  The admin grid does not have a today-cell concept
 * so it always passes `false` (or omits the prop).
 */

// ─── HolidayNameBlock ─────────────────────────────────────────────────────────

/**
 * WEEKLY_WORKING_TIME: replaces the working-time display on a holiday day.
 *
 * Rendered instead of the time range.  No day-off badge, no "Holiday" prefix.
 */
export function HolidayNameBlock({
  name,
  isToday = false,
}: {
  name:     string;
  isToday?: boolean;
}) {
  return (
    <span
      className={[
        'block w-full truncate text-center text-[10px] font-semibold leading-tight',
        isToday ? 'text-red-200' : 'text-red-500',
      ].join(' ')}
      title={name}
    >
      {name}
    </span>
  );
}

// ─── HolidayNameAnnotation ────────────────────────────────────────────────────

/**
 * SHIFT_TIME: calendar annotation rendered below shift badges on a holiday.
 *
 * Does NOT replace or block shifts — it is purely additive.
 * Shows only the holiday name at reduced weight and opacity.
 */
export function HolidayNameAnnotation({
  name,
  isToday = false,
}: {
  name:     string;
  isToday?: boolean;
}) {
  return (
    <span
      className={[
        'mt-0.5 block w-full truncate text-center text-[9px] font-medium leading-tight',
        isToday ? 'text-red-200' : 'text-red-400',
      ].join(' ')}
      title={name}
    >
      {name}
    </span>
  );
}
