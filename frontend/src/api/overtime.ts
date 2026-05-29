import type { OvertimeRequest, OvertimeStatus, AdditionalWorkHourType } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateOvertimeDto {
  date:       string;   // YYYY-MM-DD
  startTime:  string;   // HH:mm
  endTime:    string;   // HH:mm
  reason:     string;
}

export interface UpdateOvertimeStatusDto {
  status:    OvertimeStatus;
  hourType?: AdditionalWorkHourType;
}

export interface OvertimeFilters {
  userId?:       string;
  departmentId?: string;
  status?:       OvertimeStatus;
  from?:         string;   // YYYY-MM-DD
  to?:           string;   // YYYY-MM-DD
}

const BASE = '/api/overtime';

export const overtimeApi = {
  list(f: OvertimeFilters = {}): Promise<OvertimeRequest[]> {
    const p = new URLSearchParams();
    if (f.userId)       p.set('userId',       f.userId);
    if (f.departmentId) p.set('departmentId', f.departmentId);
    if (f.status)       p.set('status',       f.status);
    if (f.from)         p.set('from',         f.from);
    if (f.to)           p.set('to',           f.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<OvertimeRequest[]>(`${BASE}${qs}`);
  },

  my(f: { status?: OvertimeStatus; from?: string; to?: string } = {}): Promise<OvertimeRequest[]> {
    const p = new URLSearchParams();
    if (f.status) p.set('status', f.status);
    if (f.from)   p.set('from',   f.from);
    if (f.to)     p.set('to',     f.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<OvertimeRequest[]>(`${BASE}/my${qs}`);
  },

  create(dto: CreateOvertimeDto): Promise<OvertimeRequest> {
    return apiFetch<OvertimeRequest>(BASE, { method: 'POST', body: JSON.stringify(dto) });
  },

  updateStatus(id: string, dto: UpdateOvertimeStatusDto): Promise<OvertimeRequest> {
    return apiFetch<OvertimeRequest>(`${BASE}/${id}/status`, {
      method: 'PATCH',
      body:   JSON.stringify(dto),
    });
  },

  cancel(id: string): Promise<void> {
    return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' });
  },
};
