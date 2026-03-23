import type {
  ScheduleApproval,
  ScheduleApprovalStatus,
  Department,
  WorkSchedule,
  ScheduleDay,
} from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import { notificationService } from '../notifications/notification.service';
import type { UserRecord } from '../employees/employee.service';

// ─── Stores ───────────────────────────────────────────────────────────────────

const approvalStore  = new JsonRepository<ScheduleApproval>('schedule_approvals');
// Published schedules (employee-visible)
const scheduleStore  = new JsonRepository<WorkSchedule>('schedules');
// Manager's draft schedules (not yet published)
const draftStore     = new JsonRepository<WorkSchedule>('schedule_drafts');
const employeeStore  = new JsonRepository<UserRecord>('employees');
const deptStore      = new JsonRepository<Department>('departments');

// ─── Date helpers ─────────────────────────────────────────────────────────────

function _toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso(): string { return _toIso(new Date()); }

/** All YYYY-MM-DD strings whose year-month equals the given YYYY-MM. */
function _weekStartsInMonth(weekStart: string, month: string): boolean {
  // A week is "in month" if any of its 7 days falls in the month.
  // Simplification: include if the week-start or the Sunday of that week is in the month.
  return weekStart.startsWith(month) ||
    (() => {
      const sun = new Date(weekStart + 'T00:00:00');
      sun.setDate(sun.getDate() + 6);
      return _toIso(sun).startsWith(month);
    })();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All active employee IDs in a department. */
function deptEmployeeIds(departmentId: string): string[] {
  return employeeStore
    .findAll((u) => u.departmentId === departmentId && u.isActive)
    .map((u) => u.id);
}

/** All draft WorkSchedules for a department+month. */
function draftWeeksForMonth(departmentId: string, month: string): WorkSchedule[] {
  const empIds = new Set(deptEmployeeIds(departmentId));
  return draftStore.findAll(
    (s) => empIds.has(s.userId) && _weekStartsInMonth(s.weekStart, month)
  );
}

/**
 * Publish drafts to the live schedule store, skipping past dates.
 * For each draft week: merge only days >= today into the published record.
 */
function publishDrafts(departmentId: string, month: string): void {
  const today = todayIso();
  const drafts = draftWeeksForMonth(departmentId, month);

  for (const draft of drafts) {
    // Collect only current/future days from the draft
    const futureDays: Record<string, ScheduleDay> = {};
    for (const [date, day] of Object.entries(draft.days)) {
      if (date >= today) futureDays[date] = day;
    }
    if (Object.keys(futureDays).length === 0) continue;

    // Upsert into the published store
    const existing = scheduleStore.findOne(
      (s) => s.userId === draft.userId && s.weekStart === draft.weekStart
    );
    if (existing) {
      scheduleStore.updateById(existing.id, {
        days: { ...existing.days, ...futureDays },
        updatedBy: draft.updatedBy ?? draft.createdBy,
      });
    } else {
      scheduleStore.create({
        userId:    draft.userId,
        weekStart: draft.weekStart,
        days:      futureDays,
        createdBy: draft.createdBy,
      } as Omit<WorkSchedule, 'id' | 'createdAt' | 'updatedAt'>);
    }
  }

  // Remove draft records once published
  for (const draft of drafts) {
    draftStore.deleteById(draft.id);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface SubmitApprovalDto {
  departmentId: string;
  month: string;  // YYYY-MM
}

export interface RejectApprovalDto {
  rejectReason: string;
}

export const scheduleApprovalService = {

  // ── Submit ────────────────────────────────────────────────────────────────

  /**
   * Manager submits the draft schedule for a department-month.
   * - If dept.requireHrApproval → status = pending_hr_approval, notify HR
   * - Otherwise → publish immediately
   */
  submit(dto: SubmitApprovalDto, actorUserId: string, actorRole: string): ScheduleApproval {
    const { departmentId, month } = dto;

    if (!departmentId) throw new AppError(400, 'departmentId required', 'VALIDATION_ERROR');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, 'month must be YYYY-MM', 'VALIDATION_ERROR');

    const dept = deptStore.findById(departmentId);
    if (!dept) throw new AppError(404, 'Department not found', 'NOT_FOUND');

    // Verify manager access
    if (!hasPermission(actorRole as any, 'hr')) {
      const actor = employeeStore.findById(actorUserId);
      const managedDepts = actor?.managerDepartments ?? [];
      if (!managedDepts.includes(departmentId)) {
        throw new AppError(403, 'You do not manage this department', 'FORBIDDEN');
      }
    }

    // Reject if there's already a pending approval for this dept-month
    const existing = approvalStore.findOne(
      (a) => a.departmentId === departmentId && a.month === month && a.status === 'pending_hr_approval'
    );
    if (existing) {
      throw new AppError(409, 'This schedule is already pending HR approval', 'CONFLICT');
    }

    const requiresApproval = dept.requireHrApproval ?? false;
    const now = new Date().toISOString();

    let approval: ScheduleApproval;

    if (!requiresApproval) {
      // Publish immediately
      publishDrafts(departmentId, month);
      approval = approvalStore.create({
        departmentId,
        month,
        status: 'published' as ScheduleApprovalStatus,
        submittedBy: actorUserId,
        submittedAt: now,
        reviewedBy:  actorUserId,
        reviewedAt:  now,
        requireHrApprovalSnapshot: false,
      } as Omit<ScheduleApproval, 'id' | 'createdAt' | 'updatedAt'>);
    } else {
      // Queue for HR review
      approval = approvalStore.create({
        departmentId,
        month,
        status: 'pending_hr_approval' as ScheduleApprovalStatus,
        submittedBy: actorUserId,
        submittedAt: now,
        requireHrApprovalSnapshot: true,
      } as Omit<ScheduleApproval, 'id' | 'createdAt' | 'updatedAt'>);

      // Notify all HR users
      const hrUsers = employeeStore.findAll((u) => u.role === 'hr' && u.isActive);
      for (const hr of hrUsers) {
        notificationService.create(
          hr.id,
          'schedule_pending',
          'คำขออนุมัติตารางงาน',
          `${dept.nameTh} ขอนุมัติตารางงานเดือน ${month}`,
          approval.id,
        );
      }
    }

    return approval;
  },

  // ── Approve ───────────────────────────────────────────────────────────────

  approve(approvalId: string, actorUserId: string, actorRole: string): ScheduleApproval {
    if (!hasPermission(actorRole as any, 'hr')) {
      throw new AppError(403, 'Only HR can approve schedules', 'FORBIDDEN');
    }

    const approval = approvalStore.findById(approvalId);
    if (!approval) throw new AppError(404, 'Approval request not found', 'NOT_FOUND');
    if (approval.status !== 'pending_hr_approval') {
      throw new AppError(409, `Approval is already ${approval.status}`, 'CONFLICT');
    }

    // Publish draft schedules (future dates only)
    publishDrafts(approval.departmentId, approval.month);

    const updated = approvalStore.updateById(approvalId, {
      status:     'published' as ScheduleApprovalStatus,
      reviewedBy: actorUserId,
      reviewedAt: new Date().toISOString(),
    }) as ScheduleApproval;

    // Notify the submitting manager
    const dept = deptStore.findById(approval.departmentId);
    notificationService.create(
      approval.submittedBy,
      'schedule_approved',
      'ตารางงานได้รับการอนุมัติ',
      `ตารางงานเดือน ${approval.month} ของ ${dept?.nameTh ?? ''} ได้รับการอนุมัติและเผยแพร่แล้ว`,
      approvalId,
    );

    return updated;
  },

  // ── Reject ────────────────────────────────────────────────────────────────

  reject(approvalId: string, dto: RejectApprovalDto, actorUserId: string, actorRole: string): ScheduleApproval {
    if (!hasPermission(actorRole as any, 'hr')) {
      throw new AppError(403, 'Only HR can reject schedules', 'FORBIDDEN');
    }

    const approval = approvalStore.findById(approvalId);
    if (!approval) throw new AppError(404, 'Approval request not found', 'NOT_FOUND');
    if (approval.status !== 'pending_hr_approval') {
      throw new AppError(409, `Approval is already ${approval.status}`, 'CONFLICT');
    }

    const updated = approvalStore.updateById(approvalId, {
      status:       'rejected' as ScheduleApprovalStatus,
      reviewedBy:   actorUserId,
      reviewedAt:   new Date().toISOString(),
      rejectReason: dto.rejectReason?.trim() || undefined,
    }) as ScheduleApproval;

    // Notify the submitting manager
    const dept = deptStore.findById(approval.departmentId);
    notificationService.create(
      approval.submittedBy,
      'schedule_rejected',
      'ตารางงานถูกปฏิเสธ',
      `ตารางงานเดือน ${approval.month} ของ ${dept?.nameTh ?? ''} ถูกปฏิเสธ: ${dto.rejectReason ?? ''}`,
      approvalId,
    );

    return updated;
  },

  // ── Query ─────────────────────────────────────────────────────────────────

  findAll(
    filters: { departmentId?: string; status?: ScheduleApprovalStatus; month?: string },
    actorUserId: string,
    actorRole: string,
  ): ScheduleApproval[] {
    const isHr = hasPermission(actorRole as any, 'hr');
    const managedDepts = isHr
      ? null
      : new Set(employeeStore.findById(actorUserId)?.managerDepartments ?? []);

    return approvalStore
      .findAll((a) => {
        if (!isHr && managedDepts && !managedDepts.has(a.departmentId)) return false;
        if (filters.departmentId && a.departmentId !== filters.departmentId) return false;
        if (filters.status       && a.status       !== filters.status)       return false;
        if (filters.month        && a.month        !== filters.month)        return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  findById(id: string): ScheduleApproval {
    const a = approvalStore.findById(id);
    if (!a) throw new AppError(404, 'Approval request not found', 'NOT_FOUND');
    return a;
  },

  /** Count of pending approvals — used for HR sidebar badge. */
  pendingCount(): number {
    return approvalStore.count((a) => a.status === 'pending_hr_approval');
  },

  /**
   * Return draft schedule weeks for a dept-month (for the HR preview).
   * Falls back to published if no draft exists.
   */
  getDraftPreview(departmentId: string, month: string): WorkSchedule[] {
    const drafts = draftWeeksForMonth(departmentId, month);
    if (drafts.length > 0) return drafts;
    // Fall back to published
    const empIds = new Set(deptEmployeeIds(departmentId));
    return scheduleStore.findAll(
      (s) => empIds.has(s.userId) && _weekStartsInMonth(s.weekStart, month)
    );
  },
};
