import { apiFetch } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaveType         = 'SICK' | 'VACATION' | 'PERSONAL' | 'OTHER';
export type LeaveDurationType = 'FULL_DAY' | 'HALF_DAY';
export type LeaveStatus       = 'pending' | 'manager_approved' | 'hr_approved' | 'rejected';

export interface LeaveRequest {
  id:                 string;
  userId:             string;
  leaveType:          LeaveType;
  startDate:          string;    // YYYY-MM-DD
  endDate:            string;    // YYYY-MM-DD
  durationType:       LeaveDurationType;
  reason:             string;
  status:             LeaveStatus;
  approvedByManager?: string;
  approvedByHR?:      string;
  rejectedBy?:        string;
  rejectedReason?:    string;
  createdAt:          string;
  updatedAt:          string;
}

export interface CreateLeaveDto {
  leaveType:    LeaveType;
  startDate:    string;
  endDate:      string;
  durationType: LeaveDurationType;
  reason:       string;
}

export interface LeaveFilters {
  userId?:    string;
  status?:    LeaveStatus;
  leaveType?: LeaveType;
  from?:      string;
  to?:        string;
  branchId?:  string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const leaveApi = {
  list(filters: LeaveFilters = {}): Promise<LeaveRequest[]> {
    const params = new URLSearchParams();
    if (filters.userId)    params.set('userId',    filters.userId);
    if (filters.status)    params.set('status',    filters.status);
    if (filters.leaveType) params.set('leaveType', filters.leaveType);
    if (filters.from)      params.set('from',      filters.from);
    if (filters.to)        params.set('to',        filters.to);
    if (filters.branchId)  params.set('branchId',  filters.branchId);
    const qs = params.size ? `?${params}` : '';
    return apiFetch<LeaveRequest[]>(`/api/leave${qs}`);
  },

  create(dto: CreateLeaveDto): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>('/api/leave', {
      method: 'POST',
      body:   JSON.stringify(dto),
    });
  },

  approveByManager(id: string): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>(`/api/leave/${id}/approve-manager`, { method: 'PATCH' });
  },

  approveByHR(id: string): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>(`/api/leave/${id}/approve-hr`, { method: 'PATCH' });
  },

  reject(id: string, reason?: string): Promise<LeaveRequest> {
    return apiFetch<LeaveRequest>(`/api/leave/${id}/reject`, {
      method: 'PATCH',
      body:   JSON.stringify({ reason }),
    });
  },
};
