/**
 * approvals.ts
 *
 * API layer for the attendance approval workflow.
 * Endpoints: GET / PATCH /api/attendance-approvals
 */
import { apiFetch } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalType   = 'LATE' | 'OT';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AttendanceApproval {
  id:          string;
  employeeId:  string;
  type:        ApprovalType;
  minutes:     number;
  status:      ApprovalStatus;
  createdAt:   string;
  reviewedAt?: string;
  reviewerId?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance-approvals[?status=PENDING|APPROVED|REJECTED|ALL]
 * Manager role → records filtered by status (default: PENDING).
 * Employee role → own records only (status param is ignored server-side).
 */
export function getApprovals(status?: ApprovalStatus | 'ALL'): Promise<AttendanceApproval[]> {
  const qs = status ? `?status=${status}` : '';
  return apiFetch<AttendanceApproval[]>(`/api/attendance-approvals${qs}`);
}

/**
 * PATCH /api/attendance-approvals/:id
 * Approve or reject a pending approval record.
 */
export function updateApprovalStatus(
  id:     string,
  status: 'APPROVED' | 'REJECTED',
): Promise<AttendanceApproval> {
  return apiFetch<AttendanceApproval>(`/api/attendance-approvals/${id}`, {
    method: 'PATCH',
    body:   JSON.stringify({ status }),
  });
}
