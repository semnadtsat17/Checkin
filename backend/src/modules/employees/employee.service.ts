import bcrypt from 'bcryptjs';
import type { User, UserRole, DepartmentAssignment, Department, WorkSchedulePattern } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { isHigherThan, hasPermission } from '../../core/permissions';
import { generatePassword } from '../auth/auth.service';

// ─── Internal record (extends User with auth fields) ──────────────────────────
// passwordHash is NEVER returned in API responses — stripped by sanitizeUser().

export interface UserRecord extends User {
  passwordHash?: string;
}

/** Strip auth-sensitive fields before sending to client. */
export function sanitizeUser(record: UserRecord): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = record;
  return safe;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateEmployeeDto {
  firstNameTh: string;
  lastNameTh: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  role: UserRole;
  workSchedulePatternId?: string;
  departmentId: string;
  branchId: string;
  positionId?: string;
  startDate?: string;             // YYYY-MM-DD
  monthlyHoursOverride?: number;  // part-time only
}

export interface UpdateEmployeeDto {
  firstNameTh?: string;
  lastNameTh?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  departmentId?: string;
  branchId?: string;
  positionId?: string;
  workSchedulePatternId?: string | null;
  startDate?: string;
  monthlyHoursOverride?: number | null;
  isActive?: boolean;
}

export interface AssignRoleDto {
  role: UserRole;
  workSchedulePatternId?: string | null;
}

