/**
 * employee.ts
 *
 * Single-import API facade for the Employee Dashboard.
 *
 * Thin wrappers around the domain APIs — keeps the dashboard from importing
 * from three different modules and gives the dashboard a stable contract if
 * the underlying routes ever change.
 */
import { apiFetch } from './client';
import type { AppNotification } from '@hospital-hr/shared';
import type { AttendanceApproval, ApprovalStatus } from './approvals';

// Re-export types so the dashboard only needs one import.
export type { AttendanceApproval, ApprovalStatus };
export type { AppNotification };

// ─── Approvals ────────────────────────────────────────────────────────────────

/**
 * GET /api/attendance-approvals
 * Employee role → own records only (all statuses).
 */
export function getMyApprovals(): Promise<AttendanceApproval[]> {
  return apiFetch<AttendanceApproval[]>('/api/attendance-approvals');
}

// ─── Notifications ────────────────────────────────────────────────────────────

/** GET /api/notifications — own notifications, newest first. */
export function getMyNotifications(): Promise<AppNotification[]> {
  return apiFetch<AppNotification[]>('/api/notifications');
}

/** PATCH /api/notifications/:id/read — mark one notification as read. */
export function markNotificationRead(id: string): Promise<AppNotification> {
  return apiFetch<AppNotification>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

/** GET /api/notifications/unread-count */
export function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/api/notifications/unread-count');
}

/** PATCH /api/notifications/read-all — mark every notification as read. */
export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>('/api/notifications/read-all', { method: 'PATCH' });
}
