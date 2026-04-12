/**
 * attendanceApprovalService.ts
 *
 * Service layer for the approval workflow.
 *
 * Responsibilities:
 *   - Translate processor results into approval records (CREATE path)
 *   - Validate state transitions before delegating to the repository (REVIEW path)
 *   - Keep this layer thin — no business-rule logic lives here
 *
 * Business rules live in:
 *   utils/approvalUtils.ts       (derive ApprovalStatus from settings)
 *   attendanceProcessor.ts       (compute lateMinutes / otMinutes)
 *
 * Persistence lives in:
 *   repositories/attendanceApprovalRepo.ts
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  createApproval,
  updateApprovalStatus,
  getPendingApprovals,
  getApprovalsByEmployee,
  getApprovalsByStatus,
  getAllApprovals,
  getApprovalById,
  hasPendingApproval,
  type AttendanceApprovalRecord,
  type ApprovalStatus,
} from '../repositories/attendanceApprovalRepo';
import { logApprovalDecision } from '../../audit/audit.service';
import {
  notifyManagersApprovalCreated,
  notifyEmployeeApprovalDecision,
} from '../attendanceNotifications';
import {
  emitApprovalCreated,
  emitApprovalUpdated,
} from '../../realtime/realtime.service';

// ─── Types re-exported for callers ────────────────────────────────────────────

export type { AttendanceApprovalRecord };

// ─── Input shapes ─────────────────────────────────────────────────────────────

/**
 * Subset of CheckInResult consumed by this service.
 * Declared here so the service has no hard import of the processor module.
 */
export interface CheckInApprovalInput {
  employeeId:         string;
  isLate:             boolean;
  lateMinutes:        number;
  lateApprovalStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

/**
 * Subset of CheckOutResult consumed by this service.
 */
export interface CheckOutApprovalInput {
  employeeId:        string;
  otMinutes:         number;
  otApprovalStatus:  'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

// ─── CREATE helpers ───────────────────────────────────────────────────────────

/**
 * Persists a LATE approval record when the processor determined PENDING.
 *
 * Idempotency guard: if a PENDING LATE record already exists for this employee,
 * the existing record is returned and no duplicate is inserted.
 *
 * Returns the created (or existing) record, or null when status !== PENDING.
 */
export function createLateApprovalIfNeeded(
  input: CheckInApprovalInput,
): AttendanceApprovalRecord | null {
  if (input.lateApprovalStatus !== 'PENDING') return null;

  // Idempotency: don't create a second PENDING LATE record for the same employee
  if (hasPendingApproval(input.employeeId, 'LATE')) {
    const existing = getPendingApprovals().find(
      (r) => r.employeeId === input.employeeId && r.type === 'LATE',
    );
    return existing ?? null;
  }

  const record = createApproval({
    employeeId: input.employeeId,
    type:       'LATE',
    minutes:    input.lateMinutes,
    status:     'PENDING',
  });
  notifyManagersApprovalCreated(record);
  emitApprovalCreated(record);
  return record;
}

/**
 * Persists an OT approval record when the processor determined PENDING.
 *
 * Idempotency guard: same as above — one PENDING OT record per employee at a time.
 *
 * Returns the created (or existing) record, or null when status !== PENDING.
 */
export function createOtApprovalIfNeeded(
  input: CheckOutApprovalInput,
): AttendanceApprovalRecord | null {
  if (input.otApprovalStatus !== 'PENDING') return null;

  if (hasPendingApproval(input.employeeId, 'OT')) {
    const existing = getPendingApprovals().find(
      (r) => r.employeeId === input.employeeId && r.type === 'OT',
    );
    return existing ?? null;
  }

  const record = createApproval({
    employeeId: input.employeeId,
    type:       'OT',
    minutes:    input.otMinutes,
    status:     'PENDING',
  });
  notifyManagersApprovalCreated(record);
  emitApprovalCreated(record);
  return record;
}

// ─── REVIEW helpers ───────────────────────────────────────────────────────────

/**
 * Approve or reject an approval record.
 *
 * Validation:
 *   - Record must exist        → 404 if not
 *   - Record must be PENDING   → 409 if already reviewed
 *
 * Returns the updated record.
 */
export function reviewApproval(
  id:         string,
  decision:   'APPROVED' | 'REJECTED',
  reviewerId: string,
): AttendanceApprovalRecord {
  const record = getApprovalById(id);

  if (!record) {
    throw new AppError(404, `Approval record '${id}' not found`, 'APPROVAL_NOT_FOUND');
  }

  if (record.status !== 'PENDING') {
    throw new AppError(
      409,
      `Approval '${id}' has already been ${record.status.toLowerCase()}`,
      'APPROVAL_ALREADY_REVIEWED',
    );
  }

  const updated = updateApprovalStatus(id, decision, reviewerId);
  if (!updated) {
    // Should never happen — we just confirmed the record exists
    throw new AppError(500, 'Failed to update approval record', 'APPROVAL_UPDATE_FAILED');
  }

  logApprovalDecision(
    reviewerId,
    id,
    decision,
    record.type,
    record.minutes,
    record.employeeId,
  );

  notifyEmployeeApprovalDecision(updated);
  emitApprovalUpdated(updated);

  return updated;
}

// ─── QUERY helpers ────────────────────────────────────────────────────────────

/** Returns all PENDING approval records, newest first. */
export function listPendingApprovals(): AttendanceApprovalRecord[] {
  return getPendingApprovals();
}

/** Returns all approval records with the given status, newest first. */
export function listApprovalsByStatus(status: ApprovalStatus): AttendanceApprovalRecord[] {
  return getApprovalsByStatus(status);
}

/** Returns every approval record regardless of status, newest first. */
export function listAllApprovals(): AttendanceApprovalRecord[] {
  return getAllApprovals();
}

/** Returns all approval records for a specific employee. */
export function listApprovalsForEmployee(employeeId: string): AttendanceApprovalRecord[] {
  return getApprovalsByEmployee(employeeId);
}
