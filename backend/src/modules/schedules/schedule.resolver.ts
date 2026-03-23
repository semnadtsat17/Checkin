/**
 * schedule.resolver.ts
 *
 * Unified working-time resolver — authoritative schedule source (post Phase 9).
 *
 * PURPOSE
 * -------
 * Provides a single function, resolveWorkingTime(), that returns the effective
 * start/end times for a given employee on a given date by consulting both
 * schedule stores in priority order:
 *
 *   1. schedule_days  (date-based, authoritative UI-managed store)
 *   2. schedules      (week-based, SHIFT_TIME fallback — see warning below)
 *
 * CURRENT STATUS
 * --------------
 * - attendance.service.ts uses this as the SOLE schedule authority.
 * - It does NOT modify any database collection.
 * - All repository instances are independent reads; no writes occur here.
 * - If any resolution step cannot be completed safely, null is returned.
 *   The caller must treat null as "no schedule found."
 *
 * ⚠  LEGACY DEPENDENCY WARNING — DO NOT DELETE 'schedules' COLLECTION
 * -------------------------------------------------------------------
 * The 'schedules' collection (JsonRepository Path B below) MUST NOT be
 * deleted or emptied.  It is still actively required by:
 *
 *   - This resolver      (Path B — sole time-resolution path for all
 *                         SHIFT_TIME departments; Path A does not yet
 *                         implement shift-definition lookup)
 *   - hours module       (computeMonthlySummary → getBreakMinutes reads
 *                         scheduleStore directly for break-minute data)
 *   - report service     (schedule coverage and worked-hours reports query
 *                         scheduleStore for planned shift data)
 *
 * Deleting the collection will silently corrupt monthly hours calculations
 * and break schedule resolution for all SHIFT_TIME employees.
 */

import { JsonRepository }    from '../../shared/repository/JsonRepository';
import type { IRepository }  from '../../shared/repository/IRepository';
import type { WorkSchedulePattern, Department, HolidayDate } from '@hospital-hr/shared';
import type { UserRecord }   from '../employees/employee.service';
import type { ScheduleDayRecord } from './schedule.service';

// ─── Internal type (week-based legacy schedule record) ────────────────────────
//
// Defined locally so this file has no dependency on the attendance module.
// WorkScheduleRecord was removed from attendance.service.ts in Phase 9;
// this local copy is the sole remaining typed reference to that shape.

interface LegacyScheduleRecord {
  id:        string;
  userId:    string;
  weekStart: string;
  days: Record<string, {
    shiftCode:    string | null;
    isDayOff:     boolean;
    timeOverride?: { startTime: string; endTime: string };
  }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Repositories (read-only; no writes occur in this file) ──────────────────

/** Date-based authoritative store — written by the Admin UI via upsertDays(). */
const dayStore:            IRepository<ScheduleDayRecord>     = new JsonRepository<ScheduleDayRecord>('schedule_days');

/** Week-based legacy store — read by this resolver (Path B) and by hours/report modules. */
const legacyScheduleStore: IRepository<LegacyScheduleRecord>  = new JsonRepository<LegacyScheduleRecord>('schedules');

/** Sub-role / shift-definition store — consulted when resolving shift times from legacy records. */
const patternStore:        IRepository<WorkSchedulePattern>   = new JsonRepository<WorkSchedulePattern>('sub_roles');

/** Employee store — consulted to find workSchedulePatternId. */
const employeeStore:       IRepository<UserRecord>            = new JsonRepository<UserRecord>('employees');

/** Department store — consulted by Path 0 to read holidayTypeId and workSchedulePatternId. */
const departmentStore:     IRepository<Department>            = new JsonRepository<Department>('departments');

/** Holiday date store — consulted by Path 0 to match MM-DD against enabled holidays. */
const holidayDateStore:    IRepository<HolidayDate>           = new JsonRepository<HolidayDate>('holiday_dates');

// ─── Output type ──────────────────────────────────────────────────────────────

/**
 * The resolved working time for a single (userId, date) pair.
 *
 * source indicates which store provided the data:
 *   'schedule_days' — came from the authoritative date-based store.
 *   'schedules'     — came from the legacy week-based store (attendance path).
 *   'holiday'       — date is a configured public holiday (WEEKLY_WORKING_TIME only).
 *                     startTime/endTime are empty strings; the holiday field carries
 *                     the holiday record details for UI rendering.
 */
export interface ResolvedWorkingTime {
  startTime: string;  // HH:mm (empty string when source === 'holiday')
  endTime:   string;  // HH:mm (empty string when source === 'holiday')
  source:    'schedule_days' | 'schedules' | 'holiday';
  holiday?:  { id: string; name: string; typeId: string };
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve effective working start/end times for an employee on a given date.
 *
 * Resolution order:
 *   A) schedule_days (published, date-based)
 *   B) schedules     (legacy week-based — exact attendance.service.ts logic)
 *
 * Returns null when:
 *   - The employee has a day-off on that date.
 *   - No schedule exists in either store.
 *   - Times cannot be resolved safely (missing shift definition, pattern, etc.).
 *
 * This function is intentionally async to allow future I/O changes without
 * altering the call-site signature.
 */
