import type {
  WorkSchedule,
  ScheduleDay,
  ScheduleTimeOverride,
  DepartmentAssignment,
  UserRole,
  WorkSchedulePattern,
  WeeklyScheduleDay,
  Department,
  ExtraWork,
  HolidayDate,
} from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import type { UserRecord } from '../employees/employee.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface ScheduleDayDto {
  shiftCode:     string | null;   // backward compat single shift
  shiftCodes?:   string[];        // multi-shift list (takes precedence when provided)
  isDayOff:      boolean;
  timeOverride?: ScheduleTimeOverride | null;
  note?:         string;
}

export interface UpsertWeekDto {
  userId:    string;
  weekStart: string;                          // YYYY-MM-DD
  days:      Record<string, ScheduleDayDto>; // YYYY-MM-DD → ScheduleDayDto
}

export interface ScheduleFilters {
  userId?:       string;
  departmentId?: string;
  weekStart?:    string;
  from?:         string;  // YYYY-MM-DD — weekStart >= from
  to?:           string;  // YYYY-MM-DD — weekStart <= to
}

// ─── Date-based record (one row per userId+date) ───────────────────────────────
// This is the authoritative save format for the schedule grid.
// Unlike the week-based WorkSchedule, each record covers exactly one day so
// saving one cell never touches adjacent days.

export interface ScheduleDayRecord {
  id:               string;
  userId:           string;
  date:             string;        // YYYY-MM-DD
  shiftCode:        string | null; // primary shift (first in shiftCodes)
  shiftCodes:       string[];
  isDayOff:         boolean;
  weeklyStartTime?: string;        // HH:mm — set when auto-generated from WEEKLY_WORKING_TIME pattern
  weeklyEndTime?:   string;        // HH:mm — set when auto-generated from WEEKLY_WORKING_TIME pattern
  /**
   * Draft/publish lifecycle status.
   * 'draft'     — saved by manager; invisible to employees.
   * 'published' — explicitly published; visible to employees.
   * undefined   — legacy record (created before this field existed); treated as 'published'.
   */
  status?:          'draft' | 'published';
  savedBy:          string;
  createdAt:        string;
  updatedAt:        string;
}

export interface UpsertDayDto {
  userId:     string;
  date:       string;
  shiftCodes: string[];
  isDayOff:   boolean;
}

// ─── Resolved calendar types (single source of truth for employee calendar) ───

/** Shift definition inlined into a resolved calendar day — no client-side lookup needed. */
export interface ResolvedCalendarShift {
  code:      string;
  nameTh:    string;
  startTime: string;
  endTime:   string;
}

/**
 * One calendar day as resolved by the backend resolver.
 * The frontend renders directly from this; it never re-derives department or pattern.
 *
 * source:
 *   'published' — from a manager-assigned, HR-approved ScheduleDayRecord
 *   'pattern'   — generated from a WEEKLY_WORKING_TIME department pattern
 *   'empty'     — SHIFT_TIME dept with no published assignment yet
 */
export interface ResolvedCalendarDay {
  date:       string;
  shiftCodes: string[];
  shifts:     ResolvedCalendarShift[];  // parallel to shiftCodes — includes display info
  isDayOff:   boolean;
  weeklyTime?: { startTime: string; endTime: string };  // set for 'pattern' working days
  source:     'published' | 'pattern' | 'empty';
  holiday?:   { name: string };  // set when date falls on an enabled holiday for this dept
}

// ─── Repositories ─────────────────────────────────────────────────────────────

/** Published schedules — employee-visible. */
const scheduleStore:            IRepository<WorkSchedule>         = new JsonRepository<WorkSchedule>('schedules');
/** Manager draft schedules — not yet published. */
const draftScheduleStore:       IRepository<WorkSchedule>         = new JsonRepository<WorkSchedule>('schedule_drafts');
/** Date-based schedule cells — authoritative grid storage. */
const dayStore:                 IRepository<ScheduleDayRecord>    = new JsonRepository<ScheduleDayRecord>('schedule_days');
/** Extra working-time blocks — follows same draft/publish lifecycle as schedule_days. */
const extraWorkStore:           IRepository<ExtraWork>            = new JsonRepository<ExtraWork>('extra_work');
/** Department transfer audit trail — used for date-based department resolution. */
const deptAssignmentStore:      IRepository<DepartmentAssignment> = new JsonRepository<DepartmentAssignment>('department_assignments');
const employeeStore:            IRepository<UserRecord>           = new JsonRepository<UserRecord>('employees');
const workSchedulePatternStore: IRepository<WorkSchedulePattern>  = new JsonRepository<WorkSchedulePattern>('sub_roles');
const departmentStore:          IRepository<Department>           = new JsonRepository<Department>('departments');
const holidayDateStore:         IRepository<HolidayDate>          = new JsonRepository<HolidayDate>('holiday_dates');

// ─── Date utilities (server-side) ─────────────────────────────────────────────

