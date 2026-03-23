import type { ScheduleApproval, ScheduleApprovalStatus, WorkSchedule } from '@hospital-hr/shared';
import { apiFetch } from './client';

export const scheduleApprovalApi = {

  /** Manager submits a department-month for approval / immediate publish. */
  submit(departmentId: string, month: string): Promise<ScheduleApproval> {
    return apiFetch('/api/schedule-approvals', {
      method: 'POST',
      body: JSON.stringify({ departmentId, month }),
    });
  },

  list(filters: { departmentId?: string; status?: ScheduleApprovalStatus; month?: string } = {}): Promise<ScheduleApproval[]> {
    const p = new URLSearchParams();
    if (filters.departmentId) p.set('departmentId', filters.departmentId);
    if (filters.status)       p.set('status',       filters.status);
    if (filters.month)        p.set('month',        filters.month);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch(`/api/schedule-approvals${qs}`);
  },

  pendingCount(): Promise<{ count: number }> {
    return apiFetch('/api/schedule-approvals/pending-count');
  },

  getOne(id: string): Promise<ScheduleApproval> {
    return apiFetch(`/api/schedule-approvals/${id}`);
  },

  /** Get the draft schedule weeks for an approval (HR preview). */
  preview(id: string): Promise<WorkSchedule[]> {
    return apiFetch(`/api/schedule-approvals/${id}/preview`);
  },

  approve(id: string): Promise<ScheduleApproval> {
    return apiFetch(`/api/schedule-approvals/${id}/approve`, { method: 'POST' });
  },

  reject(id: string, rejectReason: string): Promise<ScheduleApproval> {
    return apiFetch(`/api/schedule-approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectReason }),
    });
  },
};
