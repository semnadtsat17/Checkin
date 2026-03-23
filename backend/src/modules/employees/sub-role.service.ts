import type { WorkSchedulePattern, WorkSchedulePatternShift, WorkSchedulePatternType, WeeklyScheduleDay, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface WorkSchedulePatternShiftDto {
  code:          string;
  nameTh:        string;
  nameEn?:       string;
  startTime:     string;   // HH:mm
  endTime:       string;   // HH:mm
  isOvernight:   boolean;
  breakMinutes?: number;   // default 0
}

export interface WeeklyScheduleDayDto {
  dayOfWeek: number;   // 0 = Sunday … 6 = Saturday
  startTime: string;   // HH:mm
  endTime:   string;   // HH:mm
}

export interface CreateWorkSchedulePatternDto {
  nameTh:               string;
  nameEn?:              string;
  forRole:              UserRole;
  type?:                WorkSchedulePatternType;    // defaults to SHIFT_TIME
  monthlyWorkingHours:  number;
  shifts?:              WorkSchedulePatternShiftDto[];   // required when type = SHIFT_TIME
  weeklySchedule?:      WeeklyScheduleDayDto[];          // required when type = WEEKLY_WORKING_TIME
}

export interface UpdateWorkSchedulePatternDto {
  nameTh?:              string;
  nameEn?:              string;
  forRole?:             UserRole;
  type?:                WorkSchedulePatternType;
  monthlyWorkingHours?: number;
  shifts?:              WorkSchedulePatternShiftDto[];
  weeklySchedule?:      WeeklyScheduleDayDto[];
  isActive?:            boolean;
}

export interface WorkSchedulePatternFilters {
  forRole?:  UserRole;
  isActive?: boolean;
}

// Deprecated aliases — kept for backward compat during migration
/** @deprecated Use WorkSchedulePatternShiftDto */
export type SubRoleShiftDto = WorkSchedulePatternShiftDto;
/** @deprecated Use CreateWorkSchedulePatternDto */
export type CreateSubRoleDto = CreateWorkSchedulePatternDto;
/** @deprecated Use UpdateWorkSchedulePatternDto */
export type UpdateSubRoleDto = UpdateWorkSchedulePatternDto;
/** @deprecated Use WorkSchedulePatternFilters */
export type SubRoleFilters = WorkSchedulePatternFilters;

// ─── Storage ──────────────────────────────────────────────────────────────────

// Collection file kept as 'sub_roles' for backward compat with existing data
const store: IRepository<WorkSchedulePattern> = new JsonRepository<WorkSchedulePattern>('sub_roles');

// ─── Validation helpers ───────────────────────────────────────────────────────

const TIME_RE = /^\d{2}:\d{2}$/;

function validateTime(value: string, field: string): void {
  if (!TIME_RE.test(value)) {
    throw new AppError(400, `${field} must be HH:mm (e.g. "08:00")`, 'VALIDATION_ERROR');
  }
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) {
    throw new AppError(400, `${field} has invalid hour/minute values`, 'VALIDATION_ERROR');
  }
}

function validateWeeklySchedule(days: WeeklyScheduleDayDto[]): WeeklyScheduleDay[] {
  if (!Array.isArray(days) || days.length === 0) {
    throw new AppError(400, 'weeklySchedule must be a non-empty array', 'VALIDATION_ERROR');
  }

  const seen = new Set<number>();

  return days.map((d, i) => {
    const prefix = `weeklySchedule[${i}]`;

    if (typeof d.dayOfWeek !== 'number' || d.dayOfWeek < 0 || d.dayOfWeek > 6) {
      throw new AppError(400, `${prefix}.dayOfWeek must be 0–6`, 'VALIDATION_ERROR');
    }
    if (seen.has(d.dayOfWeek)) {
      throw new AppError(400, `Duplicate dayOfWeek '${d.dayOfWeek}' in weeklySchedule`, 'VALIDATION_ERROR');
    }
    seen.add(d.dayOfWeek);

    if (!d.startTime) throw new AppError(400, `${prefix}.startTime is required`, 'VALIDATION_ERROR');
    if (!d.endTime)   throw new AppError(400, `${prefix}.endTime is required`,   'VALIDATION_ERROR');

    validateTime(d.startTime, `${prefix}.startTime`);
    validateTime(d.endTime,   `${prefix}.endTime`);

    // Validate start < end (simple string compare works for HH:mm)
    if (d.startTime >= d.endTime) {
      throw new AppError(400, `${prefix}.startTime must be before endTime`, 'VALIDATION_ERROR');
    }

    return { dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime };
  });
}