/** Format using LOCAL date parts — toISOString() is UTC and shifts dates on non-UTC servers. */
function _toIso(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns today's date as YYYY-MM-DD using local time. */
function _todayIso(): string { return _toIso(new Date()); }

/** Returns the Monday of the week containing dateIso (ISO 8601 week start). */
function _weekStart(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return _toIso(d);
}

/**
 * Returns every ISO date string (YYYY-MM-DD) from the Monday of fromWeekStart
 * through the Sunday of the week that contains toWeekStart.
 */
function _datesInWeekRange(fromWeekStart: string, toWeekStart: string): string[] {
  const dates: string[] = [];
  const cur = new Date(fromWeekStart + 'T00:00:00');
  const end = new Date(toWeekStart   + 'T00:00:00');
  end.setDate(end.getDate() + 6); // include full last week
  while (cur <= end) {
    dates.push(_toIso(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function assertDate(value: string, field: string): void {
  if (!DATE_RE.test(value) || isNaN(Date.parse(value))) {
    throw new AppError(400, `${field} must be a valid YYYY-MM-DD date`, 'VALIDATION_ERROR');
  }
}

function assertTime(value: string, field: string): void {
  if (!TIME_RE.test(value)) {
    throw new AppError(400, `${field} must be HH:mm`, 'VALIDATION_ERROR');
  }
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) {
    throw new AppError(400, `${field} has invalid hour/minute`, 'VALIDATION_ERROR');
  }
}

function validateTimeOverride(ov: ScheduleTimeOverride): void {
  assertTime(ov.startTime, 'timeOverride.startTime');
  assertTime(ov.endTime,   'timeOverride.endTime');
}

// ─── Department scope helpers ─────────────────────────────────────────────────

/**
 * Returns the list of department IDs the given manager is allowed to manage.
 * Source of truth: user.managerDepartments on the manager's own record.
 * Returns [] for non-managers or managers with no departments assigned yet.
 */
function getManagedDeptIds(managerId: string): string[] {
  const actor = employeeStore.findById(managerId);
  return actor?.managerDepartments ?? [];
}

/**
 * Verify the acting user has authority to manage the target employee's schedule.
 *
 * Rules:
 *   HR / super_admin → always allowed.
 *   Manager         → employee's departmentId must be in actor's managerDepartments.
 */
function verifyDeptAccess(
  actorUserId: string,
  actorRole: UserRole,
  targetUserId: string
): void {
  if (hasPermission(actorRole, 'hr')) return;

  const employee = employeeStore.findById(targetUserId);
  if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');

  const managedDepts = getManagedDeptIds(actorUserId);
  if (!managedDepts.includes(employee.departmentId)) {
    throw new AppError(
      403,
      'Manager cannot manage employees outside assigned departments',
      'FORBIDDEN'
    );
  }
}

/**
 * Validate a single day's assignment against the employee's workSchedulePattern.
 * If the employee has no workSchedulePattern, any shiftCode is accepted.
 */
function validateDay(
  dateKey: string,
  day: ScheduleDayDto,
  subRole: WorkSchedulePattern | null
): ScheduleDay {
  assertDate(dateKey, `days.${dateKey} (key)`);

  if (day.timeOverride) {
    validateTimeOverride(day.timeOverride);
  }

  // Normalise shiftCodes: prefer explicit array, fall back to shiftCode scalar
  let shiftCodes: string[];
  if (day.isDayOff) {
    shiftCodes = [];
  } else if (Array.isArray(day.shiftCodes) && day.shiftCodes.length > 0) {
    shiftCodes = day.shiftCodes;
  } else if (day.shiftCode !== null) {
    shiftCodes = [day.shiftCode];
  } else {
    shiftCodes = [];
  }

  // Validate each shift code against the subRole (skip for WEEKLY_WORKING_TIME — no shift codes)
  if (shiftCodes.length > 0 && subRole && subRole.type !== 'WEEKLY_WORKING_TIME') {
    const validCodes = new Set(subRole.shifts.map((s) => s.code));
    for (const code of shiftCodes) {
      if (!validCodes.has(code)) {
        throw new AppError(
          400,
          `Shift code '${code}' is not defined in the employee's subRole '${subRole.nameTh}'. ` +
            `Valid codes: ${[...validCodes].join(', ')}`,
          'INVALID_SHIFT_CODE'
        );
      }
    }
  }

  return {
    shiftCode:    shiftCodes[0] ?? null,   // primary shift for backward compat
    shiftCodes,
    isDayOff:     day.isDayOff,
    timeOverride: day.timeOverride ?? undefined,
    note:         day.note,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const scheduleService = {

  // ── Query ────────────────────────────────────────────────────────────────────

  /**
   * List schedules.
   * For managers: results are auto-scoped to their managed departments.
   * For HR/super_admin: full access, filters apply.
   */
  findAll(
    filters: ScheduleFilters,
    actorUserId: string,
    actorRole: UserRole
  ): WorkSchedule[] {
    // Determine employee IDs in scope
    let scopedUserIds: Set<string> | null = null;

    if (!hasPermission(actorRole, 'hr')) {
      // Manager: restrict to employees in managed departments
      const deptIds = new Set(getManagedDeptIds(actorUserId));

      if (filters.departmentId) {
        // Ensure the requested department is actually managed by this manager
        if (!deptIds.has(filters.departmentId)) {
          throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
        }
        deptIds.clear();
        deptIds.add(filters.departmentId);
      }

      const employees = employeeStore.findAll(
        (u) => deptIds.has(u.departmentId) && u.isActive
      );
      scopedUserIds = new Set(employees.map((e) => e.id));
    } else if (filters.departmentId) {
      // HR with a department filter
      const employees = employeeStore.findAll(
        (u) => u.departmentId === filters.departmentId && u.isActive
      );
      scopedUserIds = new Set(employees.map((e) => e.id));
    }

    // For managers: return merged view — drafts take priority over published
    const matchFn = (s: WorkSchedule) => {
      if (scopedUserIds && !scopedUserIds.has(s.userId))       return false;
      if (filters.userId    && s.userId    !== filters.userId) return false;
      if (filters.weekStart && s.weekStart !== filters.weekStart) return false;
      if (filters.from      && s.weekStart < filters.from)     return false;
      if (filters.to        && s.weekStart > filters.to)       return false;
      return true;
    };

    if (!hasPermission(actorRole, 'hr')) {
      // Manager: show drafts + published for periods not in draft
      const drafts    = draftScheduleStore.findAll(matchFn);
      const published = scheduleStore.findAll(matchFn);
      // Index draft keys
      const draftKeys = new Set(drafts.map((d) => `${d.userId}::${d.weekStart}`));
      // Fill in published records not overridden by a draft
      const fill = published.filter((p) => !draftKeys.has(`${p.userId}::${p.weekStart}`));
      return [...drafts, ...fill];
    }

    return scheduleStore.findAll(matchFn);
  },

  findById(id: string): WorkSchedule {
    const s = scheduleStore.findById(id);
    if (!s) throw new AppError(404, `Schedule '${id}' not found`, 'NOT_FOUND');
    return s;
  },

  // ── Upsert a full week ────────────────────────────────────────────────────────

  /**
   * Create or overwrite the schedule for (userId, weekStart).
   * Validates every day's shiftCode against the employee's SubRole.
   * Manager must manage the target employee's department.
   */
  upsertWeek(
    dto: UpsertWeekDto,
    actorUserId: string,
    actorRole: UserRole
  ): WorkSchedule {
    if (!dto.userId)    throw new AppError(400, 'userId is required',    'VALIDATION_ERROR');
    if (!dto.weekStart) throw new AppError(400, 'weekStart is required', 'VALIDATION_ERROR');
    assertDate(dto.weekStart, 'weekStart');

    // Department access guard
    verifyDeptAccess(actorUserId, actorRole, dto.userId);

    // Load employee + resolve effective subRole for shift validation
    // Use the department's pattern as the source of truth (matches frontend picker).
    // Fall back to the employee's own workSchedulePatternId if no dept pattern.
    const employee   = employeeStore.findById(dto.userId)!;
    const department = departmentStore.findById(employee.departmentId);

    const deptPattern = department?.workSchedulePatternId
      ? (workSchedulePatternStore.findById(department.workSchedulePatternId) ?? null)
      : null;

    const empPattern = employee.workSchedulePatternId
      ? (workSchedulePatternStore.findById(employee.workSchedulePatternId) ?? null)
      : null;

    // Prefer dept pattern (matches what the UI shows); fall back to employee's own
    const subRole = deptPattern ?? empPattern;

    console.log('[scheduleService.upsertWeek]', {
      userId:      dto.userId,
      weekStart:   dto.weekStart,
      actorId:     actorUserId,
      actorRole,
      departmentId:      employee.departmentId,
      deptPatternId:     department?.workSchedulePatternId ?? null,
      empPatternId:      employee.workSchedulePatternId ?? null,
      subRoleUsed:       subRole ? `${subRole.id} (${subRole.type})` : 'none',
      daysKeys:          Object.keys(dto.days ?? {}),
    });

    // Validate and normalise each day — skip null-shiftCode non-dayOff entries (empty cells)
    // and skip any dates in the past (past schedules are immutable).
    const today = _todayIso();
    const days: Record<string, ScheduleDay> = {};
    for (const [date, dayDto] of Object.entries(dto.days ?? {})) {
      if (date < today) continue; // past date — immutable, silently ignored
      const isEmpty = !dayDto.isDayOff && dayDto.shiftCode === null && !(dayDto.shiftCodes?.length);
      if (isEmpty) continue; // frontend should never send these, but guard here too
      console.log(`  [day ${date}]`, {
        shiftCode:  dayDto.shiftCode,
        shiftCodes: dayDto.shiftCodes,
        isDayOff:   dayDto.isDayOff,
      });
      days[date] = validateDay(date, dayDto, subRole);
    }

    // Upsert into the DRAFT store (managers never write directly to published)
    const existing = draftScheduleStore.findOne(
      (s) => s.userId === dto.userId && s.weekStart === dto.weekStart
    );

    console.log(`  [upsert-draft] existing=${existing ? existing.id : 'none'} → ${existing ? 'UPDATE' : 'CREATE'}`);

    if (existing) {
      // MERGE incoming days with existing draft — never full-replace, so untouched days survive
      return draftScheduleStore.updateById(existing.id, {
        days: { ...existing.days, ...days },
        updatedBy: actorUserId,
      }) as WorkSchedule;
    }

    return draftScheduleStore.create({
      userId:    dto.userId,
      weekStart: dto.weekStart,
      days,
      createdBy: actorUserId,
    } as Omit<WorkSchedule, 'id' | 'createdAt' | 'updatedAt'>);
  },

  // ── Update a single day ───────────────────────────────────────────────────────

  /**
   * Patch one day within an existing schedule.
   * Useful for last-minute changes without resubmitting the whole week.
   */
  updateDay(
    scheduleId: string,
    date: string,
    dto: ScheduleDayDto,
    actorUserId: string,
    actorRole: UserRole
  ): WorkSchedule {
    assertDate(date, 'date param');

    // Past schedules are immutable — reject explicit single-day updates to past dates.
    if (date < _todayIso()) {
      throw new AppError(400, `Cannot modify schedule for past date ${date}`, 'PAST_DATE_IMMUTABLE');
    }

    const schedule = this.findById(scheduleId);
    verifyDeptAccess(actorUserId, actorRole, schedule.userId);

    const employee = employeeStore.findById(schedule.userId)!;
    const subRole  = employee.workSchedulePatternId
      ? (workSchedulePatternStore.findById(employee.workSchedulePatternId) ?? null)
      : null;

    const updatedDay = validateDay(date, dto, subRole);

    return scheduleStore.updateById(scheduleId, {
      days:      { ...schedule.days, [date]: updatedDay },
      updatedBy: actorUserId,
    }) as WorkSchedule;
  },

  // ── Remove ────────────────────────────────────────────────────────────────────

  remove(id: string, actorUserId: string, actorRole: UserRole): void {
    const schedule = this.findById(id);
    verifyDeptAccess(actorUserId, actorRole, schedule.userId);
    scheduleStore.deleteById(id);
  },

  // ── Batch upsert multiple weeks ───────────────────────────────────────────────

  /**
   * Upsert many (userId, weekStart) combinations in one call.
   * Used by the month-grid UI to save all pending edits at once.
   */
  batchUpsert(
    weeks: UpsertWeekDto[],
    actorUserId: string,
    actorRole: UserRole
  ): WorkSchedule[] {
    return weeks.map((w) => this.upsertWeek(w, actorUserId, actorRole));
  },

  // ── Date-based upsert (new authoritative save path) ──────────────────────────

  /**
   * Upsert one record per (userId, date).
   * Each call touches ONLY the exact dates provided — no week reconstruction,
   * no adjacent-day side-effects, no role-based store split.
   */
  upsertDays(
    records: UpsertDayDto[],
    actorUserId: string,
    actorRole:   UserRole
  ): ScheduleDayRecord[] {
    const results: ScheduleDayRecord[] = [];
    const today = _todayIso();

    for (const rec of records) {
      if (!rec.userId) throw new AppError(400, 'userId required', 'VALIDATION_ERROR');
      assertDate(rec.date, 'date');

      // Past schedules are immutable.
      if (rec.date < today) continue;

      verifyDeptAccess(actorUserId, actorRole, rec.userId);

      const employee = employeeStore.findById(rec.userId);
      if (!employee) throw new AppError(404, `Employee ${rec.userId} not found`, 'NOT_FOUND');

      const department  = departmentStore.findById(employee.departmentId);
      const deptPattern = department?.workSchedulePatternId
        ? (workSchedulePatternStore.findById(department.workSchedulePatternId) ?? null)
        : null;
      const empPattern  = employee.workSchedulePatternId
        ? (workSchedulePatternStore.findById(employee.workSchedulePatternId) ?? null)
        : null;
      const subRole = deptPattern ?? empPattern;

      const shiftCodes = rec.isDayOff ? [] : (rec.shiftCodes ?? []).filter(Boolean);

      // Validate shift codes against subRole pattern.
      if (shiftCodes.length > 0 && subRole && subRole.type !== 'WEEKLY_WORKING_TIME') {
        const validCodes = new Set(subRole.shifts.map((s) => s.code));
        for (const code of shiftCodes) {
          if (!validCodes.has(code)) {
            throw new AppError(
              400,
              `Shift code '${code}' is not defined in the pattern '${subRole.nameTh}'`,
              'INVALID_SHIFT_CODE'
            );
          }
        }
      }

      // ── IMPORTANT: Only ever create/update the DRAFT row.
      // Published rows are NEVER touched by save — they are only modified by publishDays().
      // This guarantees employees always see the last published state,
      // never a manager's in-progress draft.
      //
      // One draft row per (userId, date) is maintained as the manager's working copy.
      // A cleared cell (shiftCodes=[], isDayOff=false) is stored as a "deletion sentinel"
      // draft row — it signals to publishDays() that the published row for this date
      // should be removed when the manager publishes.
      const existingDraft = dayStore.findOne(
        (d) => d.userId === rec.userId && d.date === rec.date && d.status === 'draft'
      );

      if (shiftCodes.length === 0 && !rec.isDayOff) {
        // Cleared cell — create/update a deletion-sentinel draft.
        // Do NOT delete the published row; that happens only on publishDays().
        if (existingDraft) {
          dayStore.updateById(existingDraft.id, {
            shiftCode: null, shiftCodes: [], isDayOff: false, savedBy: actorUserId,
          });
        } else {
          dayStore.create({
            userId: rec.userId, date: rec.date,
            shiftCode: null, shiftCodes: [], isDayOff: false,
            status: 'draft' as const, savedBy: actorUserId,
          } as Omit<ScheduleDayRecord, 'id' | 'createdAt' | 'updatedAt'>);
        }
        // Sentinels are not returned — the frontend removes the cell from local state.
        continue;
      }

      if (existingDraft) {
        results.push(dayStore.updateById(existingDraft.id, {
          shiftCode:  shiftCodes[0] ?? null,
          shiftCodes,
          isDayOff:   rec.isDayOff,
          status:     'draft' as const,
          savedBy:    actorUserId,
        }) as ScheduleDayRecord);
      } else {
        results.push(dayStore.create({
          userId:    rec.userId,
          date:      rec.date,
          shiftCode: shiftCodes[0] ?? null,
          shiftCodes,
          isDayOff:  rec.isDayOff,
          status:    'draft' as const,
          savedBy:   actorUserId,
        } as Omit<ScheduleDayRecord, 'id' | 'createdAt' | 'updatedAt'>));
      }
    }

    return results;
  },

  // ── Date-based list (new authoritative load path) ─────────────────────────────

  /**
   * Fetch schedule-day records for a date range, scoped to a department.
   * Returns records for ALL roles (no draft/published split).
   */
  findDays(
    filters: { departmentId?: string; from?: string; to?: string },
    actorUserId: string,
    actorRole:   UserRole
  ): ScheduleDayRecord[] {
    // Build scoped userId set
    let scopedUserIds: Set<string> | null = null;

    if (!hasPermission(actorRole, 'hr')) {
      const deptIds = new Set(getManagedDeptIds(actorUserId));
      if (filters.departmentId) {
        if (!deptIds.has(filters.departmentId)) {
          throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
        }
        const employees = employeeStore.findAll(
          (u) => u.departmentId === filters.departmentId && u.isActive
        );
        scopedUserIds = new Set(employees.map((e) => e.id));
      } else {
        const employees = employeeStore.findAll(
          (u) => deptIds.has(u.departmentId) && u.isActive
        );
        scopedUserIds = new Set(employees.map((e) => e.id));
      }
    } else if (filters.departmentId) {
      const employees = employeeStore.findAll(
        (u) => u.departmentId === filters.departmentId && u.isActive
      );
      scopedUserIds = new Set(employees.map((e) => e.id));
    }

    const allRows = dayStore.findAll((d) => {
      if (scopedUserIds && !scopedUserIds.has(d.userId)) return false;
      if (filters.from && d.date < filters.from) return false;
      if (filters.to   && d.date > filters.to)   return false;
      return true;
    });

    // Deduplicate: for each (userId, date) there may be both a draft and a published row.
    // The manager grid must see exactly ONE record per cell — draft takes priority so
    // pending edits are reflected immediately in the admin view without leaking to employees.
    const cellMap = new Map<string, ScheduleDayRecord>();
    for (const row of allRows) {
      const key      = `${row.userId}::${row.date}`;
      const existing = cellMap.get(key);
      if (!existing || (row.status === 'draft' && existing.status !== 'draft')) {
        cellMap.set(key, row);
      }
    }

    // Exclude deletion-sentinel drafts (shiftCodes=[], !isDayOff) from the manager grid.
    // The cell shows as empty — matching what the manager last set it to.
    return [...cellMap.values()].filter(
      (r) => !(r.status === 'draft' && r.shiftCodes.length === 0 && !r.isDayOff)
    );
  },

  // ── Employee self-schedule (with auto-pattern generation) ─────────────────────

  /**
   * Returns an employee's effective schedule for a date range.
   *
   * Merges two sources:
   *   1. Stored WorkSchedule records (manual assignments) — always takes precedence.
   *   2. Virtual WorkSchedule records auto-generated from the employee's department's
   *      WEEKLY_WORKING_TIME pattern — only fills dates not covered by (1).
   *
   * The virtual records carry a `timeOverride` on each ScheduleDay so the frontend
   * can display them as a time block (08:00–17:00) without a shift code.
   * They are never persisted — generated fresh on every request.
   */
  getMySchedule(
    userId: string,
    filters: { weekStart?: string; from?: string; to?: string }
  ): WorkSchedule[] {
    // ── 1. Real stored schedules ──────────────────────────────────────────────
    const real = scheduleStore.findAll((s) => {
      if (s.userId !== userId) return false;
      if (filters.weekStart && s.weekStart !== filters.weekStart) return false;
      if (filters.from && s.weekStart < filters.from) return false;
      if (filters.to   && s.weekStart > filters.to)   return false;
      return true;
    });

    // ── 2. Resolve employee + transfer history ────────────────────────────────
    const employee = employeeStore.findById(userId);
    if (!employee) return real;

    // ── 3. Determine the date range to generate ───────────────────────────────
    const fromWS = filters.from ?? filters.weekStart;
    const toWS   = filters.to   ?? filters.weekStart;
    if (!fromWS || !toWS) return real;

    // ── 4. Department-by-date resolution (mirrors resolveMyCalendar) ──────────
    // Uses deptAssignmentStore so that after a transfer the correct department
    // is used for each date — employee.departmentId is NOT used directly.
    // Sort by createdAt DESC only: the most recently created assignment whose
    // effectiveDate <= date is always authoritative. Sorting by effectiveDate first
    // would allow a stale future-dated assignment (e.g. effectiveDate=tomorrow) to
    // override a more recently created one with effectiveDate=today, corrupting all
    // dates from tomorrow onwards.
    const assignments = deptAssignmentStore
      .findAll((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const currentDeptId = employee.departmentId;
    function deptIdForDate(date: string): string {
      const match = assignments.find((a) => a.effectiveDate <= date);
      if (match) return match.toDepartmentId;
      const oldest = assignments.length > 0 ? assignments[assignments.length - 1] : null;
      return oldest ? oldest.fromDepartmentId : currentDeptId;
    }

    // ── 5. Pattern cache per department ───────────────────────────────────────
    const patternCacheLocal = new Map<string, WorkSchedulePattern | null>();
    function weeklyPatternForDept(deptId: string): WorkSchedulePattern | null {
      if (!patternCacheLocal.has(deptId)) {
        const dept = departmentStore.findById(deptId);
        const p = dept?.workSchedulePatternId
          ? (workSchedulePatternStore.findById(dept.workSchedulePatternId) ?? null)
          : null;
        patternCacheLocal.set(deptId, p);
      }
      const p = patternCacheLocal.get(deptId) ?? null;
      return p?.type === 'WEEKLY_WORKING_TIME' && p.weeklySchedule?.length ? p : null;
    }

    // ── 6. Index every date already covered by a real ScheduleDay entry ───────
    const realCoveredDates = new Set<string>();
    for (const s of real) {
      for (const dateKey of Object.keys(s.days)) {
        realCoveredDates.add(dateKey);
      }
    }

    // ── 7. Generate virtual days grouped by weekStart ─────────────────────────
    const virtualWeeks = new Map<string, Record<string, ScheduleDay>>();

    for (const date of _datesInWeekRange(fromWS, toWS)) {
      if (realCoveredDates.has(date)) continue; // manual record wins
      const p = weeklyPatternForDept(deptIdForDate(date));
      if (!p) continue; // SHIFT_TIME or no pattern — no virtual records

      const dow     = new Date(date + 'T00:00:00').getDay();
      const weekDay = p.weeklySchedule!.find((d) => d.dayOfWeek === dow);
      if (!weekDay) continue; // not a working day in this pattern

      const ws = _weekStart(date);
      if (!virtualWeeks.has(ws)) virtualWeeks.set(ws, {});
      virtualWeeks.get(ws)![date] = {
        shiftCode:  null,
        shiftCodes: [],
        isDayOff:   false,
        timeOverride: {
          startTime:   weekDay.startTime,
          endTime:     weekDay.endTime,
          isOvernight: false,
        },
        note: '__auto__', // sentinel — identifies auto-generated entries
      };
    }

    // ── 7. Convert to WorkSchedule objects ────────────────────────────────────
    const now = new Date().toISOString();
    const virtual: WorkSchedule[] = [];

    for (const [ws, days] of virtualWeeks) {
      if (Object.keys(days).length === 0) continue;
      virtual.push({
        id:        `auto-${ws}-${userId}`,
        userId,
        weekStart: ws,
        days,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now,
      } as WorkSchedule);
    }

    // ── 8. Merge: real records + virtual records ──────────────────────────────
    // Real records already exclude dates also covered by virtual ones (step 5),
    // so the combined set has no day-level conflicts.
    return [...real, ...virtual];
  },

  // ── Employee self-schedule (published only, date-based) ──────────────────────

  /**
   * Returns the calling employee's published schedule days for a given month.
   *
   * Filters by status:
   *   'published'  — explicitly published by manager; visible.
   *   undefined    — legacy record without status; treated as 'published' for backward compat.
   *   'draft'      — never returned; invisible to employees.
   */
  findMyPublishedDays(userId: string, month: string): ScheduleDayRecord[] {
    const from = `${month}-01`;
    const to   = `${month}-31`;
    return dayStore.findAll(
      (d) =>
        d.userId === userId &&
        d.date   >= from &&
        d.date   <= to &&
        (d.status ?? 'published') === 'published'
    );
  },

  // ── Date-based calendar resolver (single source of truth) ─────────────────────

  /**
   * Resolve the complete calendar for a given employee + month.
   *
   * For each calendar day the resolver:
   *   1. Determines the employee's effective department on that date using the
   *      `department_assignments` audit trail (supports mid-month transfers).
   *   2. Reads the department's WorkSchedulePattern type.
   *   3a. WEEKLY_WORKING_TIME → generates a 'pattern' day directly.
   *   3b. SHIFT_TIME → returns the ScheduleDayRecord only when its status is
   *       'published' (or undefined for legacy records). Draft records are
   *       invisible to employees — 'empty' is returned instead.
   *
   * The frontend MUST use this endpoint and must NOT derive department from the
   * cached JWT payload — that value is stale after a transfer.
   */
  resolveMyCalendar(userId: string, month: string, options: { includeDraftShifts?: boolean } = {}): ResolvedCalendarDay[] {
    const { includeDraftShifts = false } = options;
    const [y, m] = month.split('-').map(Number);
    const dayCount = new Date(y, m, 0).getDate();
    const days     = Array.from({ length: dayCount }, (_, i) =>
      `${month}-${String(i + 1).padStart(2, '0')}`
    );

    const employee = employeeStore.findById(userId);
    if (!employee) return [];

    // ── 1. Department assignment history, sorted by createdAt DESC ────────────
    // Sort by createdAt DESC only: the most recently created assignment whose
    // effectiveDate <= date is always authoritative. Sorting by effectiveDate first
    // would allow a stale future-dated assignment (e.g. effectiveDate=tomorrow,
    // created earlier) to override a more recently created one with effectiveDate=today,
    // corrupting all dates from tomorrow onwards.
    const assignments = deptAssignmentStore
      .findAll((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Returns the employee's effective departmentId on a given date.
    // Walks assignments (sorted by createdAt DESC) to find the most recently
    // created one whose effectiveDate <= date. When no assignment covers the date
    // (pre-transfer history), falls back to fromDepartmentId of the oldest record.
    // Does NOT use employee.departmentId — it's already updated to the new dept
    // and would incorrectly apply the new pattern to all past dates.
    const currentDeptId = employee.departmentId;
    function deptIdForDate(date: string): string {
      const match = assignments.find((a) => a.effectiveDate <= date);
      if (match) return match.toDepartmentId;
      // Pre-transfer date: use the dept the employee held before any known move.
      const oldest = assignments.length > 0 ? assignments[assignments.length - 1] : null;
      return oldest ? oldest.fromDepartmentId : currentDeptId;
    }

    // ── 2. Pre-load schedule_days for this user + month ────────────────────────
    // Employee view (includeDraftShifts=false):
    //   Only published (or legacy undefined-status) records are returned.
    //   Draft rows must never appear to employees — they would leak unpublished changes.
    // Manager/OT-validation view (includeDraftShifts=true):
    //   All non-deleted records (draft + published) are included so that
    //   OT creation is blocked against draft schedules the manager has already
    //   assigned but not yet published.
    const from = `${month}-01`;
    const to   = `${month}-31`;
    const dayRecords = dayStore.findAll((d) => {
      if (d.userId !== userId) return false;
      if (d.date < from || d.date > to) return false;
      // Employee view: published only. Manager/OT view: all statuses.
      if (!includeDraftShifts && (d.status ?? 'published') !== 'published') return false;
      return true;
    });
    const dayRecordMap = new Map(dayRecords.map((d) => [d.date, d]));

    // ── 3. Pattern + department cache (avoids redundant store reads per day) ───
    const patternCache = new Map<string, WorkSchedulePattern | null>();
    const deptCache    = new Map<string, Department | null>();

    function deptForId(departmentId: string): Department | null {
      if (!deptCache.has(departmentId)) {
        deptCache.set(departmentId, departmentStore.findById(departmentId) ?? null);
      }
      return deptCache.get(departmentId) ?? null;
    }

    function patternForDept(departmentId: string): WorkSchedulePattern | null {
      if (!patternCache.has(departmentId)) {
        const dept = deptForId(departmentId);
        const p    = dept?.workSchedulePatternId
          ? (workSchedulePatternStore.findById(dept.workSchedulePatternId) ?? null)
          : null;
        patternCache.set(departmentId, p);
      }
      return patternCache.get(departmentId) ?? null;
    }

    /** Returns the holiday name for a date+dept, or undefined if not a holiday. */
    function holidayNameForDate(departmentId: string, date: string): string | undefined {
      const dept = deptForId(departmentId);
      if (!dept?.holidayTypeId) return undefined;
      const mmdd = date.slice(5); // 'YYYY-MM-DD' → 'MM-DD'
      const rec  = holidayDateStore.findOne(
        (hd) => hd.typeId === dept.holidayTypeId && hd.enabled && hd.date === mmdd,
      );
      return rec?.name;
    }

    // ── 4. Resolve each day ───────────────────────────────────────────────────
    const result: ResolvedCalendarDay[] = [];

    for (const date of days) {
      const departmentId = deptIdForDate(date);
      const pattern      = patternForDept(departmentId);
      const holidayName  = holidayNameForDate(departmentId, date);
      const holiday      = holidayName ? { name: holidayName } : undefined;

      // ── Case A: WEEKLY_WORKING_TIME — check schedule_days FIRST for historical integrity.
      // If a stored record exists (written by transferDepartment), use its weeklyStartTime/
      // weeklyEndTime — the live pattern may have changed since the record was generated.
      // Fall back to the live pattern only when no stored record exists (e.g. employee was
      // never transferred and schedules were never seeded via transferDepartment).
      if (pattern?.type === 'WEEKLY_WORKING_TIME') {
        const rec = dayRecordMap.get(date);
        if (rec) {
          // Stored record — use as-is (historical integrity)
          result.push({
            date,
            shiftCodes: [],
            shifts:     [],
            isDayOff:   rec.isDayOff,
            weeklyTime: !rec.isDayOff && rec.weeklyStartTime && rec.weeklyEndTime
              ? { startTime: rec.weeklyStartTime, endTime: rec.weeklyEndTime }
              : undefined,
            source: 'pattern',
            holiday,
          });
          continue;
        }

        // No stored record — fall back to live pattern
        if (pattern.weeklySchedule?.length) {
          const dow     = new Date(date + 'T00:00:00').getDay();
          const weekDay = pattern.weeklySchedule.find((d) => d.dayOfWeek === dow);
          if (weekDay) {
            result.push({
              date,
              shiftCodes: [],
              shifts:     [],
              isDayOff:   false,
              weeklyTime: { startTime: weekDay.startTime, endTime: weekDay.endTime },
              source:     'pattern',
              holiday,
            });
          } else {
            result.push({ date, shiftCodes: [], shifts: [], isDayOff: true, source: 'pattern', holiday });
          }
        } else {
          result.push({ date, shiftCodes: [], shifts: [], isDayOff: false, source: 'empty', holiday });
        }
        continue;
      }

      // ── Case B: SHIFT_TIME
      // Employee view: only published records are shown (draft = invisible).
      // Manager/OT-validation view (includeDraftShifts): draft records are
      // included so that OT is blocked against unconfirmed-but-assigned shifts.
      const rec = dayRecordMap.get(date);
      const recVisible = rec &&
        (includeDraftShifts || (rec.status ?? 'published') === 'published');
      if (recVisible) {
        const codes  = rec.shiftCodes.length > 0 ? rec.shiftCodes : (rec.shiftCode ? [rec.shiftCode] : []);
        const shifts: ResolvedCalendarShift[] = codes.map((code) => {
          const def = pattern?.shifts?.find((s) => s.code === code);
          return def
            ? { code, nameTh: def.nameTh, startTime: def.startTime, endTime: def.endTime }
            : { code, nameTh: code, startTime: '', endTime: '' };
        });
        result.push({
          date,
          shiftCodes: codes,
          shifts,
          isDayOff:   rec.isDayOff,
          source:     'published',
          holiday,
        });
      } else {
        // No published record — empty slot (waiting for manager assignment)
        result.push({ date, shiftCodes: [], shifts: [], isDayOff: false, source: 'empty', holiday });
      }
    }

    return result;
  },

  // ── Publish draft schedules ────────────────────────────────────────────────────

  /**
   * Marks all 'draft' ScheduleDayRecord entries for a department+month as 'published',
   * making them visible to employees via resolveMyCalendar() / findMyPublishedDays().
   *
   * Access rules:
   *   - Manager: must manage the department AND dept.requireHrApproval must be false.
   *   - HR / super_admin: can publish any department (used via approval flow or direct call).
   *
   * Only records with status='draft' are updated; published/legacy records are untouched.
   */
  publishDays(
    departmentId: string,
    month:        string,
    actorUserId:  string,
    actorRole:    UserRole
  ): ScheduleDayRecord[] {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be YYYY-MM', 'VALIDATION_ERROR');
    }

    const dept = departmentStore.findById(departmentId);
    if (!dept) throw new AppError(404, 'Department not found', 'NOT_FOUND');

    if (!hasPermission(actorRole, 'hr')) {
      // Manager: verify department access
      const actor = employeeStore.findById(actorUserId);
      const managedDepts = actor?.managerDepartments ?? [];
      if (!managedDepts.includes(departmentId)) {
        throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
      }
      // Managers cannot publish directly when HR review is required
      if (dept.requireHrApproval) {
        throw new AppError(
          403,
          'This department requires HR approval before publishing. Use the approval workflow.',
          'APPROVAL_REQUIRED'
        );
      }
    }

    // Collect active employee IDs for this department
    const empIds = new Set(
      employeeStore.findAll((u) => u.departmentId === departmentId && u.isActive).map((u) => u.id)
    );

    const from = `${month}-01`;
    const to   = `${month}-31`;

    const drafts = dayStore.findAll(
      (d) => empIds.has(d.userId) && d.date >= from && d.date <= to && d.status === 'draft'
    );

    const published: ScheduleDayRecord[] = [];

    for (const draft of drafts) {
      // Find the existing published row for this (userId, date), if any.
      const existingPublished = dayStore.findOne(
        (d) =>
          d.userId === draft.userId &&
          d.date   === draft.date   &&
          (d.status ?? 'published') === 'published'
      );

      const isSentinel = draft.shiftCodes.length === 0 && !draft.isDayOff;

      if (isSentinel) {
        // Deletion sentinel: the manager cleared this cell — remove the published row.
        if (existingPublished) dayStore.deleteById(existingPublished.id);
      } else if (existingPublished) {
        // Update the existing published row in-place.
        published.push(dayStore.updateById(existingPublished.id, {
          shiftCode:  draft.shiftCode,
          shiftCodes: draft.shiftCodes,
          isDayOff:   draft.isDayOff,
          status:     'published' as const,
          savedBy:    draft.savedBy,
        }) as ScheduleDayRecord);
      } else {
        // No published row yet — create one.
        published.push(dayStore.create({
          userId:    draft.userId,
          date:      draft.date,
          shiftCode: draft.shiftCode,
          shiftCodes: draft.shiftCodes,
          isDayOff:  draft.isDayOff,
          status:    'published' as const,
          savedBy:   draft.savedBy,
        } as Omit<ScheduleDayRecord, 'id' | 'createdAt' | 'updatedAt'>));
      }

      // Always remove the draft row after processing — it has been promoted (or discarded).
      dayStore.deleteById(draft.id);
    }

    // ── Also publish extra work drafts for this dept+month ────────────────────
    // Extra work follows the same draft/publish lifecycle as schedule_days.
    // Two types of draft extra work are processed here:
    //   • deletedAt set  → pending deletion; hard-delete the row permanently.
    //   • deletedAt unset → new/edited; mark as 'published' so employees see it.
    const extraWorkDrafts = extraWorkStore.findAll(
      (ew) =>
        ew.departmentId === departmentId &&
        ew.date         >= from          &&
        ew.date         <= to            &&
        ew.status       === 'draft'
    );
    for (const ew of extraWorkDrafts) {
      if (ew.deletedAt) {
        extraWorkStore.deleteById(ew.id);  // pending deletion → hard delete
      } else {
        extraWorkStore.updateById(ew.id, { status: 'published' as const });
      }
    }

    return published;
  },

  // ── Publish status ─────────────────────────────────────────────────────────────

  /**
   * Returns the publish-readiness for a given department + month.
   *
   *  changedFromPublished — true when there are saved draft rows that have not yet
   *                         been published.  The publish button should be enabled.
   *  alreadyPublished     — true when every record is published and no drafts exist.
   *                         The publish button should show "เผยแพร่แล้ว" (disabled).
   *
   * Both false means the month has no saved records at all (nothing to publish).
   *
   * Access: mirrors publishDays — manager must manage the department; HR is unrestricted.
   */
  publishStatus(
    departmentId: string,
    month:        string,
    actorUserId:  string,
    actorRole:    UserRole
  ): { scheduleChanged: boolean; extraWorkChanged: boolean; changedFromPublished: boolean; alreadyPublished: boolean } {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be YYYY-MM', 'VALIDATION_ERROR');
    }

    if (!hasPermission(actorRole, 'hr')) {
      const actor = employeeStore.findById(actorUserId);
      const managedDepts = actor?.managerDepartments ?? [];
      if (!managedDepts.includes(departmentId)) {
        throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
      }
    }

    const empIds = new Set(
      employeeStore.findAll((u) => u.departmentId === departmentId && u.isActive).map((u) => u.id)
    );

    const from = `${month}-01`;
    const to   = `${month}-31`;

    const records = dayStore.findAll(
      (d) => empIds.has(d.userId) && d.date >= from && d.date <= to
    );

    // Deletion-sentinel drafts (shiftCodes=[], !isDayOff) still count as "changed from published"
    // because they represent a manager action that hasn't been published yet.
    const hasDraft     = records.some((r) => r.status === 'draft');
    const hasPublished = records.some((r) => (r.status ?? 'published') === 'published');

    // Extra work drafts — includes both new/edited and pending-deletion records.
    const ewDrafts = extraWorkStore.findAll(
      (ew) => ew.departmentId === departmentId && ew.date >= from && ew.date <= to && ew.status === 'draft'
    );
    const extraWorkChanged = ewDrafts.length > 0;
    const scheduleChanged  = hasDraft;
    const changedFromPublished = scheduleChanged || extraWorkChanged;

    return {
      scheduleChanged,
      extraWorkChanged,
      changedFromPublished,
      alreadyPublished: !changedFromPublished && hasPublished,
    };
  },

  // ── Working-time resolver (used by extra-work overlap validation) ─────────────

  /**
   * Returns the main working-time ranges for a given employee on a specific date.
   *
   * Used by the extra-work service to enforce the no-overlap rule:
   *   extra work [ewStart, ewEnd) must NOT overlap [mainStart, mainEnd).
   *   Boundary touching (ewStart === mainEnd or ewEnd === mainStart) is allowed.
   *
   * Returns [] when:
   *   • Employee not found
   *   • Date is a day off (any pattern type)
   *   • WEEKLY_WORKING_TIME + holiday → treat as no main time (allow all extra work)
   *   • SHIFT_TIME dept with no published record yet
   *   • No pattern configured for department
   *
   * Returns [{ start, end }] for WEEKLY_WORKING_TIME working days.
   * Returns one entry per published shift for SHIFT_TIME working days.
   */
  /**
   * @param preferDraft  When true, a draft ScheduleDayRecord takes priority over
   *   the published one for the same (userId, date).  Pass true from the
   *   extra-work service so OT validation reflects the manager's in-progress
   *   edits rather than the last-published state.  All other callers leave this
   *   false (default) and receive the existing published-first behaviour.
   */
  resolveWorkingTimeRanges(userId: string, date: string, preferDraft = false): { start: string; end: string }[] {
    const employee = employeeStore.findById(userId);
    if (!employee) return [];

    // ── Department assignment (same logic as resolveMyCalendar) ───────────────
    const assignments = deptAssignmentStore
      .findAll((a) => a.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const currentDeptId = employee.departmentId;
    function deptIdForDate(d: string): string {
      const match = assignments.find((a) => a.effectiveDate <= d);
      if (match) return match.toDepartmentId;
      const oldest = assignments.length > 0 ? assignments[assignments.length - 1] : null;
      return oldest ? oldest.fromDepartmentId : currentDeptId;
    }

    const departmentId = deptIdForDate(date);
    const dept         = departmentStore.findById(departmentId);
    if (!dept?.workSchedulePatternId) return [];

    const pattern = workSchedulePatternStore.findById(dept.workSchedulePatternId);
    if (!pattern) return [];

    // ── Holiday check for WEEKLY_WORKING_TIME ─────────────────────────────────
    // Holidays in WEEKLY_WORKING_TIME departments mean the day is a rest day;
    // no main working time applies → allow all extra-work slots.
    if (pattern.type === 'WEEKLY_WORKING_TIME' && dept.holidayTypeId) {
      const mmdd = date.slice(5);
      const isHoliday = holidayDateStore.exists(
        (hd) => hd.typeId === dept.holidayTypeId && hd.enabled && hd.date === mmdd
      );
      if (isHoliday) return [];
    }

    if (pattern.type === 'WEEKLY_WORKING_TIME') {
      // Prefer stored record (historical integrity after transfers).
      // When preferDraft=true (OT validation), a draft record wins over the published
      // one so that managers see consistent results while editing before publishing.
      const rec = preferDraft
        ? (dayStore.findOne((d) => d.userId === userId && d.date === date && d.status === 'draft')
           ?? dayStore.findOne((d) => d.userId === userId && d.date === date && (d.status ?? 'published') === 'published'))
        : dayStore.findOne((d) => d.userId === userId && d.date === date && (d.status ?? 'published') === 'published');
      if (rec) {
        if (rec.isDayOff) return [];
        if (rec.weeklyStartTime && rec.weeklyEndTime) {
          return [{ start: rec.weeklyStartTime, end: rec.weeklyEndTime }];
        }
        return [];
      }
      // Fall back to live pattern
      const dow     = new Date(date + 'T00:00:00').getDay();
      const weekDay = pattern.weeklySchedule?.find((d) => d.dayOfWeek === dow);
      if (!weekDay) return [];
      return [{ start: weekDay.startTime, end: weekDay.endTime }];
    }

    // ── SHIFT_TIME ────────────────────────────────────────────────────────────
    // OT validation must see draft shifts — a manager who has assigned but not yet
    // published a shift should have OT blocked against it; equally, a manager who
    // has REMOVED a shift in draft should not have that removed shift block OT.
    // preferDraft=true → explicit draft-first ordering (deterministic).
    // preferDraft=false → original unfiltered findOne (preserves existing behaviour).
    const rec = preferDraft
      ? (dayStore.findOne((d) => d.userId === userId && d.date === date && d.status === 'draft')
         ?? dayStore.findOne((d) => d.userId === userId && d.date === date && (d.status ?? 'published') === 'published'))
      : dayStore.findOne((d) => d.userId === userId && d.date === date);
    if (!rec || rec.isDayOff) return [];

    const codes = rec.shiftCodes.length > 0
      ? rec.shiftCodes
      : rec.shiftCode ? [rec.shiftCode] : [];

    const ranges: { start: string; end: string }[] = [];
    for (const code of codes) {
      const shift = pattern.shifts?.find((s) => s.code === code);
      if (shift?.startTime && shift.endTime) {
        ranges.push({ start: shift.startTime, end: shift.endTime });
      }
    }
    return ranges;
  },

  // ── Helpers for controllers ───────────────────────────────────────────────────

  /**
   * Returns the list of department IDs managed by the given user.
   * Used by the controller to build the response metadata (e.g. dropdown options).
   */
  getManagedDeptIds,
};