export async function resolveWorkingTime(
  userId: string,
  date:   string,
): Promise<ResolvedWorkingTime | null> {

  // Single employee lookup — result shared by Path 0 (holiday gate) and Path B.
  const employee = employeeStore.findById(userId);

  // ── 0. Holiday Gate (WEEKLY_WORKING_TIME departments only) ───────────────────
  //
  // Evaluates whether `date` falls on a configured holiday for this employee's
  // department BEFORE consulting the schedule stores.
  //
  // Guard chain (any failure → fall through to Path A silently):
  //   1. employee resolved
  //   2. department found with a holidayTypeId assigned
  //   3. department has a workSchedulePatternId (required to determine schedule type)
  //   4. pattern found and type === 'WEEKLY_WORKING_TIME'
  //
  // SHIFT_TIME departments bypass this gate entirely.
  // Their resolver output is byte-identical to pre-holiday-system behavior.
  if (employee) {
    const department = departmentStore.findById(employee.departmentId);
    const { holidayTypeId, workSchedulePatternId } = department ?? {};
    if (holidayTypeId && workSchedulePatternId) {
      const pattern = patternStore.findById(workSchedulePatternId);
      if (pattern?.type === 'WEEKLY_WORKING_TIME') {
        const mmdd = date.slice(5);
        const holidayRecord = holidayDateStore.findOne(
          (hd) => hd.typeId === holidayTypeId && hd.enabled && hd.date === mmdd,
        );
        if (holidayRecord) {
          return {
            startTime: '',
            endTime:   '',
            source:    'holiday',
            holiday:   { id: holidayRecord.id, name: holidayRecord.name, typeId: holidayRecord.typeId },
          };
        }
      }
    }
  }

  // ── A. Primary path: schedule_days (published) ───────────────────────────────
  //
  // Matches the status filter used by resolveMyCalendar() and findMyPublishedDays():
  //   published explicitly, OR undefined (legacy record without status field).
  //
  // Shift start/end times are NOT embedded on ScheduleDayRecord for SHIFT_TIME
  // departments — those require a pattern lookup not implemented here yet.
  // Only records that carry weeklyStartTime/weeklyEndTime directly (generated by
  // transferDepartment() for WEEKLY_WORKING_TIME departments) can be resolved
  // from this path right now.  All others fall through to Path B.

  const dayRecord = dayStore.findOne(
    (d) =>
      d.userId === userId &&
      d.date   === date   &&
      (d.status ?? 'published') === 'published',
  );

  if (dayRecord) {
    // Day-off — no working time.
    if (dayRecord.isDayOff) return null;

    // Empty cell (no shift assigned, not a day-off) — no working time.
    if (dayRecord.shiftCode === null && dayRecord.shiftCodes.length === 0) return null;

    // WEEKLY_WORKING_TIME record: start/end are embedded directly on the row.
    // Return them without any further lookup.
    if (dayRecord.weeklyStartTime && dayRecord.weeklyEndTime) {
      return {
        startTime: dayRecord.weeklyStartTime,
        endTime:   dayRecord.weeklyEndTime,
        source:    'schedule_days',
      };
    }

    // SHIFT_TIME record: times are not directly on the row — they require a
    // shift-definition lookup against the sub_roles pattern.
    // That resolution is not implemented in this phase to avoid inventing new
    // logic.  Fall through to the legacy path which already does this safely.
  }

  // ── B. Fallback path: schedules (legacy WorkSchedule) ────────────────────────
  //
  // Replicates the EXACT query and resolution chain used by getScheduledTimes()
  // in attendance.service.ts (lines 79–101), including the pattern sub-lookup.
  // No logic is invented here — every step mirrors what attendance already does.

  const legacyRecord = legacyScheduleStore.findOne(
    (s) => s.userId === userId && s.days[date] !== undefined,
  );

  if (!legacyRecord) return null;

  const day = legacyRecord.days[date];
  if (!day || day.isDayOff || !day.shiftCode) return null;

  // timeOverride takes precedence — directly available, no lookup needed.
  if (day.timeOverride) {
    return {
      startTime: day.timeOverride.startTime,
      endTime:   day.timeOverride.endTime,
      source:    'schedules',
    };
  }

  // Resolve shift times through the employee → pattern → shift chain.
  // Mirrors attendance.service.ts lines 93–100 exactly.
  // employee resolved at function entry; shared with Path 0.
  if (!employee?.workSchedulePatternId) return null;

  const pattern = patternStore.findById(employee.workSchedulePatternId);
  if (!pattern) return null;

  const shift = pattern.shifts.find((s) => s.code === day.shiftCode);
  if (!shift) return null;

  return {
    startTime: shift.startTime,
    endTime:   shift.endTime,
    source:    'schedules',
  };
}
