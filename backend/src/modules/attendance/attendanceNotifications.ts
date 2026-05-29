/**
 * attendanceNotifications.ts
 *
 * Domain-specific notification triggers for the attendance approval workflow.
 *
 * Every function here is FIRE-AND-FORGET:
 *   - Errors are caught and silently discarded.
 *   - The caller's main flow is never blocked or interrupted.
 *
 * When to add a new function:
 *   Every time a meaningful approval event occurs that a user should know about,
 *   add a function here and call it from attendanceApprovalService.ts.
 *
 * Future expansion (EMAIL / LINE / Push):
 *   Add additional delivery calls inside each function without touching callers.
 */
import { notificationService } from '../notifications/notification.service';
import { JsonRepository }      from '../../shared/repository/JsonRepository';
import type { UserRecord }     from '../employees/employee.service';
import type { AttendanceApprovalRecord } from './repositories/attendanceApprovalRepo';

// ─── Employee store (read-only usage) ────────────────────────────────────────

const employeeStore = new JsonRepository<UserRecord>('employees');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the display name (Thai) for an employee, falling back to their id. */
function getEmployeeName(employeeId: string): string {
  const emp = employeeStore.findById(employeeId);
  if (!emp) return employeeId;
  return `${emp.firstNameTh} ${emp.lastNameTh}`.trim() || employeeId;
}

/** Returns the ids of all active managers and HR users. */
function getManagerIds(): string[] {
  return employeeStore
    .findAll((u) =>
      (u.role === 'manager' || u.role === 'admin' || u.role === 'hr_branch') && u.isActive !== false,
    )
    .map((u) => u.id);
}

const TYPE_LABEL: Record<AttendanceApprovalRecord['type'], string> = {
  LATE: 'มาสาย',
  OT:   'ล่วงเวลา',
};

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Notify all managers and HR that a new approval request needs review.
 * Called immediately after a PENDING approval record is created.
 *
 * One notification is created per manager — the `relatedId` links back to the
 * approval record so a future UI can deep-link directly to the request.
 */
export function notifyManagersApprovalCreated(
  record: AttendanceApprovalRecord,
): void {
  try {
    const typeLabel  = TYPE_LABEL[record.type];
    const name       = getEmployeeName(record.employeeId);
    const title      = 'มีคำขออนุมัติใหม่';
    const body       = `${name} ขออนุมัติ${typeLabel} ${record.minutes} นาที`;
    const managerIds = getManagerIds();

    for (const managerId of managerIds) {
      notificationService.create(managerId, 'APPROVAL_REQUEST', title, body, record.id);
    }
  } catch {
    // Never propagate — notification failure must not break the approval flow.
  }
}

/**
 * Notify the employee that their approval request has been reviewed.
 * Called immediately after a PENDING record transitions to APPROVED or REJECTED.
 */
export function notifyEmployeeApprovalDecision(
  record: AttendanceApprovalRecord,
): void {
  try {
    const typeLabel = TYPE_LABEL[record.type];
    const approved  = record.status === 'APPROVED';

    const title = approved
      ? `คำขอ${typeLabel}ได้รับการอนุมัติ`
      : `คำขอ${typeLabel}ถูกปฏิเสธ`;

    const body = approved
      ? `คำขออนุมัติ${typeLabel} ${record.minutes} นาทีของคุณได้รับการอนุมัติแล้ว`
      : `คำขออนุมัติ${typeLabel} ${record.minutes} นาทีของคุณถูกปฏิเสธ`;

    notificationService.create(
      record.employeeId,
      'APPROVAL_RESULT',
      title,
      body,
      record.id,
    );
  } catch {
    // Never propagate — notification failure must not break the approval flow.
  }
}
