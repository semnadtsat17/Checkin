import type { ShiftTransferRequest, ShiftTransferStatus, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import type { UserRecord } from '../employees/employee.service';
import type { ScheduleDayRecord } from '../schedules/schedule.service';

// ─── Repositories ──────────────────────────────────────────────────────────────

const store:         IRepository<ShiftTransferRequest> = new JsonRepository<ShiftTransferRequest>('shift_transfer_requests');
const employeeStore: IRepository<UserRecord>            = new JsonRepository<UserRecord>('employees');
const dayStore:      IRepository<ScheduleDayRecord>     = new JsonRepository<ScheduleDayRecord>('schedule_days');

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateShiftTransferDto {
  receiverId: string;
  shiftDate:  string;   // YYYY-MM-DD
  shiftCode:  string;   // sender's shift code for that day
}

export interface ShiftTransferFilters {
  status?:       ShiftTransferStatus;
  departmentId?: string;
  branchId?:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(v: string, field: string): void {
  if (!DATE_RE.test(v) || isNaN(Date.parse(v))) {
    throw new AppError(400, `${field} must be a valid YYYY-MM-DD date`, 'VALIDATION_ERROR');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const shiftTransferService = {

  list(filters: ShiftTransferFilters = {}): ShiftTransferRequest[] {
    return store.findAll((r) => {
      if (filters.status       && r.status          !== filters.status)       return false;
      if (filters.departmentId && r.senderDeptId    !== filters.departmentId &&
                                  r.receiverDeptId  !== filters.departmentId) return false;
      if (filters.branchId     && r.senderBranchId  !== filters.branchId &&
                                  r.receiverBranchId !== filters.branchId)    return false;
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  my(userId: string): ShiftTransferRequest[] {
    return store.findAll((r) => r.senderId === userId || r.receiverId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  findById(id: string): ShiftTransferRequest {
    const r = store.findById(id);
    if (!r) throw new AppError(404, `ShiftTransferRequest '${id}' not found`, 'NOT_FOUND');
    return r;
  },

  create(dto: CreateShiftTransferDto, senderId: string): ShiftTransferRequest {
    assertDate(dto.shiftDate, 'shiftDate');
    if (!dto.shiftCode?.trim()) throw new AppError(400, 'shiftCode is required', 'VALIDATION_ERROR');
    if (!dto.receiverId?.trim()) throw new AppError(400, 'receiverId is required', 'VALIDATION_ERROR');
    if (dto.receiverId === senderId) throw new AppError(400, 'Cannot transfer shift to yourself', 'VALIDATION_ERROR');

    const sender = employeeStore.findById(senderId);
    if (!sender) throw new AppError(404, 'Sender not found', 'NOT_FOUND');
    const receiver = employeeStore.findById(dto.receiverId);
    if (!receiver) throw new AppError(404, 'Receiver not found', 'NOT_FOUND');

    // Lookup sender's schedule for that date to get shift details
    const senderDay = dayStore.findOne(
      (d) => d.userId === senderId && d.date === dto.shiftDate && !d.isDayOff &&
             (d.shiftCode === dto.shiftCode || d.shiftCodes.includes(dto.shiftCode)),
    );
    if (!senderDay) {
      throw new AppError(400, 'No matching shift found on sender schedule for that date', 'NOT_FOUND');
    }

    // Prevent duplicate pending request for same sender+date+shiftCode
    const dup = store.findOne(
      (r) => r.senderId === senderId && r.shiftDate === dto.shiftDate &&
             r.shiftCode === dto.shiftCode && (r.status === 'pending_target' || r.status === 'pending_manager'),
    );
    if (dup) throw new AppError(409, 'A pending transfer request already exists for this shift', 'CONFLICT');

    return store.create({
      senderId,
      receiverId:       dto.receiverId,
      senderBranchId:   sender.branchId,
      receiverBranchId: receiver.branchId,
      senderDeptId:     sender.departmentId,
      receiverDeptId:   receiver.departmentId,
      shiftDate:        dto.shiftDate,
      shiftCode:        dto.shiftCode,
      startTime:        '',
      endTime:          '',
      isOvernight:      false,
      breakMinutes:     0,
      status:           'pending_target',
    } as Omit<ShiftTransferRequest, 'id' | 'createdAt' | 'updatedAt'>);
  },

  respond(id: string, responderId: string, response: 'accepted' | 'declined'): ShiftTransferRequest {
    const record = this.findById(id);
    if (record.receiverId !== responderId) {
      throw new AppError(403, 'Only the target employee can respond', 'FORBIDDEN');
    }
    if (record.status !== 'pending_target') {
      throw new AppError(409, 'Request is not awaiting target response', 'CONFLICT');
    }

    if (response === 'declined') {
      return store.updateById(id, {
        status:            'rejected',
        targetResponse:    'declined',
        targetRespondedAt: new Date().toISOString(),
      }) as ShiftTransferRequest;
    }

    return store.updateById(id, {
      status:            'pending_manager',
      targetResponse:    'accepted',
      targetRespondedAt: new Date().toISOString(),
    }) as ShiftTransferRequest;
  },

  managerDecision(
    id:        string,
    actorId:   string,
    actorRole: UserRole,
    decision:  'approved' | 'rejected',
    note?:     string,
  ): ShiftTransferRequest {
    if (!hasPermission(actorRole, 'manager')) {
      throw new AppError(403, 'Only managers and above can approve shift transfers', 'FORBIDDEN');
    }
    const record = this.findById(id);
    if (record.status !== 'pending_manager') {
      throw new AppError(409, 'Request is not awaiting manager decision', 'CONFLICT');
    }

    if (decision === 'rejected') {
      return store.updateById(id, {
        status:      'rejected',
        approvedBy:  actorId,
        managerNote: note,
        resolvedAt:  new Date().toISOString(),
      }) as ShiftTransferRequest;
    }

    // Swap schedule entries for sender and receiver on shiftDate
    this.swapSchedules(record);

    return store.updateById(id, {
      status:      'approved',
      approvedBy:  actorId,
      managerNote: note,
      resolvedAt:  new Date().toISOString(),
    }) as ShiftTransferRequest;
  },

  cancel(id: string, userId: string): void {
    const record = this.findById(id);
    if (record.senderId !== userId) {
      throw new AppError(403, 'Only the sender can cancel', 'FORBIDDEN');
    }
    if (record.status !== 'pending_target') {
      throw new AppError(409, 'Only pending_target requests can be cancelled', 'CONFLICT');
    }
    store.deleteById(id);
  },

  swapSchedules(record: ShiftTransferRequest): void {
    const { senderId, receiverId, shiftDate, shiftCode } = record;

    const senderDay = dayStore.findOne(
      (d) => d.userId === senderId && d.date === shiftDate,
    );
    const receiverDay = dayStore.findOne(
      (d) => d.userId === receiverId && d.date === shiftDate,
    );

    const now = new Date().toISOString();

    // Remove shiftCode from sender; give it to receiver
    if (senderDay) {
      const senderCodes = senderDay.shiftCodes.filter((c) => c !== shiftCode);
      dayStore.updateById(senderDay.id, {
        shiftCodes: senderCodes,
        shiftCode:  senderCodes[0] ?? null,
        isDayOff:   senderCodes.length === 0,
        updatedAt:  now,
      });
    }

    if (receiverDay) {
      const receiverCodes = [...new Set([...receiverDay.shiftCodes, shiftCode])];
      dayStore.updateById(receiverDay.id, {
        shiftCodes: receiverCodes,
        shiftCode:  receiverCodes[0],
        isDayOff:   false,
        updatedAt:  now,
      });
    } else {
      // No existing schedule day for receiver — create one
      dayStore.create({
        userId:    receiverId,
        date:      shiftDate,
        shiftCode,
        shiftCodes: [shiftCode],
        isDayOff:   false,
        status:    'published',
        savedBy:   'system',
      } as Omit<ScheduleDayRecord, 'id' | 'createdAt' | 'updatedAt'>);
    }
  },
};
