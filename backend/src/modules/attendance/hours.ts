/**
 * Pure hours-calculation functions.
 * No storage I/O — only math and store lookups passed as arguments.
 * Keeps the logic easy to unit-test in isolation.
 */
import type { AttendanceRecord, Branch, Department, WorkSchedulePattern } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import type { UserRecord } from '../employees/employee.service';

// ─── Internal types ───────────────────────────────────────────────────────────

interface WorkScheduleRecord {
  id: string;
  userId: string;
  weekStart: string;
  days: Record<string, {
    shiftCode: string | null;
    isDayOff:  boolean;
    timeOverride?: { startTime: string; endTime: string };
  }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Repositories ─────────────────────────────────────────────────────────────

const attendanceStore: IRepository<AttendanceRecord>   = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:   IRepository<UserRecord>         = new JsonRepository<UserRecord>('employees');
const workSchedulePatternStore: IRepository<WorkSchedulePattern> = new JsonRepository<WorkSchedulePattern>('sub_roles');
const deptStore:       IRepository<Department>         = new JsonRepository<Department>('departments');
const scheduleStore:   IRepository<WorkScheduleRecord> = new JsonRepository<WorkScheduleRecord>('schedules');

// ─── Exported summary shape ───────────────────────────────────────────────────

export interface MonthlySummary {
  month:          string;  // YYYY-MM
  userId:         string;
  workedMinutes:  number;  // total net worked minutes (after breaks)
  workedHours:    number;  // workedMinutes / 60, 2 decimal places
  monthlyTarget:  number;  // contracted hours (subRole default or HR override)
  overtime:       number;  // workedHours - monthlyTarget (negative = undertime)
  presentDays:    number;
  lateDays:       number;
  earlyLeaveDays: number;
  absentDays:     number;
  pendingDays:    number;  // pending_approval — not yet counted in hours
  leaveDays:      number;  // on_leave + holiday
}

// ─── Statuses that contribute worked hours ────────────────────────────────────

const COUNTABLE_STATUSES = new Set<AttendanceRecord['status']>([
  'present',
  'late',
  'early_leave',
]);

// ─── Break-minute lookup ──────────────────────────────────────────────────────

/**
 * Look up the scheduled break for a given attendance record.
 *
 * Chain:
 *   WorkSchedule[record.date].shiftCode
 *   → SubRole.shifts[shiftCode].breakMinutes
 *
 * timeOverride only changes start/end times, NOT the break duration.
 * Returns 0 when any part of the chain is missing.
 */
export function getBreakMinutes(record: AttendanceRecord): number {
  const schedule = scheduleStore.findOne(
    (s) => s.userId === record.userId && s.days[record.date] !== undefined,
  );
  if (!schedule) return 0;

  const day = schedule.days[record.date];
  if (!day || day.isDayOff || !day.shiftCode) return 0;

  const employee = employeeStore.findById(record.userId);
  if (!employee?.workSchedulePatternId) return 0;

  const workSchedulePattern = workSchedulePatternStore.findById(employee.workSchedulePatternId);
  if (!workSchedulePattern) return 0;

  const shift = workSchedulePattern.shifts.find((s) => s.code === day.shiftCode);
  return shift?.breakMinutes ?? 0;
}

// ─── Per-record worked minutes ────────────────────────────────────────────────

/**
 * Net worked minutes for a single attendance record.
 *
 * Returns 0 when:
 *   - checkOutTime is missing (still checked-in)
 *   - status is absent / on_leave / holiday / pending_approval
 *
 * Uses ISO timestamp subtraction — no midnight-wrap issue because
 * overnight checkOuts are always the next calendar date.
 */
export function computeWorkedMinutes(
  record: AttendanceRecord,
  breakMinutes: number,
): number {
  if (!COUNTABLE_STATUSES.has(record.status)) return 0;
  if (!record.checkInTime || !record.checkOutTime)  return 0;

  const diffMs = new Date(record.checkOutTime).getTime() -
                 new Date(record.checkInTime).getTime();

  if (diffMs <= 0) return 0;

  return Math.max(0, diffMs / 60_000 - breakMinutes);
}

// ─── Monthly target resolution ────────────────────────────────────────────────

/**
 * Resolve the monthly hours target for an employee.
 *
 * Priority:
 *   1. User.monthlyHoursOverride (HR-set override)
 *   2. SubRole.monthlyWorkingHours
 *   3. 0 (employee has no subRole assigned)
 */
export function resolveMonthlyTarget(userId: string): number {
  const employee = employeeStore.findById(userId);
  if (!employee) return 0;

  if (typeof employee.monthlyHoursOverride === 'number') {
    return employee.monthlyHoursOverride;
  }

  if (employee.workSchedulePatternId) {
    const workSchedulePattern = workSchedulePatternStore.findById(employee.workSchedulePatternId);
    if (workSchedulePattern) return workSchedulePattern.monthlyWorkingHours;
  }

  return 0;
}

// ─── Monthly aggregation ──────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute the full monthly summary for one employee.
 *
 * @param userId   - target employee
 * @param month    - YYYY-MM (e.g. "2026-03")
 */
export function computeMonthlySummary(userId: string, month: string): MonthlySummary {
  const records = attendanceStore.findAll(
    (r) => r.userId === userId && r.date.startsWith(month),
  );

  let totalMinutes  = 0;
  let presentDays   = 0;
  let lateDays      = 0;
  let earlyLeaveDays = 0;
  let absentDays    = 0;
  let pendingDays   = 0;
  let leaveDays     = 0;

  for (const record of records) {
    const breakMins = getBreakMinutes(record);
    totalMinutes += computeWorkedMinutes(record, breakMins);

    switch (record.status) {
      case 'present':          presentDays++;    break;
      case 'late':             lateDays++;       break;
      case 'early_leave':      earlyLeaveDays++; break;
      case 'absent':           absentDays++;     break;
      case 'pending_approval': pendingDays++;    break;
      case 'on_leave':
      case 'holiday':          leaveDays++;      break;
    }
  }

  const workedHours   = round2(totalMinutes / 60);
  const monthlyTarget = resolveMonthlyTarget(userId);
  const overtime      = round2(workedHours - monthlyTarget);

  return {
    month,
    userId,
    workedMinutes:  Math.round(totalMinutes),
    workedHours,
    monthlyTarget,
    overtime,
    presentDays,
    lateDays,
    earlyLeaveDays,
    absentDays,
    pendingDays,
    leaveDays,
  };
}