export interface EmployeeFilters {
  departmentId?: string;
  branchId?: string;
  role?: UserRole;
  isActive?: boolean;
  search?: string;  // matches employee code, name (th/en), email
  page?: number;
  pageSize?: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const store: IRepository<UserRecord> = new JsonRepository<UserRecord>('employees');

// ─── Transfer support stores ──────────────────────────────────────────────────

/** Audit trail for department transfers. */
const assignmentStore: IRepository<DepartmentAssignment> = new JsonRepository<DepartmentAssignment>('department_assignments');

/** Read-only access to departments for pattern resolution. */
const deptStore: IRepository<Department> = new JsonRepository<Department>('departments');

/** Read-only access to work schedule patterns for type detection. */
const patternStore: IRepository<WorkSchedulePattern> = new JsonRepository<WorkSchedulePattern>('sub_roles');

// Minimal shape needed to manipulate schedule_days rows without importing
// schedule.service (which already imports employee.service → circular risk).
interface _ScheduleDayRow {
  id:               string;
  userId:           string;
  date:             string;
  shiftCode:        string | null;
  shiftCodes:       string[];
  isDayOff:         boolean;
  weeklyStartTime?: string;
  weeklyEndTime?:   string;
  savedBy:          string;
  createdAt:        string;
  updatedAt:        string;
}
const scheduleDayStore: IRepository<_ScheduleDayRow> = new JsonRepository<_ScheduleDayRow>('schedule_days');

/** Format local date parts to YYYY-MM-DD (avoids UTC shift from toISOString). */
function _toIsoLocal(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateEmployeeCode(): string {
  const all = store.findAll();
  const nums = all
    .map((u) => u.employeeCode)
    .filter((c) => /^EMP-\d+$/.test(c))
    .map((c) => parseInt(c.slice(4), 10));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `EMP-${String(next).padStart(4, '0')}`;
}

/** Validate YYYY-MM-DD date string. */
function isValidDate(d?: string): boolean {
  if (!d) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const employeeService = {

  findAll(filters: EmployeeFilters = {}) {
    const { departmentId, branchId, role, isActive, search, page = 1, pageSize = 20 } = filters;

    const result = store.paginate({
      page,
      pageSize,
      filter: (u) => {
        if (departmentId && u.departmentId !== departmentId) return false;
        if (branchId      && u.branchId !== branchId)           return false;
        if (role          && u.role !== role)                    return false;
        if (isActive !== undefined && u.isActive !== isActive)   return false;
        if (search) {
          const q = search.toLowerCase();
          const matchCode  = u.employeeCode.toLowerCase().includes(q);
          const matchThF   = u.firstNameTh.toLowerCase().includes(q);
          const matchThL   = u.lastNameTh.toLowerCase().includes(q);
          const matchEnF   = (u.firstName ?? '').toLowerCase().includes(q);
          const matchEnL   = (u.lastName  ?? '').toLowerCase().includes(q);
          const matchEmail = u.email.toLowerCase().includes(q);
          if (!matchCode && !matchThF && !matchThL && !matchEnF && !matchEnL && !matchEmail) {
            return false;
          }
        }
        return true;
      },
      sort: { field: 'employeeCode', order: 'asc' },
    });

    return {
      ...result,
      items: result.items.map(sanitizeUser),
    };
  },

  findById(id: string): User {
    const record = store.findById(id);
    if (!record) throw new AppError(404, `Employee '${id}' not found`, 'NOT_FOUND');
    return sanitizeUser(record);
  },

  /** Internal method — returns full record including passwordHash. Used by auth module. */
  findRecordById(id: string): UserRecord {
    const record = store.findById(id);
    if (!record) throw new AppError(404, `Employee '${id}' not found`, 'NOT_FOUND');
    return record;
  },

  findByEmail(email: string): UserRecord | null {
    return store.findOne((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },

  async create(dto: CreateEmployeeDto, actorRole: UserRole): Promise<{ employee: User; temporaryPassword: string }> {
    // Required fields
    if (!dto.firstNameTh?.trim()) throw new AppError(400, 'firstNameTh is required', 'VALIDATION_ERROR');
    if (!dto.lastNameTh?.trim())  throw new AppError(400, 'lastNameTh is required', 'VALIDATION_ERROR');
    if (!dto.email?.trim())       throw new AppError(400, 'email is required', 'VALIDATION_ERROR');
    if (!dto.departmentId)        throw new AppError(400, 'departmentId is required', 'VALIDATION_ERROR');
    if (!dto.branchId)            throw new AppError(400, 'branchId is required', 'VALIDATION_ERROR');
    if (!dto.role)                throw new AppError(400, 'role is required', 'VALIDATION_ERROR');

    // Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new AppError(400, 'Invalid email format', 'VALIDATION_ERROR');
    }

    // Date format
    if (!isValidDate(dto.startDate)) {
      throw new AppError(400, 'startDate must be YYYY-MM-DD', 'VALIDATION_ERROR');
    }

    // Privilege escalation guard: actor cannot assign a role >= their own
    // (unless they are super_admin, which isHigherThan handles)
    if (!isHigherThan(actorRole, dto.role) && actorRole !== 'super_admin') {
      throw new AppError(
        403,
        `You cannot create an employee with role '${dto.role}'`,
        'FORBIDDEN'
      );
    }

    // monthlyHoursOverride only makes sense for part-time
    if (dto.monthlyHoursOverride !== undefined && dto.role !== 'part_time') {
      throw new AppError(400, 'monthlyHoursOverride is only valid for part_time role', 'VALIDATION_ERROR');
    }

    // Unique email
    if (store.exists((u) => u.email.toLowerCase() === dto.email.toLowerCase())) {
      throw new AppError(409, `Email '${dto.email}' is already registered`, 'DUPLICATE');
    }

    const temporaryPassword = generatePassword(8);
    const passwordHash      = await bcrypt.hash(temporaryPassword, 10);

    const record = store.create({
      employeeCode:         generateEmployeeCode(),
      firstNameTh:          dto.firstNameTh.trim(),
      lastNameTh:           dto.lastNameTh.trim(),
      firstName:            dto.firstName?.trim() ?? '',
      lastName:             dto.lastName?.trim()  ?? '',
      email:                dto.email.trim().toLowerCase(),
      phone:                dto.phone?.trim(),
      role:                 dto.role,
      workSchedulePatternId: dto.workSchedulePatternId,
      departmentId:         dto.departmentId,
      branchId:             dto.branchId,
      positionId:           dto.positionId,
      startDate:            dto.startDate,
      monthlyHoursOverride: dto.monthlyHoursOverride,
      isActive:             true,
      mustChangePassword:   true,
      passwordHash,
    } as Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>);

    return { employee: sanitizeUser(record), temporaryPassword };
  },

  update(id: string, dto: UpdateEmployeeDto): User {
    this.findById(id); // throws 404

    if (dto.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
        throw new AppError(400, 'Invalid email format', 'VALIDATION_ERROR');
      }
      const conflict = store.exists(
        (u) => u.id !== id && u.email.toLowerCase() === dto.email!.toLowerCase()
      );
      if (conflict) throw new AppError(409, `Email '${dto.email}' is already registered`, 'DUPLICATE');
    }

    if (!isValidDate(dto.startDate)) {
      throw new AppError(400, 'startDate must be YYYY-MM-DD', 'VALIDATION_ERROR');
    }

    const patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>> = {};
    if (dto.firstNameTh    !== undefined) patch.firstNameTh    = dto.firstNameTh.trim();
    if (dto.lastNameTh     !== undefined) patch.lastNameTh     = dto.lastNameTh.trim();
    if (dto.firstName      !== undefined) patch.firstName      = dto.firstName?.trim() ?? '';
    if (dto.lastName       !== undefined) patch.lastName       = dto.lastName?.trim()  ?? '';
    if (dto.email          !== undefined) patch.email          = dto.email.trim().toLowerCase();
    if (dto.phone          !== undefined) patch.phone          = dto.phone?.trim();
    if (dto.departmentId   !== undefined) patch.departmentId   = dto.departmentId;
    if (dto.branchId       !== undefined) patch.branchId       = dto.branchId;
    if (dto.positionId     !== undefined) patch.positionId     = dto.positionId;
    if (dto.startDate      !== undefined) patch.startDate      = dto.startDate;
    if (dto.isActive       !== undefined) patch.isActive       = dto.isActive;
    if ('workSchedulePatternId' in dto) patch.workSchedulePatternId = dto.workSchedulePatternId ?? undefined;
    if ('monthlyHoursOverride' in dto) patch.monthlyHoursOverride = dto.monthlyHoursOverride ?? undefined;

    return sanitizeUser(store.updateById(id, patch) as UserRecord);
  },

  /**
   * Assign or change an employee's role + subRole.
   * Separated from update() for auditability — role changes are high-privilege actions.
   *
   * Guards:
   *   - Actor cannot assign a role higher than or equal to their own
   *     (only super_admin can promote to super_admin)
   */
  assignRole(id: string, dto: AssignRoleDto, actorRole: UserRole): User {
    const target = this.findById(id);

    if (!dto.role) throw new AppError(400, 'role is required', 'VALIDATION_ERROR');

    // Privilege escalation guard
    if (!isHigherThan(actorRole, dto.role) && actorRole !== 'super_admin') {
      throw new AppError(
        403,
        `You cannot assign role '${dto.role}' — it is equal to or higher than your own`,
        'FORBIDDEN'
      );
    }

    // Also guard against demoting/promoting someone with equal/higher role
    if (!hasPermission(actorRole, target.role) && actorRole !== 'super_admin') {
      throw new AppError(
        403,
        `You cannot modify an employee with role '${target.role}'`,
        'FORBIDDEN'
      );
    }

    // monthlyHoursOverride must be cleared when moving out of part_time
    const patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>> = {
      role: dto.role,
      workSchedulePatternId: dto.workSchedulePatternId ?? undefined,
    };
    if (dto.role !== 'part_time') {
      patch.monthlyHoursOverride = undefined;
    }

    return sanitizeUser(store.updateById(id, patch) as UserRecord);
  },

  /**
   * Set the list of departments a manager is allowed to manage.
   * Replaces the full array — send [] to remove all assignments.
   * Only HR+ may call this, and only on users with role === 'manager'.
   */
  updateManagerDepartments(id: string, departmentIds: string[]): User {
    const target = store.findById(id);
    if (!target) throw new AppError(404, `Employee '${id}' not found`, 'NOT_FOUND');
    if (target.role !== 'manager') {
      throw new AppError(400, 'managerDepartments can only be set on users with role manager', 'VALIDATION_ERROR');
    }
    if (!Array.isArray(departmentIds)) {
      throw new AppError(400, 'departmentIds must be an array', 'VALIDATION_ERROR');
    }
    return sanitizeUser(store.updateById(id, { managerDepartments: departmentIds }) as UserRecord);
  },

  remove(id: string): void {
    this.findById(id); // throws 404
    store.softDelete(id);
  },

  // ── Department Transfer ───────────────────────────────────────────────────────

  /**
   * Transfer an employee to a new department with schedule migration.
   *
   * Rules:
   *   1. Create a DepartmentAssignment audit record.
   *   2. Update employee.departmentId immediately (backward compat).
   *   3. Delete ALL schedule_days records for this user where date >= effectiveDate.
   *   4a. WEEKLY_WORKING_TIME dept → auto-fill 90 days of working / day-off markers.
   *   4b. SHIFT_TIME dept          → leave empty; manager assigns shifts later.
   *   Past records (date < effectiveDate) are NEVER touched.
   */
  transferDepartment(
    userId:          string,
    newDepartmentId: string,
    effectiveDate:   string,
    actorUserId:     string,
  ): { employee: User; assignment: DepartmentAssignment } {
    // ── Validate ──────────────────────────────────────────────────────────────
    const emp = store.findById(userId);
    if (!emp) throw new AppError(404, `Employee '${userId}' not found`, 'NOT_FOUND');

    const newDept = deptStore.findById(newDepartmentId);
    if (!newDept) throw new AppError(404, `Department '${newDepartmentId}' not found`, 'NOT_FOUND');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || isNaN(Date.parse(effectiveDate))) {
      throw new AppError(400, 'effectiveDate must be YYYY-MM-DD', 'VALIDATION_ERROR');
    }

    // Prevent retroactive transfers: effectiveDate must be today or later.
    // Allowing a past effectiveDate would delete historical schedule_days records
    // (date >= effectiveDate), violating the rule that past schedules are immutable.
    const todayIso = _toIsoLocal(new Date());
    if (effectiveDate < todayIso) {
      throw new AppError(
        400,
        `effectiveDate (${effectiveDate}) cannot be in the past — past schedules are immutable`,
        'PAST_DATE_IMMUTABLE'
      );
    }

    // ── Step 1: Audit record ──────────────────────────────────────────────────
    const assignment = assignmentStore.create({
      userId,
      fromDepartmentId: emp.departmentId,
      toDepartmentId:   newDepartmentId,
      effectiveDate,
      transferredBy:    actorUserId,
    } as Omit<DepartmentAssignment, 'id' | 'createdAt' | 'updatedAt'>);

    // ── Step 2: Update employee record ────────────────────────────────────────
    const updated = store.updateById(userId, { departmentId: newDepartmentId }) as UserRecord;

    // ── Step 3: Delete schedule records on or after effectiveDate ─────────────
    // Records BEFORE effectiveDate are never touched — past schedules are immutable.
    const futureDays = scheduleDayStore.findAll(
      (d) => d.userId === userId && d.date >= effectiveDate
    );
    for (const day of futureDays) {
      scheduleDayStore.deleteById(day.id);
    }

    // ── Step 4: Reload dept + pattern after the employee update ───────────────
    // Re-read from the store so we are guaranteed to use the current persisted
    // values, not an in-memory reference that may be stale.
    const freshDept    = deptStore.findById(newDepartmentId);
    if (!freshDept) throw new AppError(500, `Department '${newDepartmentId}' disappeared after update`, 'INTERNAL_ERROR');
    const pattern = freshDept.workSchedulePatternId
      ? patternStore.findById(freshDept.workSchedulePatternId)
      : null;

    if (pattern?.type === 'WEEKLY_WORKING_TIME') {
      // Case A: WEEKLY_WORKING_TIME — generate 90 days from effectiveDate.
      // weeklySchedule MUST be configured; silently producing all-day-off records
      // when it is missing would be a data bug, so we throw instead.
      if (!pattern.weeklySchedule?.length) {
        throw new AppError(
          400,
          `Pattern '${pattern.nameTh}' is WEEKLY_WORKING_TIME but has no weeklySchedule configured. ` +
          `Please add working-day entries to the pattern before transferring employees to this department.`,
          'MISSING_WEEKLY_SCHEDULE'
        );
      }

      // Build dow → WeeklyScheduleDay lookup and generate one record per calendar day.
      // weeklyStartTime/weeklyEndTime are stored directly so the resolver can read
      // from schedule_days without re-deriving from the live pattern later.
      const dowMap = new Map(pattern.weeklySchedule.map((d) => [d.dayOfWeek, d]));
      const cur = new Date(effectiveDate + 'T00:00:00');
      const end = new Date(effectiveDate + 'T00:00:00');
      end.setDate(end.getDate() + 90);

      while (cur <= end) {
        const dateStr = _toIsoLocal(cur);
        const dow     = cur.getDay();
        const weekDay = dowMap.get(dow);
        // Days absent from weeklySchedule are legitimate rest days (weekends etc.)
        scheduleDayStore.create({
          userId,
          date:             dateStr,
          shiftCode:        null,
          shiftCodes:       [],
          isDayOff:         !weekDay,
          weeklyStartTime:  weekDay?.startTime,
          weeklyEndTime:    weekDay?.endTime,
          savedBy:          actorUserId,
        } as Omit<_ScheduleDayRow, 'id' | 'createdAt' | 'updatedAt'>);
        cur.setDate(cur.getDate() + 1);
      }
    }
    // Case B (SHIFT_TIME / no pattern): records deleted above — manager assigns shifts later.

    return { employee: sanitizeUser(updated), assignment };
  },
};
