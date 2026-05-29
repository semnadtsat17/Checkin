import type { OvertimeRequest, OvertimeStatus, AdditionalWorkHourType, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import { assertNotSimpleMode } from '../attendance/guards/simpleMode.guard';
import type { UserRecord } from '../employees/employee.service';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateOvertimeDto {
  date:       string;   // YYYY-MM-DD
  startTime:  string;   // HH:mm
  endTime:    string;   // HH:mm
  reason:     string;
}

export interface UpdateOvertimeStatusDto {
  status:    OvertimeStatus;
  hourType?: AdditionalWorkHourType;
}

export interface OvertimeFilters {
  userId?:       string;
  departmentId?: string;
  branchId?:     string;
  status?:       OvertimeStatus;
  from?:         string;   // YYYY-MM-DD
  to?:           string;   // YYYY-MM-DD
}

// ─── Repositories ─────────────────────────────────────────────────────────────

const store:         IRepository<OvertimeRequest> = new JsonRepository<OvertimeRequest>('overtime_requests');
const employeeStore: IRepository<UserRecord>       = new JsonRepository<UserRecord>('employees');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function assertDate(v: string, field: string): void {
  if (!DATE_RE.test(v) || isNaN(Date.parse(v))) {
    throw new AppError(400, `${field} must be a valid YYYY-MM-DD date`, 'VALIDATION_ERROR');
  }
}

function assertTime(v: string, field: string): void {
  if (!TIME_RE.test(v)) throw new AppError(400, `${field} must be HH:mm`, 'VALIDATION_ERROR');
  const [h, m] = v.split(':').map(Number);
  if (h > 23 || m > 59) throw new AppError(400, `${field} is invalid`, 'VALIDATION_ERROR');
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // overnight
  return diff;
}

function matchesFilters(r: OvertimeRequest, f: OvertimeFilters): boolean {
  if (f.userId       && r.userId       !== f.userId)       return false;
  if (f.departmentId && r.departmentId !== f.departmentId) return false;
  if (f.branchId     && r.branchId     !== f.branchId)     return false;
  if (f.status       && r.status       !== f.status)       return false;
  if (f.from         && r.date         <  f.from)          return false;
  if (f.to           && r.date         >  f.to)            return false;
  return true;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const overtimeService = {

  list(filters: OvertimeFilters = {}): OvertimeRequest[] {
    return store.findAll(r => matchesFilters(r, filters))
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  my(userId: string, filters: Omit<OvertimeFilters, 'userId'> = {}): OvertimeRequest[] {
    return this.list({ ...filters, userId });
  },

  findById(id: string): OvertimeRequest {
    const record = store.findById(id);
    if (!record) throw new AppError(404, `OvertimeRequest '${id}' not found`, 'NOT_FOUND');
    return record;
  },

  create(dto: CreateOvertimeDto, userId: string, branchId: string): OvertimeRequest {
    assertNotSimpleMode('overtime requests', branchId);

    assertDate(dto.date, 'date');
    assertTime(dto.startTime, 'startTime');
    assertTime(dto.endTime,   'endTime');
    if (!dto.reason?.trim()) throw new AppError(400, 'reason is required', 'VALIDATION_ERROR');

    const employee = employeeStore.findById(userId);
    if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');

    const durationMinutes = minutesBetween(dto.startTime, dto.endTime);
    if (durationMinutes < 30) {
      throw new AppError(400, 'Overtime duration must be at least 30 minutes', 'VALIDATION_ERROR');
    }

    return store.create({
      userId,
      branchId,
      departmentId:    employee.departmentId,
      date:            dto.date,
      startTime:       dto.startTime,
      endTime:         dto.endTime,
      durationMinutes,
      reason:          dto.reason.trim(),
      hourType:        'ot',
      status:          'pending',
    } as Omit<OvertimeRequest, 'id' | 'createdAt' | 'updatedAt'>);
  },

  updateStatus(
    id: string,
    dto: UpdateOvertimeStatusDto,
    actorId: string,
    actorRole: UserRole,
  ): OvertimeRequest {
    if (!hasPermission(actorRole, 'manager')) {
      throw new AppError(403, 'Only managers and above can approve overtime requests', 'FORBIDDEN');
    }

    const record = this.findById(id);
    if (record.status !== 'pending') {
      throw new AppError(409, 'Only pending requests can be updated', 'CONFLICT');
    }

    const patch: Partial<OvertimeRequest> = { status: dto.status };
    if (dto.status === 'approved') {
      patch.approvedBy = actorId;
      if (dto.hourType) patch.hourType = dto.hourType;
    }

    return store.updateById(id, patch)!;
  },

  cancel(id: string, userId: string): void {
    const record = this.findById(id);
    if (record.userId !== userId) {
      throw new AppError(403, 'You can only cancel your own requests', 'FORBIDDEN');
    }
    if (record.status !== 'pending') {
      throw new AppError(409, 'Only pending requests can be cancelled', 'CONFLICT');
    }
    store.deleteById(id);
  },
};
