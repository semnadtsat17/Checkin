import type { ExtraWork, ExtraWorkReason } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateExtraWorkDto {
  employeeId:    string;
  departmentId:  string;
  date:          string;
  startTime:     string;
  endTime:       string;
  endNextDay?:   boolean;  // true when user selected "24:00" — tells backend endTime="00:00" is next-day midnight
  reason:        ExtraWorkReason;
  customReason?: string;
}

export interface UpdateExtraWorkDto {
  date?:         string;
  startTime?:    string;
  endTime?:      string;
  endNextDay?:   boolean;  // mirrors CreateExtraWorkDto.endNextDay
  reason?:       ExtraWorkReason;
  customReason?: string;
}

export interface ExtraWorkFilters {
  employeeId?:   string;
  departmentId?: string;
  date?:         string;
  from?:         string;
  to?:           string;
}

export const extraWorkApi = {
  list(filters: ExtraWorkFilters = {}): Promise<ExtraWork[]> {
    const q = new URLSearchParams();
    if (filters.employeeId)   q.set('employeeId',   filters.employeeId);
    if (filters.departmentId) q.set('departmentId', filters.departmentId);
    if (filters.date)         q.set('date',         filters.date);
    if (filters.from)         q.set('from',         filters.from);
    if (filters.to)           q.set('to',           filters.to);
    const qs = q.toString();
    return apiFetch<ExtraWork[]>(`/api/extra-work${qs ? `?${qs}` : ''}`);
  },

  my(filters: { date?: string; from?: string; to?: string } = {}): Promise<ExtraWork[]> {
    const q = new URLSearchParams();
    if (filters.date) q.set('date', filters.date);
    if (filters.from) q.set('from', filters.from);
    if (filters.to)   q.set('to',   filters.to);
    const qs = q.toString();
    return apiFetch<ExtraWork[]>(`/api/extra-work/my${qs ? `?${qs}` : ''}`);
  },

  getOne(id: string): Promise<ExtraWork> {
    return apiFetch<ExtraWork>(`/api/extra-work/${id}`);
  },

  create(dto: CreateExtraWorkDto): Promise<ExtraWork> {
    return apiFetch<ExtraWork>('/api/extra-work', { method: 'POST', body: JSON.stringify(dto) });
  },

  update(id: string, dto: UpdateExtraWorkDto): Promise<ExtraWork> {
    return apiFetch<ExtraWork>(`/api/extra-work/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  },

  remove(id: string): Promise<void> {
    return apiFetch<void>(`/api/extra-work/${id}`, { method: 'DELETE' });
  },
};
