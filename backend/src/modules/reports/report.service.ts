import type {
  AttendanceRecord,
  AttendanceStatus,
  Department,
  WorkSchedulePattern,
  UserRole,
} from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import {
  computeWorkedMinutes,
  computeMonthlySummary,
  resolveMonthlyTarget,
  getBreakMinutes,
  type MonthlySummary,
} from '../attendance/hours';
import type { UserRecord } from '../employees/employee.service';

// ─── Internal types ───────────────────────────────────────────────────────────

interface ScheduleRecord {
  id: string;
  userId: string;
  weekStart: string;
  days: Record<string, {
    shiftCode: string | null;
    isDayOff:  boolean;
    timeOverride?: { startTime: string; endTime: string; isOvernight?: boolean };
  }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Repositories ─────────────────────────────────────────────────────────────

const attendanceStore: IRepository<AttendanceRecord> = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:   IRepository<UserRecord>       = new JsonRepository<UserRecord>('employees');
const deptStore:       IRepository<Department>       = new JsonRepository<Department>('departments');
const workSchedulePatternStore: IRepository<WorkSchedulePattern> = new JsonRepository<WorkSchedulePattern>('sub_roles');
const scheduleStore:   IRepository<ScheduleRecord>   = new JsonRepository<ScheduleRecord>('schedules');

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface EmployeeMeta {
  userId:       string;
  employeeCode: string;
  fullNameTh:   string;
  departmentId: string;
}

export interface WeeklyEmployeeRow extends EmployeeMeta {
  presentDays:    number;
  lateDays:       number;
  earlyLeaveDays: number;
  absentDays:     number;
  pendingDays:    number;
  leaveDays:      number;
  workedHours:    number;
}

export interface WeeklySummaryReport {
  weekStart:    string;  // YYYY-MM-DD
  weekEnd:      string;  // YYYY-MM-DD
  departmentId: string | null;
  employees:    WeeklyEmployeeRow[];
  totals: Pick<WeeklyEmployeeRow,
    'presentDays' | 'lateDays' | 'earlyLeaveDays' |
    'absentDays'  | 'pendingDays' | 'leaveDays' | 'workedHours'>;
}

export interface MonthlyEmployeeRow extends MonthlySummary, EmployeeMeta {}

export interface MonthlySummaryReport {
  month:        string;  // YYYY-MM
  departmentId: string | null;
  employees:    MonthlyEmployeeRow[];
  totals: Pick<MonthlySummary,
    'workedHours' | 'overtime' | 'presentDays' | 'lateDays' |
    'earlyLeaveDays' | 'absentDays' | 'pendingDays' | 'leaveDays'>;
}

export interface PlannedVsActualRow extends EmployeeMeta {
  plannedHours: number;
  actualHours:  number;
  difference:   number;  // actualHours - plannedHours (negative = undertime)
}

export interface PlannedVsActualReport {
  month:        string;
  departmentId: string | null;
  employees:    PlannedVsActualRow[];
}

export interface PendingApprovalRow extends EmployeeMeta {
  attendanceId:  string;
  date:          string;
  checkInTime?:  string;
  checkOutTime?: string;
  checkInLat?:   number;
  checkInLng?:   number;
  note?:         string;
}

export interface PendingApprovalsReport {
  departmentId: string | null;
  total:        number;
  records:      PendingApprovalRow[];
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function employeeMeta(emp: UserRecord): EmployeeMeta {
  return {
    userId:       emp.id,
    employeeCode: emp.employeeCode,
    fullNameTh:   `${emp.firstNameTh} ${emp.lastNameTh}`,
    departmentId: emp.departmentId,
  };
}

/**
 * Generate all YYYY-MM-DD strings for every day in the range [start, end] inclusive.
 */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Returns all active employees visible to the actor, optionally scoped to a
 * single department.
 *
 * Manager → their managed departments only (must include deptId if given).
 * HR / super_admin → all (or just deptId if provided).
 *
 * @throws 403 when manager requests a dept they don't manage.
 */
function getScopedEmployees(
  actorUserId: string,
  actorRole:   UserRole,
  deptId?:     string,
): UserRecord[] {
  if (hasPermission(actorRole, 'hr')) {
    return employeeStore.findAll(
      (e) => e.isActive && (!deptId || e.departmentId === deptId),
    );
  }

  // Manager: resolve managed dept IDs
  const managedDeptIds = new Set(
    deptStore
      .findAll((d) => d.managerId === actorUserId && d.isActive)
      .map((d) => d.id),
  );

  if (managedDeptIds.size === 0) {
    return [];
  }

  if (deptId) {
    if (!managedDeptIds.has(deptId)) {
      throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
    }
    return employeeStore.findAll((e) => e.isActive && e.departmentId === deptId);
  }

  return employeeStore.findAll(
    (e) => e.isActive && managedDeptIds.has(e.departmentId),
  );
}

/**
 * Compute the planned (scheduled) working minutes for one employee in a given
 * set of dates.
 *
 * Uses: WorkSchedule → ScheduleDay → WorkSchedulePattern shift → duration − breakMinutes.
 * If a day has a timeOverride, computes duration from those times instead.
 */
function plannedMinutesForDates(userId: string, dates: string[]): number {
  const employee = employeeStore.findById(userId);
  if (!employee?.workSchedulePatternId) return 0;

  const workSchedulePattern = workSchedulePatternStore.findById(employee.workSchedulePatternId);
  if (!workSchedulePattern) return 0;

  let total = 0;

  for (const dateStr of dates) {
    const schedule = scheduleStore.findOne(
      (s) => s.userId === userId && s.days[dateStr] !== undefined,
    );
    if (!schedule) continue;

    const day = schedule.days[dateStr];
    if (!day || day.isDayOff || !day.shiftCode) continue;

    if (day.timeOverride) {
      // Override: compute duration from override times
      const startMins = toMins(day.timeOverride.startTime);
      const endMins   = toMins(day.timeOverride.endTime);
      const isON      = day.timeOverride.isOvernight ?? false;
      let dur: number;
      if (isON)          dur = (24 * 60 - startMins) + endMins;
      else if (endMins === 0) dur = 24 * 60 - startMins;
      else               dur = endMins - startMins;
      // Use shift's break as fallback (override doesn't carry its own break)
      const shift = workSchedulePattern.shifts.find((s) => s.code === day.shiftCode);
      total += Math.max(0, dur - (shift?.breakMinutes ?? 0));
    } else {
      const shift = workSchedulePattern.shifts.find((s) => s.code === day.shiftCode);
      if (!shift) continue;
      let dur: number;
      const startMins = toMins(shift.startTime);
      const endMins   = toMins(shift.endTime);
      if (shift.isOvernight)   dur = (24 * 60 - startMins) + endMins;
      else if (endMins === 0)  dur = 24 * 60 - startMins;
      else                     dur = endMins - startMins;
      total += Math.max(0, dur - shift.breakMinutes);
    }
  }

  return total;
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

function weekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const reportService = {

  // ── 1. Weekly summary ────────────────────────────────────────────────────────

  weekly(
    weekStart:   string,
    deptId:      string | undefined,
    actorUserId: string,
    actorRole:   UserRole,
  ): WeeklySummaryReport {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new AppError(400, 'weekStart must be YYYY-MM-DD', 'VALIDATION_ERROR');
    }

    const end   = weekEnd(weekStart);
    const dates = dateRange(weekStart, end);
    const employees = getScopedEmployees(actorUserId, actorRole, deptId);

    const rows: WeeklyEmployeeRow[] = employees.map((emp) => {
      const records = attendanceStore.findAll(
        (r) => r.userId === emp.id && dates.includes(r.date),
      );

      let presentDays = 0, lateDays = 0, earlyLeaveDays = 0;
      let absentDays  = 0, pendingDays = 0, leaveDays = 0;
      let workedMins  = 0;

      for (const r of records) {
        workedMins += computeWorkedMinutes(r, getBreakMinutes(r));
        switch (r.status as AttendanceStatus) {
          case 'present':          presentDays++;    break;
          case 'late':             lateDays++;       break;
          case 'early_leave':      earlyLeaveDays++; break;
          case 'absent':           absentDays++;     break;
          case 'pending_approval': pendingDays++;    break;
          case 'on_leave':
          case 'holiday':          leaveDays++;      break;
        }
      }

      return {
        ...employeeMeta(emp),
        presentDays, lateDays, earlyLeaveDays,
        absentDays, pendingDays, leaveDays,
        workedHours: round2(workedMins / 60),
      };
    });

    // Totals row
    const totals = rows.reduce(
      (acc, r) => ({
        presentDays:    acc.presentDays    + r.presentDays,
        lateDays:       acc.lateDays       + r.lateDays,
        earlyLeaveDays: acc.earlyLeaveDays + r.earlyLeaveDays,
        absentDays:     acc.absentDays     + r.absentDays,
        pendingDays:    acc.pendingDays    + r.pendingDays,
        leaveDays:      acc.leaveDays      + r.leaveDays,
        workedHours:    round2(acc.workedHours + r.workedHours),
      }),
      { presentDays: 0, lateDays: 0, earlyLeaveDays: 0,
        absentDays: 0, pendingDays: 0, leaveDays: 0, workedHours: 0 },
    );

    return {
      weekStart,
      weekEnd: end,
      departmentId: deptId ?? null,
      employees: rows,
      totals,
    };
  },

  // ── 2. Monthly summary ────────────────────────────────────────────────────────

  monthly(
    month:       string,
    deptId:      string | undefined,
    actorUserId: string,
    actorRole:   UserRole,
  ): MonthlySummaryReport {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be YYYY-MM', 'VALIDATION_ERROR');
    }

    const employees = getScopedEmployees(actorUserId, actorRole, deptId);

    const rows: MonthlyEmployeeRow[] = employees.map((emp) => ({
      ...employeeMeta(emp),
      ...computeMonthlySummary(emp.id, month),
    }));

    const totals = rows.reduce(
      (acc, r) => ({
        workedHours:    round2(acc.workedHours    + r.workedHours),
        overtime:       round2(acc.overtime       + r.overtime),
        presentDays:    acc.presentDays    + r.presentDays,
        lateDays:       acc.lateDays       + r.lateDays,
        earlyLeaveDays: acc.earlyLeaveDays + r.earlyLeaveDays,
        absentDays:     acc.absentDays     + r.absentDays,
        pendingDays:    acc.pendingDays    + r.pendingDays,
        leaveDays:      acc.leaveDays      + r.leaveDays,
      }),
      { workedHours: 0, overtime: 0, presentDays: 0, lateDays: 0,
        earlyLeaveDays: 0, absentDays: 0, pendingDays: 0, leaveDays: 0 },
    );

    return { month, departmentId: deptId ?? null, employees: rows, totals };
  },

