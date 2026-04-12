/**
 * leave.types.ts
 *
 * All types for the leave domain.  This file has ZERO runtime code — pure
 * TypeScript interfaces and type aliases only.
 *
 * ─── DEPENDENCY FIREWALL ───────────────────────────────────────────────────
 * DO NOT import:
 *   ✗  attendance engines
 *   ✗  schedule service
 *   ✗  extra-work service
 *
 * Allowed imports: none (this file is the root of the leave type graph)
 * ──────────────────────────────────────────────────────────────────────────
 */

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type LeaveType        = 'SICK' | 'VACATION' | 'PERSONAL' | 'OTHER';
export type LeaveDurationType = 'FULL_DAY' | 'HALF_DAY';

/**
 * Leave request status lifecycle:
 *
 *   pending
 *     ├─ manager_approved   (manager acts first; HR approves second)
 *     │     └─ hr_approved  (final — employee is definitively on leave)
 *     └─ rejected           (by manager OR HR at any stage)
 *
 * Note: when org-settings.requireManagerApproval === false, the pending →
 * hr_approved transition will be allowed directly.  That shortcut is NOT
 * implemented here yet — a TODO comment marks the integration point.
 */
export type LeaveStatus =
  | 'pending'
  | 'manager_approved'
  | 'hr_approved'
  | 'rejected';

// ─── Core entity ──────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id:                string;
  userId:            string;
  leaveType:         LeaveType;
  startDate:         string;   // YYYY-MM-DD (inclusive)
  endDate:           string;   // YYYY-MM-DD (inclusive)
  durationType:      LeaveDurationType;
  reason:            string;
  status:            LeaveStatus;
  approvedByManager?: string;  // userId of approving manager
  approvedByHR?:      string;  // userId of approving HR
  rejectedBy?:        string;  // userId who rejected
  rejectedReason?:    string;
  createdAt:         string;
  updatedAt:         string;
}

// ─── Audit trail ──────────────────────────────────────────────────────────────

export type LeaveAuditAction =
  | 'CREATED'
  | 'APPROVED_BY_MANAGER'
  | 'APPROVED_BY_HR'
  | 'REJECTED';

export interface LeaveAuditRecord {
  id:              string;
  leaveRequestId:  string;
  action:          LeaveAuditAction;
  actorUserId:     string;
  previousStatus:  LeaveStatus | null;
  newStatus:       LeaveStatus;
  note?:           string;
  timestamp:       string;
  createdAt:       string;
  updatedAt:       string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateLeaveRequestDto {
  leaveType:     LeaveType;
  startDate:     string;          // YYYY-MM-DD
  endDate:       string;          // YYYY-MM-DD
  durationType:  LeaveDurationType;
  reason:        string;
}

export interface RejectLeaveDto {
  reason?: string;
}

export interface LeaveFilters {
  userId?:    string;
  status?:    LeaveStatus;
  leaveType?: LeaveType;
  from?:      string;             // startDate >= from
  to?:        string;             // endDate   <= to
}
