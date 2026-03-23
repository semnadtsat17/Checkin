import type { EditRequest } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface EditRequestFilters {
  status?:      'pending' | 'approved' | 'rejected';
  attendanceId?: string;
  from?:        string;
  to?:          string;
}

export const editRequestApi = {
  list(filters: EditRequestFilters = {}) {
    const p = new URLSearchParams();
    if (filters.status)       p.set('status',       filters.status);
    if (filters.attendanceId) p.set('attendanceId', filters.attendanceId);
    if (filters.from)         p.set('from',         filters.from);
    if (filters.to)           p.set('to',           filters.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<EditRequest[]>(`/api/edit-requests${qs}`);
  },

  getOne(id: string) {
    return apiFetch<EditRequest>(`/api/edit-requests/${id}`);
  },

  approve(id: string) {
    return apiFetch<EditRequest>(`/api/edit-requests/${id}/approve`, { method: 'PATCH' });
  },

  reject(id: string, rejectReason?: string) {
    return apiFetch<EditRequest>(`/api/edit-requests/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ rejectReason }),
    });
  },
};
