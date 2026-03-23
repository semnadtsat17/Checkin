import type { ExtraWork, ExtraWorkReason, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import type { UserRecord } from '../employees/employee.service';
import { scheduleService } from '../schedules/schedule.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateExtraWorkDto {
  employeeId:    string;
  departmentId:  string;
  date:          string;          // YYYY-MM-DD
  startTime:     string;          // HH:mm
  endTime:       string;          // HH:mm
  reason:        ExtraWorkReason;
  customReason?: string;
}

export interface UpdateExtraWorkDto {
  date?:         string;
  startTime?:    string;
  endTime?:      string;
  reason?:       ExtraWorkReason;
  customReason?: string;
}

export interface ExtraWorkFilters {
  employeeId?:   string;
  departmentId?: string;
  date?:         string;
  from?:         string;  // YYYY-MM-DD  (inclusive)
  to?:           string;  // YYYY-MM-DD  (inclusive)
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const store:         IRepository<ExtraWork> = new JsonRepository<ExtraWork>('extra_work');
const employeeStore: IRepository<UserRecord> = new JsonRepository<UserRecord>('employees');

// ─── Validation helpers ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_REASONS: ExtraWorkReason[] = ['ot', 'compensate', 'training', 'meeting', 'other'];

function assertDate(v: string, field: string): void {
  if (!DATE_RE.test(v) || isNaN(Date.parse(v))) {
    throw new AppError(400, `${field} must be a valid YYYY-MM-DD date`, 'VALIDATION_ERROR');
  }
}

function assertTime(v: string, field: string): void {
  if (!TIME_RE.test(v)) throw new AppError(400, `${field} must be HH:mm`, 'VALIDATION_ERROR');
  const [h, m] = v.split(':').map(Number);
  if (h > 23 || m > 59) throw new AppError(400, `${field} is invalid`, 'VALIDATION_ERROR');
}

// ─── Absolute-Date overlap helpers (server-side mirror of rangeEngine.ts) ─────
//
// These functions duplicate the frontend's rangeEngine.ts logic in Node.js.
// The overlap formula is identical to rangesOverlap():
//   a.start < b.end  AND  a.end > b.start
// Boundary equality is NOT overlap (touching allowed).

/** Combine YYYY-MM-DD + HH:mm into a local-time Date. */
function toAbsDate(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d;
}

/** YYYY-MM-DD offset by n calendar days. */
function offsetDate(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Normalise an HH:mm range anchored on `dateStr` to [Date, Date].
 * Cross-midnight detection: if endHhmm ≤ startHhmm the end is placed on
 * the next calendar day (no shift-label reasoning — pure arithmetic).
 */
function normalizeRange(dateStr: string, startHhmm: string, endHhmm: string): [Date, Date] {
  const start = toAbsDate(dateStr, startHhmm);
  let   end   = toAbsDate(dateStr, endHhmm);
  if (end <= start) end = new Date(end.getTime() + 86_400_000);
  return [start, end];
}

/**
 * True when two absolute [start, end] ranges overlap.
 * Boundary equality (touching) is NOT overlap.
 */
function absRangesOverlap(a: [Date, Date], b: [Date, Date]): boolean {
  return a[0] < b[1] && a[1] > b[0];
}

/**
 * Check whether a candidate [ewStart, ewEnd] on `ewDate` overlaps any of the
 * given working-time ranges (which may originate from `rangeDate`, a different
 * calendar day, e.g. the previous day for cross-midnight shifts).
 *
 * Each working-time range is first clipped to `ewDate`'s 24-hour window
 * [ewDate 00:00, ewDate+1 00:00) before the overlap test.  This mirrors the
 * frontend's sliceRangeByDay() step: only the portion of a cross-midnight
 * shift that falls on the OT date is evaluated.
 *
 * Example: shift DayN 20:00→04:00
 *   When validating OT on DayN:   range clipped to [20:00, 24:00)
 *   When validating OT on DayN+1: range clipped to [00:00, 04:00)
 *
 * Throws EXTRA_WORK_OVERLAPS_MAIN_TIME on the first conflict found.
 */
function assertNoWorkingTimeOverlap(
  ewDate:    string,
  ewStart:   string,
  ewEnd:     string,
  rangeDate: string,
  ranges:    { start: string; end: string }[]
): void {
  const candidate  = normalizeRange(ewDate, ewStart, ewEnd);
  const dayStart   = new Date(`${ewDate}T00:00:00`);
  const dayEnd     = new Date(dayStart.getTime() + 86_400_000);

  for (const r of ranges) {
    const [rStart, rEnd] = normalizeRange(rangeDate, r.start, r.end);

    // Clip range to the OT calendar day window (matches frontend sliceRangeByDay).
    const clippedStart = rStart > dayStart ? rStart : dayStart;
    const clippedEnd   = rEnd   < dayEnd   ? rEnd   : dayEnd;
    if (clippedStart >= clippedEnd) continue; // range outside today's window

    if (absRangesOverlap(candidate, [clippedStart, clippedEnd])) {
      throw new AppError(
        400,
        'Extra work time overlaps with main working time',
        'EXTRA_WORK_OVERLAPS_MAIN_TIME'
      );
    }
  }
}

/** Verify the actor manages the given department (or is HR+). */
function requireDeptAccess(actorRole: UserRole, actorUserId: string, departmentId: string): void {
  if (hasPermission(actorRole, 'hr')) return;
  const actor = employeeStore.findById(actorUserId);
  const managed = new Set(actor?.managerDepartments ?? []);
  if (!managed.has(departmentId)) {
    throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const extraWorkService = {

  /**
   * List extra-work entries.
   * Managers are auto-scoped to their managed departments.
   */
  findAll(
    filters: ExtraWorkFilters,
    actorRole: UserRole,
    actorUserId: string
  ): ExtraWork[] {
    let allowedDepts: Set<string> | null = null;

    if (!hasPermission(actorRole, 'hr')) {
      const actor = employeeStore.findById(actorUserId);
      allowedDepts = new Set(actor?.managerDepartments ?? []);

      if (filters.departmentId && !allowedDepts.has(filters.departmentId)) {
        throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
      }
    }

    return store.findAll((ew) => {
      if (ew.deletedAt) return false;  // hide pending-deletion records from admin grid
      if (allowedDepts && !allowedDepts.has(ew.departmentId)) return false;
      if (filters.employeeId   && ew.employeeId   !== filters.employeeId)   return false;
      if (filters.departmentId && ew.departmentId !== filters.departmentId) return false;
      if (filters.date         && ew.date         !== filters.date)         return false;
      if (filters.from         && ew.date          < filters.from)          return false;
      if (filters.to           && ew.date          > filters.to)            return false;
      return true;
    });
  },

  findById(id: string): ExtraWork {
    const ew = store.findById(id);
    if (!ew) throw new AppError(404, `ExtraWork '${id}' not found`, 'NOT_FOUND');
    return ew;
  },

  /** Employee self-service: their own PUBLISHED extra-work entries only. */
  getMyExtraWork(
    userId: string,
    filters: { date?: string; from?: string; to?: string }
  ): ExtraWork[] {
    return store.findAll((ew) => {
      if (ew.employeeId !== userId) return false;
      // Employees never see draft or soft-deleted extra work.
      if ((ew.status ?? 'published') !== 'published') return false;
      if (ew.deletedAt) return false;
      if (filters.date && ew.date !== filters.date) return false;
      if (filters.from && ew.date  < filters.from)  return false;
      if (filters.to   && ew.date  > filters.to)    return false;
      return true;
    });
  },

  create(
    dto: CreateExtraWorkDto,
    actorRole: UserRole,
    actorUserId: string
  ): ExtraWork {
    requireDeptAccess(actorRole, actorUserId, dto.departmentId);

    // Employee must belong to the stated department
    const emp = employeeStore.findById(dto.employeeId);
    if (!emp) throw new AppError(404, 'Employee not found', 'NOT_FOUND');
    if (emp.departmentId !== dto.departmentId) {
      throw new AppError(400, 'Employee does not belong to this department', 'VALIDATION_ERROR');
    }

    // Field validation
    if (!dto.employeeId?.trim())   throw new AppError(400, 'employeeId is required',   'VALIDATION_ERROR');
    if (!dto.departmentId?.trim()) throw new AppError(400, 'departmentId is required', 'VALIDATION_ERROR');
    assertDate(dto.date, 'date');
    assertTime(dto.startTime, 'startTime');
    assertTime(dto.endTime,   'endTime');

    if (dto.startTime >= dto.endTime) {
      throw new AppError(400, 'endTime must be after startTime', 'INVALID_TIME_RANGE');
    }
    if (!VALID_REASONS.includes(dto.reason)) {
      throw new AppError(400, 'Invalid reason value', 'VALIDATION_ERROR');
    }
    if (dto.reason === 'other' && !dto.customReason?.trim()) {
      throw new AppError(400, 'customReason is required when reason is "other"', 'VALIDATION_ERROR');
    }

    // Duplicate check: same employee + date + exact time range
    const isDuplicate = store.exists(
      (ew) =>
        ew.employeeId === dto.employeeId &&
        ew.date       === dto.date       &&
        ew.startTime  === dto.startTime  &&
        ew.endTime    === dto.endTime
    );
    if (isDuplicate) {
      throw new AppError(409, 'A duplicate extra-work entry already exists', 'DUPLICATE');
    }

    // Overlap check — uses absolute Date comparison (mirrors frontend rangeEngine).
    // resolveWorkingTimeRanges now includes draft records so draft shifts block OT.
    const prevDate   = offsetDate(dto.date, -1);
    const mainRanges = scheduleService.resolveWorkingTimeRanges(dto.employeeId, dto.date);
    const prevRanges = scheduleService.resolveWorkingTimeRanges(dto.employeeId, prevDate);
    assertNoWorkingTimeOverlap(dto.date, dto.startTime, dto.endTime, dto.date,   mainRanges);
    assertNoWorkingTimeOverlap(dto.date, dto.startTime, dto.endTime, prevDate,   prevRanges);

    return store.create({
      employeeId:   dto.employeeId.trim(),
      departmentId: dto.departmentId.trim(),
      date:         dto.date,
      startTime:    dto.startTime,
      endTime:      dto.endTime,
      reason:       dto.reason,
      customReason: dto.reason === 'other' ? dto.customReason!.trim() : undefined,
      status:       'draft' as const,  // always saved as draft; publish is a separate action
      createdBy:    actorUserId,
    } as Omit<ExtraWork, 'id' | 'createdAt' | 'updatedAt'>);
  },

  update(
    id: string,
    dto: UpdateExtraWorkDto,
    actorRole: UserRole,
    actorUserId: string
  ): ExtraWork {
    const existing = this.findById(id);
    requireDeptAccess(actorRole, actorUserId, existing.departmentId);

    const patch: Partial<ExtraWork> = {};

    if (dto.date !== undefined) {
      assertDate(dto.date, 'date');
      patch.date = dto.date;
    }
    if (dto.startTime !== undefined) {
      assertTime(dto.startTime, 'startTime');
      patch.startTime = dto.startTime;
    }
    if (dto.endTime !== undefined) {
      assertTime(dto.endTime, 'endTime');
      patch.endTime = dto.endTime;
    }

    const finalStart = patch.startTime ?? existing.startTime;
    const finalEnd   = patch.endTime   ?? existing.endTime;
    if (finalStart >= finalEnd) {
      throw new AppError(400, 'endTime must be after startTime', 'INVALID_TIME_RANGE');
    }

    // Overlap check — absolute Date comparison, draft-inclusive resolver.
    const finalDate  = patch.date ?? existing.date;
    const prevDate   = offsetDate(finalDate, -1);
    const mainRanges = scheduleService.resolveWorkingTimeRanges(existing.employeeId, finalDate);
    const prevRanges = scheduleService.resolveWorkingTimeRanges(existing.employeeId, prevDate);
    assertNoWorkingTimeOverlap(finalDate, finalStart, finalEnd, finalDate, mainRanges);
    assertNoWorkingTimeOverlap(finalDate, finalStart, finalEnd, prevDate,  prevRanges);

    if (dto.reason !== undefined) {
      if (!VALID_REASONS.includes(dto.reason)) {
        throw new AppError(400, 'Invalid reason value', 'VALIDATION_ERROR');
      }
      patch.reason = dto.reason;
    }

    const finalReason = patch.reason ?? existing.reason;
    if (finalReason === 'other') {
      const cr = dto.customReason ?? existing.customReason;
      if (!cr?.trim()) throw new AppError(400, 'customReason is required', 'VALIDATION_ERROR');
      patch.customReason = cr.trim();
    } else {
      // Clear customReason when switching away from 'other'
      patch.customReason = undefined;
    }

    // Any edit resets to draft — the change must be re-published to become employee-visible.
    patch.status = 'draft' as const;

    return store.updateById(id, patch) as ExtraWork;
  },

  remove(id: string, actorRole: UserRole, actorUserId: string): void {
    const existing = this.findById(id);
    requireDeptAccess(actorRole, actorUserId, existing.departmentId);
    // Soft delete: mark as pending-deletion draft instead of hard-deleting.
    // The record remains invisible to employees (deletedAt filter) and is
    // permanently removed from the DB only when publishDays() runs for this dept+month.
    store.updateById(id, {
      deletedAt: new Date().toISOString(),
      status:    'draft' as const,
    });
  },
};
