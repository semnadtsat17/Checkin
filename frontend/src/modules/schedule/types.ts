/**
 * Normalized schedule types — shared between all schedule-aware views.
 *
 * ResolvedDay is the single data shape that flows into ScheduleCell.
 * It is produced by useResolvedSchedule (employee calendar) and is structurally
 * compatible with the data the admin grid already holds, so both pages can
 * render through the same component without duplicating logic.
 */

export type PatternType = 'WEEKLY_WORKING_TIME' | 'SHIFT_TIME';

/** Shift display info for one assigned shift code. */
export interface ResolvedShift {
  code:      string;
  nameTh:    string;
  startTime: string;
  endTime:   string;
}

/**
 * One calendar day — authoritative shape for all schedule rendering.
 *
 * Produced by normalising ResolvedCalendarDay in useResolvedSchedule.
 * Consumed by ScheduleCell and any future schedule view.
 */
export interface ResolvedDay {
  date:         string;           // YYYY-MM-DD
  patternType:  PatternType;      // inferred from resolver 'source' field
  isHoliday:    boolean;
  holidayName?: string;           // defined iff isHoliday === true
  /** Present only for WEEKLY_WORKING_TIME working days. */
  workingTime?: { startTime: string; endTime: string };
  isDayOff:     boolean;
  shiftCodes:   string[];         // SHIFT_TIME — assigned codes
  shifts:       ResolvedShift[];  // SHIFT_TIME — display info per code
}
