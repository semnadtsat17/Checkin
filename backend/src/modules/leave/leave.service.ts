/**
 * leave.service.ts
 *
 * Pure domain service for leave requests.
 * Owns the entire leave lifecycle: create → manager approval → HR approval.
 *
 * ─── DEPENDENCY FIREWALL ───────────────────────────────────────────────────
 * DO NOT import:
 *   ✗  attendance engines       (leave is a parallel domain)
 *   ✗  attendance.service       (leave never writes attendance records)
 *   ✗  schedule.service         (leave has no schedule dependency)
 *   ✗  extra-work.service
 *
 * Future integration into attendance is ONLY via leaveAttendance.adapter.ts.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Approval workflow (mirrors org-settings + edit-request patterns):
 *
 *   Employee creates → status: pending
 *   Manager approves → status: manager_approved
 *   HR approves      → status: hr_approved   (employee is definitively on leave)
 *   Either rejects   → status: rejected
 *
 * TODO (Phase 2 of leave integration):
 *   When org-settings.requireManagerApproval === false, allow employees to
 *   skip directly from pending → hr_approved.  Import orgSettings.runtime
 *   here ONLY for that check — not for any engine selection.
 */
import type { UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import type { UserRecord } from '../employees/employee.service';
import {
  type LeaveRequest,
  type LeaveFilters,
  type CreateLeaveRequestDto,
  type RejectLeaveDto,
} from './leave.types';
import { appendLeaveAudit } from './leave.audit';
import {
  leaveEvents,
  LEAVE_CREATED,
  LEAVE_APPROVED,
  LEAVE_REJECTED,
} from './leave.events';

// ─── Repositories ─────────────────────────────────────────────────────────────

const leaveStore:    IRepository<LeaveRequest> = new JsonRepository<LeaveRequest>('leave_requests');
const employeeStore: IRepository<UserRecord>   = new JsonRepository<UserRecord>('employees');

// ─── Validation helpers ───────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_LEAVE_TYPES    = ['SICK', 'VACATION', 'PERSONAL', 'OTHER'] as const;
const VALID_DURATION_TYPES = ['FULL_DAY', 'HALF_DAY'] as const;

function assertDate(v: string, field: string): void {
  if (!DATE_RE.test(v) || isNaN(Date.parse(v))) {
    throw new AppError(400, `${field} must be a valid YYYY-MM-DD date`, 'VALIDATION_ERROR');
  }
}

/**
 * Returns true when `date` falls within [startDate, endDate] (both inclusive).
 */
function dateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * Verify the actor is allowed to see/touch leave requests for targetUserId.
 *
 * HR / super_admin → unrestricted.
 * Manager → must manage the employee's department.
 * Employee → own records only.
 */
function verifyLeaveAccess(
  actorUserId: string,
  actorRole:   UserRole,
  targetUserId: string,
): void {
  if (hasPermission(actorRole, 'hr')) return;
  if (actorUserId === targetUserId)   return;

  if (hasPermission(actorRole, 'manager')) {
    const target = employeeStore.findById(targetUserId);
    if (!target) throw new AppError(404, 'Employee not found', 'NOT_FOUND');

    const actor   = employeeStore.findById(actorUserId);
    const managed = new Set<string>(actor?.managerDepartments ?? []);
    if (!managed.has(target.departmentId)) {
      throw new AppError(403, 'You do not manage this employee\'s department', 'FORBIDDEN');
    }
    return;
  }

  throw new AppError(403, 'Access denied', 'FORBIDDEN');
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const leaveService = {

  // ── Create ───────────────────────────────────────────────────────────────────

  /**
   * Submit a new leave request.
   * Any authenticated user can create a request for themselves.
   * Managers / HR can create on behalf of others (actorUserId ≠ targetUserId).
   *
   * @param dto          Validated leave data from the controller.
   * @param targetUserId Employee the leave is for (usually the actor themselves).
   * @param actorUserId  Who is submitting the request.
   * @param actorRole    The actor's role — used for cross-user validation.
   */
  createLeaveRequest(
    dto:          CreateLeaveRequestDto,
    targetUserId: string,
    actorUserId:  string,
    actorRole:    UserRole,
  ): LeaveRequest {
    // Cross-user create requires manager-or-above permission
    if (targetUserId !== actorUserId) {
      verifyLeaveAccess(actorUserId, actorRole, targetUserId);
    }

    // Validate leave type and duration
    if (!VALID_LEAVE_TYPES.includes(dto.leaveType)) {
      throw new AppError(400, 'Invalid leaveType', 'VALIDATION_ERROR');
    }
    if (!VALID_DURATION_TYPES.includes(dto.durationType)) {
      throw new AppError(400, 'Invalid durationType', 'VALIDATION_ERROR');
    }

    // Validate dates
    assertDate(dto.startDate, 'startDate');
    assertDate(dto.endDate,   'endDate');
    if (dto.endDate < dto.startDate) {
      throw new AppError(400, 'endDate must not be before startDate', 'INVALID_DATE_RANGE');
    }

    // Require a non-empty reason
    if (!dto.reason?.trim()) {
      throw new AppError(400, 'reason is required', 'VALIDATION_ERROR');
    }

    // Duplicate guard: reject if an hr_approved or pending/manager_approved leave
    // already covers any day in the requested range for this employee.
    const conflicts = leaveStore.findAll((r) =>
      r.userId === targetUserId &&
      r.status !== 'rejected'   &&
      r.startDate <= dto.endDate &&
      r.endDate   >= dto.startDate,
    );
    if (conflicts.length > 0) {
      throw new AppError(
        409,
        'A leave request already exists for an overlapping date range',
        'LEAVE_DATE_CONFLICT',
      );
    }

    const leave = leaveStore.create({
      userId:       targetUserId,
      leaveType:    dto.leaveType,
      startDate:    dto.startDate,
      endDate:      dto.endDate,
      durationType: dto.durationType,
      reason:       dto.reason.trim(),
      status:       'pending',
    } as Omit<LeaveRequest, 'id' | 'createdAt' | 'updatedAt'>);

    appendLeaveAudit(leave.id, 'CREATED', actorUserId, null, 'pending');
    leaveEvents.emit(LEAVE_CREATED, { leaveRequest: leave });

    return leave;
  },

  // ── Manager approval ──────────────────────────────────────────────────────────

  /**
   * Manager (or HR) approves a pending leave request.
   * Status transition: pending → manager_approved.
   */
  approveByManager(
    id:          string,
    actorUserId: string,
    actorRole:   UserRole,
  ): LeaveRequest {
    const leave = leaveService.findById(id);
    verifyLeaveAccess(actorUserId, actorRole, leave.userId);

    if (leave.status !== 'pending') {
      throw new AppError(
        400,
        `Cannot manager-approve a leave with status '${leave.status}'`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const updated = leaveStore.updateById(id, {
      status:           'manager_approved',
      approvedByManager: actorUserId,
    }) as LeaveRequest;

    appendLeaveAudit(id, 'APPROVED_BY_MANAGER', actorUserId, 'pending', 'manager_approved');
    leaveEvents.emit(LEAVE_APPROVED, {
      leaveRequest: updated,
      approvedBy:   actorUserId,
      stage:        'manager',
    });

    return updated;
  },

  // ── HR approval (final) ───────────────────────────────────────────────────────

  /**
   * HR gives the final approval.
   * Status transition: pending | manager_approved → hr_approved.
   *
   * HR may approve directly (skipping manager step) when the request is still
   * in 'pending' — this is intentional for departments without managers or
   * when requireManagerApproval is false.
   */
  approveByHR(
    id:          string,
    actorUserId: string,
    actorRole:   UserRole,
  ): LeaveRequest {
    if (!hasPermission(actorRole, 'hr')) {
      throw new AppError(403, 'Only HR or super_admin can give final approval', 'FORBIDDEN');
    }

    const leave = leaveService.findById(id);

    if (leave.status !== 'pending' && leave.status !== 'manager_approved') {
      throw new AppError(
        400,
        `Cannot HR-approve a leave with status '${leave.status}'`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const previousStatus = leave.status;
    const updated = leaveStore.updateById(id, {
      status:      'hr_approved',
      approvedByHR: actorUserId,
    }) as LeaveRequest;

    appendLeaveAudit(id, 'APPROVED_BY_HR', actorUserId, previousStatus, 'hr_approved');
    leaveEvents.emit(LEAVE_APPROVED, {
      leaveRequest: updated,
      approvedBy:   actorUserId,
      stage:        'hr',
    });

    return updated;
  },

  // ── Rejection ────────────────────────────────────────────────────────────────

  /**
   * Reject a leave request at any non-terminal stage.
   *
   * Manager → may reject from 'pending'.
   * HR      → may reject from 'pending' or 'manager_approved'.
   */
  rejectLeave(
    id:          string,
    actorUserId: string,
    actorRole:   UserRole,
    dto:         RejectLeaveDto = {},
  ): LeaveRequest {
    const leave = leaveService.findById(id);
    verifyLeaveAccess(actorUserId, actorRole, leave.userId);

    if (leave.status === 'hr_approved' || leave.status === 'rejected') {
      throw new AppError(
        400,
        `Cannot reject a leave with status '${leave.status}'`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    // Manager may only reject from 'pending'; HR may reject from either pre-terminal stage.
    if (!hasPermission(actorRole, 'hr') && leave.status !== 'pending') {
      throw new AppError(
        403,
        'Managers can only reject pending requests; HR approval is required first',
        'FORBIDDEN',
      );
    }

    const previousStatus = leave.status;
    const updated = leaveStore.updateById(id, {
      status:         'rejected',
      rejectedBy:     actorUserId,
      rejectedReason: dto.reason?.trim() || undefined,
    }) as LeaveRequest;

    appendLeaveAudit(id, 'REJECTED', actorUserId, previousStatus, 'rejected', dto.reason);
    leaveEvents.emit(LEAVE_REJECTED, {
      leaveRequest: updated,
      rejectedBy:   actorUserId,
      reason:       dto.reason,
    });

    return updated;
  },

  // ── Queries ───────────────────────────────────────────────────────────────────

  findById(id: string): LeaveRequest {
    const leave = leaveStore.findById(id);
    if (!leave) throw new AppError(404, 'Leave request not found', 'NOT_FOUND');
    return leave;
  },

  /**
   * Retrieve leave requests for a specific employee.
   * Scoped by the actor's role — employees can only see their own records.
   */
  getUserLeaves(
    targetUserId: string,
    actorUserId:  string,
    actorRole:    UserRole,
    filters:      Pick<LeaveFilters, 'status' | 'leaveType' | 'from' | 'to'> = {},
  ): LeaveRequest[] {
    verifyLeaveAccess(actorUserId, actorRole, targetUserId);

    return leaveStore.findAll((r) => {
      if (r.userId !== targetUserId)                      return false;
      if (filters.status    && r.status    !== filters.status)    return false;
      if (filters.leaveType && r.leaveType !== filters.leaveType) return false;
      if (filters.from      && r.endDate    < filters.from)       return false;
      if (filters.to        && r.startDate  > filters.to)         return false;
      return true;
    }).sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  /**
   * List leave requests across employees within a date range.
   * HR/super_admin → all employees.
   * Manager        → scoped to their managed departments.
   */
  getLeavesByDateRange(
    from:        string,
    to:          string,
    actorUserId: string,
    actorRole:   UserRole,
    filters:     Pick<LeaveFilters, 'userId' | 'status' | 'leaveType'> = {},
  ): LeaveRequest[] {
    assertDate(from, 'from');
    assertDate(to,   'to');
    if (to < from) throw new AppError(400, 'to must not be before from', 'INVALID_DATE_RANGE');

    // Build the set of visible userIds for managers
    let visibleUserIds: Set<string> | null = null;
    if (!hasPermission(actorRole, 'hr')) {
      const actor   = employeeStore.findById(actorUserId);
      const managed = new Set<string>(actor?.managerDepartments ?? []);
      const employees = employeeStore.findAll(
        (u) => managed.has(u.departmentId) && u.isActive,
      );
      visibleUserIds = new Set(employees.map((e) => e.id));
    }

    return leaveStore.findAll((r) => {
      if (visibleUserIds && !visibleUserIds.has(r.userId)) return false;
      // Overlap: leave covers any day within [from, to]
      if (r.endDate < from || r.startDate > to) return false;
      if (filters.userId    && r.userId    !== filters.userId)    return false;
      if (filters.status    && r.status    !== filters.status)    return false;
      if (filters.leaveType && r.leaveType !== filters.leaveType) return false;
      return true;
    }).sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
};

// ─── Internal helper — exported for adapter use only ─────────────────────────

/**
 * Find any HR-approved leave covering a specific date for a user.
 * Intentionally narrow: exported ONLY for leaveAttendance.adapter.ts.
 * Do NOT import this directly from outside the leave module.
 */
export function findApprovedLeaveForDate(
  userId: string,
  date:   string,
): LeaveRequest | null {
  return leaveStore.findOne(
    (r) =>
      r.userId === userId &&
      r.status === 'hr_approved' &&
      dateInRange(date, r.startDate, r.endDate),
  );
}
