/**
 * ScheduleCell — single rendering authority for schedule cell content.
 *
 * Enforces the business rules for holiday display across ALL schedule views:
 *
 *   WEEKLY_WORKING_TIME + holiday  → renders HolidayNameBlock only (replaces working time)
 *   SHIFT_TIME          + holiday  → renders children + HolidayNameAnnotation below
 *   any pattern         + no holiday → renders children unchanged
 *
 * This component is PURELY structural — it decides WHEN holidays render and WHERE.
 * The actual content for working time, shift badges, day-off indicators, etc.
 * is always provided by the caller as children.
 *
 * Usage — admin grid cell:
 *   <ScheduleCell patternType="SHIFT_TIME" holiday={{ name: "Labour Day" }}>
 *     <CellBadge cell={cell} isPending={isPending} shifts={shifts} />
 *   </ScheduleCell>
 *
 * Usage — employee calendar cell:
 *   <ScheduleCell patternType="WEEKLY_WORKING_TIME" holiday={null} isToday={isToday}>
 *     <WeeklyDayEntry day={workingTime} isToday={isToday} />
 *   </ScheduleCell>
 *
 * Adding a new schedule view: wrap its cell content in <ScheduleCell />.
 * Holiday logic is automatic — no per-page implementation needed.
 */

import type { ReactNode } from 'react';
import type { PatternType } from '../../modules/schedule/types';
import { HolidayNameBlock, HolidayNameAnnotation } from './HolidayCellContent';

export interface ScheduleCellProps {
  patternType: PatternType;
  holiday?:    { name: string } | null;
  isToday?:    boolean;
  children?:   ReactNode;
}

export function ScheduleCell({
  patternType,
  holiday,
  isToday = false,
  children,
}: ScheduleCellProps) {
  // WEEKLY + holiday: replace working time with the holiday name.
  if (patternType === 'WEEKLY_WORKING_TIME' && holiday?.name) {
    return <HolidayNameBlock name={holiday.name} isToday={isToday} />;
  }

  // SHIFT + holiday: show shift content as-is, append holiday annotation below.
  if (patternType === 'SHIFT_TIME' && holiday?.name) {
    return (
      <>
        {children}
        <HolidayNameAnnotation name={holiday.name} isToday={isToday} />
      </>
    );
  }

  // No holiday: passthrough.
  return <>{children}</>;
}
