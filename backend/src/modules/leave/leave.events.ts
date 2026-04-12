/**
 * leave.events.ts
 *
 * In-process EventEmitter for the leave domain.
 * Follows the same pattern as orgSettingsEvents in org-settings.router.ts.
 *
 * Events are emitted by leave.service.ts AFTER successful writes so that
 * the JSON store is always the source of truth before subscribers act.
 *
 * Subscribers (future work — do NOT add here):
 *   • Notification service — send push/email when leave is approved/rejected
 *   • Analytics pipeline   — aggregate leave data for payroll export
 *   • Attendance integrator — auto-mark on_leave status when leave is approved
 *
 * Nothing subscribes yet.  Emitting now costs zero and avoids a future
 * service-layer rewrite.
 */
import { EventEmitter } from 'events';
import type { LeaveRequest } from './leave.types';

// ─── Event bus ────────────────────────────────────────────────────────────────

export const leaveEvents = new EventEmitter();

// ─── Event name constants ─────────────────────────────────────────────────────

export const LEAVE_CREATED  = 'LEAVE_CREATED';
export const LEAVE_APPROVED = 'LEAVE_APPROVED';
export const LEAVE_REJECTED = 'LEAVE_REJECTED';

// ─── Typed payload interfaces ─────────────────────────────────────────────────

export interface LeaveCreatedPayload {
  leaveRequest: LeaveRequest;
}

export interface LeaveApprovedPayload {
  leaveRequest: LeaveRequest;
  approvedBy:   string;
  stage:        'manager' | 'hr';    // which approval step was completed
}

export interface LeaveRejectedPayload {
  leaveRequest: LeaveRequest;
  rejectedBy:   string;
  reason?:      string;
}
