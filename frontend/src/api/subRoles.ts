import type { WorkSchedulePattern, WorkSchedulePatternShift, WorkSchedulePatternType, UserRole } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface ShiftDto {
  code:         string;
  nameTh:       string;
  nameEn?:      string;
  startTime:    string;  // HH:mm
  endTime:      string;  // HH:mm
  isOvernight:  boolean;
  breakMinutes: number;
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
  type?:                WorkSchedulePatternType;
  monthlyWorkingHours:  number;
  shifts?:              ShiftDto[];
  weeklySchedule?:      WeeklyScheduleDayDto[];
}

export interface UpdateWorkSchedulePatternDto {
  nameTh?:              string;
  nameEn?:              string;
  forRole?:             UserRole;
  type?:                WorkSchedulePatternType;
  monthlyWorkingHours?: number;
  shifts?:              ShiftDto[];
  weeklySchedule?:      WeeklyScheduleDayDto[];
  isActive?:            boolean;
}

export interface WorkSchedulePatternFilters {
  forRole?:  UserRole;
  isActive?: boolean;
}

export type { WorkSchedulePatternShift };

// Deprecated aliases
/** @deprecated Use CreateWorkSchedulePatternDto */
export type CreateSubRoleDto = CreateWorkSchedulePatternDto;
/** @deprecated Use UpdateWorkSchedulePatternDto */
export type UpdateSubRoleDto = UpdateWorkSchedulePatternDto;
/** @deprecated Use WorkSchedulePatternFilters */
export type SubRoleFilters = WorkSchedulePatternFilters;

export const workSchedulePatternApi = {
  list(f: WorkSchedulePatternFilters = {}) {
    const p = new URLSearchParams();
    if (f.forRole)                p.set('forRole',  f.forRole);
    if (f.isActive !== undefined) p.set('isActive', String(f.isActive));
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<WorkSchedulePattern[]>(`/api/work-schedule-patterns${qs}`);
  },

  create(dto: CreateWorkSchedulePatternDto) {
    return apiFetch<WorkSchedulePattern>('/api/work-schedule-patterns', { method: 'POST', body: JSON.stringify(dto) });
  },

  update(id: string, dto: UpdateWorkSchedulePatternDto) {
    return apiFetch<WorkSchedulePattern>(`/api/work-schedule-patterns/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
  },

  remove(id: string) {
    return apiFetch<void>(`/api/work-schedule-patterns/${id}`, { method: 'DELETE' });
  },
};

/** @deprecated Use workSchedulePatternApi */
export const subRoleApi = workSchedulePatternApi;