  // ── 3. Planned vs actual ──────────────────────────────────────────────────────

  plannedVsActual(
    month:       string,
    deptId:      string | undefined,
    actorUserId: string,
    actorRole:   UserRole,
  ): PlannedVsActualReport {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be YYYY-MM', 'VALIDATION_ERROR');
    }

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dates = dateRange(
      `${month}-01`,
      `${month}-${String(daysInMonth).padStart(2, '0')}`,
    );

    const employees = getScopedEmployees(actorUserId, actorRole, deptId);

    const rows: PlannedVsActualRow[] = employees.map((emp) => {
      const plannedMins = plannedMinutesForDates(emp.id, dates);
      const summary     = computeMonthlySummary(emp.id, month);
      const actualHours  = summary.workedHours;
      const plannedHours = round2(plannedMins / 60);
      return {
        ...employeeMeta(emp),
        plannedHours,
        actualHours,
        difference: round2(actualHours - plannedHours),
      };
    });

    return { month, departmentId: deptId ?? null, employees: rows };
  },

  // ── 4. Pending approvals ──────────────────────────────────────────────────────

  pendingApprovals(
    deptId:      string | undefined,
    actorUserId: string,
    actorRole:   UserRole,
  ): PendingApprovalsReport {
    const employees   = getScopedEmployees(actorUserId, actorRole, deptId);
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const pending = attendanceStore.findAll(
      (r) => r.status === 'pending_approval' && employeeMap.has(r.userId),
    ).sort((a, b) => a.date.localeCompare(b.date));

    const records: PendingApprovalRow[] = pending.map((r) => {
      const emp = employeeMap.get(r.userId)!;
      return {
        ...employeeMeta(emp),
        attendanceId: r.id,
        date:         r.date,
        checkInTime:  r.checkInTime,
        checkOutTime: r.checkOutTime,
        checkInLat:   r.checkInLat,
        checkInLng:   r.checkInLng,
        note:         r.note,
      };
    });

    return { departmentId: deptId ?? null, total: records.length, records };
  },
};