function validateShifts(shifts: WorkSchedulePatternShiftDto[]): WorkSchedulePatternShift[] {
  if (!Array.isArray(shifts) || shifts.length === 0) {
    throw new AppError(400, 'shifts must be a non-empty array', 'VALIDATION_ERROR');
  }

  const codes = new Set<string>();

  return shifts.map((s, i) => {
    const prefix = `shifts[${i}]`;

    if (!s.code?.trim()) {
      throw new AppError(400, `${prefix}.code is required`, 'VALIDATION_ERROR');
    }
    if (!s.nameTh?.trim()) {
      throw new AppError(400, `${prefix}.nameTh is required`, 'VALIDATION_ERROR');
    }
    if (!s.startTime) {
      throw new AppError(400, `${prefix}.startTime is required`, 'VALIDATION_ERROR');
    }
    if (!s.endTime) {
      throw new AppError(400, `${prefix}.endTime is required`, 'VALIDATION_ERROR');
    }

    validateTime(s.startTime, `${prefix}.startTime`);
    validateTime(s.endTime,   `${prefix}.endTime`);

    // Forbidden state: startTime='00:00' AND isOvernight=true cannot be represented
    // by normalizeHhmm() — the end<=start heuristic fails in this configuration.
    if (s.startTime === '00:00' && Boolean(s.isOvernight)) {
      throw new AppError(
        400,
        `${prefix}: startTime '00:00' with isOvernight=true is invalid — ` +
        'use isOvernight=false for a midnight-start shift',
        'INVALID_SHIFT_CONFIGURATION'
      );
    }

    // Overnight consistency
    if (Boolean(s.isOvernight)) {
      if (s.endTime >= s.startTime) {
        throw new AppError(
          400,
          `${prefix}: isOvernight=true requires endTime < startTime (got ${s.startTime}→${s.endTime})`,
          'VALIDATION_ERROR'
        );
      }
    } else {
      // Same-day: end strictly after start, OR '00:00' midnight sentinel (start ≠ '00:00')
      const validSameDay =
        s.endTime > s.startTime ||
        (s.endTime === '00:00' && s.startTime !== '00:00');
      if (!validSameDay) {
        throw new AppError(
          400,
          `${prefix}: endTime must be after startTime (got ${s.startTime}→${s.endTime})`,
          'VALIDATION_ERROR'
        );
      }
    }

    const code = s.code.trim();
    if (codes.has(code)) {
      throw new AppError(400, `Duplicate shift code '${code}'`, 'VALIDATION_ERROR');
    }
    codes.add(code);

    return {
      code,
      nameTh:       s.nameTh.trim(),
      nameEn:       s.nameEn?.trim(),
      startTime:    s.startTime,
      endTime:      s.endTime,
      isOvernight:  Boolean(s.isOvernight),
      breakMinutes: s.breakMinutes ?? 0,
    };
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const workSchedulePatternService = {

  findAll(filters: WorkSchedulePatternFilters = {}): WorkSchedulePattern[] {
    return store.findAll((s) => {
      if (filters.forRole  !== undefined && s.forRole  !== filters.forRole)   return false;
      if (filters.isActive !== undefined && s.isActive !== filters.isActive)  return false;
      return true;
    });
  },

  findById(id: string): WorkSchedulePattern {
    const wsp = store.findById(id);
    if (!wsp) throw new AppError(404, `WorkSchedulePattern '${id}' not found`, 'NOT_FOUND');
    return wsp;
  },

  create(dto: CreateWorkSchedulePatternDto): WorkSchedulePattern {
    if (!dto.nameTh?.trim())      throw new AppError(400, 'nameTh is required',              'VALIDATION_ERROR');
    if (!dto.forRole)             throw new AppError(400, 'forRole is required',              'VALIDATION_ERROR');
    if (dto.monthlyWorkingHours == null) {
      throw new AppError(400, 'monthlyWorkingHours is required', 'VALIDATION_ERROR');
    }
    if (typeof dto.monthlyWorkingHours !== 'number' || dto.monthlyWorkingHours <= 0) {
      throw new AppError(400, 'monthlyWorkingHours must be a positive number', 'VALIDATION_ERROR');
    }

    const type: WorkSchedulePatternType = dto.type ?? 'SHIFT_TIME';

    let shifts: WorkSchedulePatternShift[] = [];
    let weeklySchedule: WeeklyScheduleDay[] | undefined;

    if (type === 'WEEKLY_WORKING_TIME') {
      weeklySchedule = validateWeeklySchedule(dto.weeklySchedule ?? []);
    } else {
      shifts = validateShifts(dto.shifts ?? []);
    }

    const duplicate = store.exists(
      (s) =>
        s.forRole === dto.forRole &&
        s.nameTh.toLowerCase() === dto.nameTh.trim().toLowerCase() &&
        s.isActive
    );
    if (duplicate) {
      throw new AppError(
        409,
        `WorkSchedulePattern '${dto.nameTh}' already exists for role '${dto.forRole}'`,
        'DUPLICATE'
      );
    }

    return store.create({
      nameTh:              dto.nameTh.trim(),
      nameEn:              dto.nameEn?.trim(),
      forRole:             dto.forRole,
      type,
      monthlyWorkingHours: dto.monthlyWorkingHours,
      shifts,
      weeklySchedule,
      isActive:            true,
    } as Omit<WorkSchedulePattern, 'id' | 'createdAt' | 'updatedAt'>);
  },

  update(id: string, dto: UpdateWorkSchedulePatternDto): WorkSchedulePattern {
    this.findById(id); // throws 404

    const patch: Partial<Omit<WorkSchedulePattern, 'id' | 'createdAt'>> = {};

    if (dto.nameTh   !== undefined) patch.nameTh   = dto.nameTh.trim();
    if (dto.nameEn   !== undefined) patch.nameEn   = dto.nameEn?.trim();
    if (dto.forRole  !== undefined) patch.forRole  = dto.forRole;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    if (dto.monthlyWorkingHours !== undefined) {
      if (typeof dto.monthlyWorkingHours !== 'number' || dto.monthlyWorkingHours <= 0) {
        throw new AppError(400, 'monthlyWorkingHours must be a positive number', 'VALIDATION_ERROR');
      }
      patch.monthlyWorkingHours = dto.monthlyWorkingHours;
    }

    if (dto.type !== undefined) {
      patch.type = dto.type;
    }

    if (dto.shifts !== undefined) {
      patch.shifts = validateShifts(dto.shifts);
    }

    if (dto.weeklySchedule !== undefined) {
      patch.weeklySchedule = validateWeeklySchedule(dto.weeklySchedule);
    }

    return store.updateById(id, patch) as WorkSchedulePattern;
  },

  remove(id: string): void {
    this.findById(id); // throws 404
    store.softDelete(id);
  },
};

/** @deprecated Use workSchedulePatternService */
export const subRoleService = workSchedulePatternService;
