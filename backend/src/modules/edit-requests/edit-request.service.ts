import type {
  AttendanceRecord,
  Department,
  EditRequest,
  EditRequestStatus,
  UserRole,
} from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import type { UserRecord } from '../employees/employee.service';

// ─── Repositories ─────────────────────────────────────────────────────────────

const editRequestStore: IRepository<EditRequest>       = new JsonRepository<EditRequest>('edit_requests');
const attendanceStore:  IRepository<AttendanceRecord>  = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:    IRepository<UserRecord>        = new JsonRepository<UserRecord>('employees');
const deptStore:        IRepository<Department>        = new JsonRepository<Department>('departments');

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateEditRequestDto {
  attendanceId: string;
  reason:       string;
  checkInTime?:  string;  // ISO datetime — desired new value
  checkOutTime?: string;  // ISO datetime — desired new value
  note?:         string;  // desired new note
}

export interface EditRequestFilters {
  attendanceId?: string;
  status?:       EditRequestStatus;
  from?:         string;  // createdAt >= from (YYYY-MM-DD)
  to?:           string;  // createdAt <= to
}

// ─── Access helpers ───────────────────────────────────────────────────────────

/**
 * Returns the department IDs managed by actorUserId.
 * Used to scope which attendance records a manager may edit.
 */
function getManagedDeptIds(actorUserId: string): Set<string> {
  return new Set(
    deptStore
      .findAll((d) => d.managerId === actorUserId && d.isActive)
      .map((d) => d.id),
  );
}

/**
 * Assert the actor is allowed to submit/view an edit request for the given
 * attendance record.
 *
 * HR / super_admin → always allowed.
 * Manager → must manage the employee's department.
 */
function verifyAccessToAttendance(
  actorUserId: string,
  actorRole:   UserRole,
  attendanceRecord: AttendanceRecord,
): void {
  if (hasPermission(actorRole, 'hr')) return;

  const employee = employeeStore.findById(attendanceRecord.userId);
  if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');

  const deptIds = getManagedDeptIds(actorUserId);
  if (!deptIds.has(employee.departmentId)) {
    throw new AppError(403, 'You do not manage this employee\'s department', 'FORBIDDEN');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const editRequestService = {

  // ── Create ────────────────────────────────────────────────────────────────────

  create(
    dto: CreateEditRequestDto,
    actorUserId: string,
    actorRole: UserRole,
  ): EditRequest {
    if (!dto.attendanceId) throw new AppError(400, 'attendanceId is required', 'VALIDATION_ERROR');
    if (!dto.reason?.trim()) throw new AppError(400, 'reason is required', 'VALIDATION_ERROR');

    // At least one field must be requested
    if (!dto.checkInTime && !dto.checkOutTime && dto.note === undefined) {
      throw new AppError(400, 'At least one field to edit must be provided', 'VALIDATION_ERROR');
    }

    const attendance = attendanceStore.findById(dto.attendanceId);
    if (!attendance) throw new AppError(404, 'Attendance record not found', 'NOT_FOUND');

    verifyAccessToAttendance(actorUserId, actorRole, attendance);

    // Guard: only one pending request per attendance record at a time
    const existingPending = editRequestStore.findOne(
      (r) => r.attendanceId === dto.attendanceId && r.status === 'pending',
    );
    if (existingPending) {
      throw new AppError(
        409,
        'A pending edit request already exists for this attendance record',
        'DUPLICATE_REQUEST',
      );
    }

    // Build originalData / requestedData diff
    const originalData: Partial<AttendanceRecord> = {};
    const requestedData: Partial<AttendanceRecord> = {};

    if (dto.checkInTime !== undefined) {
      originalData.checkInTime  = attendance.checkInTime;
      requestedData.checkInTime = dto.checkInTime;
    }
    if (dto.checkOutTime !== undefined) {
      originalData.checkOutTime  = attendance.checkOutTime;
      requestedData.checkOutTime = dto.checkOutTime;
    }
    if (dto.note !== undefined) {
      originalData.note  = attendance.note;
      requestedData.note = dto.note;
    }

    return editRequestStore.create({
      attendanceId:  dto.attendanceId,
      requestedBy:   actorUserId,
      reason:        dto.reason.trim(),
      originalData,
      requestedData,
      status:        'pending',
    });
  },

  // ── Query ──────────────────────────────────────────────────────────────────────

  list(
    actorUserId: string,
    actorRole:   UserRole,
    filters:     EditRequestFilters = {},
  ): EditRequest[] {
    return editRequestStore.findAll((r) => {
      // Scope: HR sees all; managers see only their own
      if (!hasPermission(actorRole, 'hr') && r.requestedBy !== actorUserId) return false;

      if (filters.attendanceId && r.attendanceId !== filters.attendanceId) return false;
      if (filters.status       && r.status       !== filters.status)       return false;
      if (filters.from && r.createdAt.slice(0, 10) < filters.from)         return false;
      if (filters.to   && r.createdAt.slice(0, 10) > filters.to)           return false;

      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  findById(
    id:          string,
    actorUserId: string,
    actorRole:   UserRole,
  ): EditRequest {
    const r = editRequestStore.findById(id);
    if (!r) throw new AppError(404, 'Edit request not found', 'NOT_FOUND');

    // Managers can only see their own; HR can see all
    if (!hasPermission(actorRole, 'hr') && r.requestedBy !== actorUserId) {
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    }

    return r;
  },

  // ── Approve ───────────────────────────────────────────────────────────────────

  /**
   * HR approves the request.
   * Merges requestedData into the attendance record and links editRequestId.
   */
  approve(id: string, actorUserId: string, actorRole: UserRole): EditRequest {
    if (!hasPermission(actorRole, 'hr')) {
      throw new AppError(403, 'Only HR can approve edit requests', 'FORBIDDEN');
    }

    const request = editRequestStore.findById(id);
    if (!request) throw new AppError(404, 'Edit request not found', 'NOT_FOUND');
    if (request.status !== 'pending') {
      throw new AppError(400, 'Only pending requests can be approved', 'INVALID_STATUS');
    }

    // Apply the diff to the attendance record
    const attendance = attendanceStore.findById(request.attendanceId);
    if (!attendance) throw new AppError(404, 'Attendance record not found', 'NOT_FOUND');

    attendanceStore.updateById(attendance.id, {
      ...request.requestedData,
      editRequestId: id,
    });

    return editRequestStore.updateById(id, {
      status:     'approved',
      approvedBy: actorUserId,
    }) as EditRequest;
  },

  // ── Reject ────────────────────────────────────────────────────────────────────

  /**
   * HR rejects the request.
   * Attendance record remains unchanged.
   */
  reject(
    id:           string,
    rejectReason: string | undefined,
    actorUserId:  string,
    actorRole:    UserRole,
  ): EditRequest {
    if (!hasPermission(actorRole, 'hr')) {
      throw new AppError(403, 'Only HR can reject edit requests', 'FORBIDDEN');
    }

    const request = editRequestStore.findById(id);
    if (!request) throw new AppError(404, 'Edit request not found', 'NOT_FOUND');
    if (request.status !== 'pending') {
      throw new AppError(400, 'Only pending requests can be rejected', 'INVALID_STATUS');
    }

    return editRequestStore.updateById(id, {
      status:       'rejected',
      rejectedBy:   actorUserId,
      rejectReason: rejectReason?.trim(),
    }) as EditRequest;
  },
};
