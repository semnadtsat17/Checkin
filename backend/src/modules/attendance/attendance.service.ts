import type { AttendanceRecord, AttendanceStatus, Branch, CheckoutLateReason, Department, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasHrAccess } from '../../core/permissions';
import { haversineMeters, isWithinRadius } from '../../shared/utils/geo';
import type { UserRecord } from '../employees/employee.service';
import { computeMonthlySummary, type MonthlySummary } from './hours';
import { resolveWorkingTime } from '../schedules/schedule.resolver';
import type { ResolvedWorkingTime } from '../schedules/schedule.resolver';
import { resolveCheckInStatus, resolveCheckOutStatus } from './attendance.processor';
import { getLeaveStatusForDate } from '../leave/leaveAttendance.adapter';
import { getEffectiveBranchSettings } from '../branch-settings/branchSettings.runtime';

// ─── Repositories ─────────────────────────────────────────────────────────────

const attendanceStore: IRepository<AttendanceRecord>  = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:   IRepository<UserRecord>        = new JsonRepository<UserRecord>('employees');
const branchStore:     IRepository<Branch>            = new JsonRepository<Branch>('branches');
const deptStore:       IRepository<Department>        = new JsonRepository<Department>('departments');

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CheckInDto {
  lat?:                 number;
  lng?:                 number;
  photoPath?:           string;
  note?:                string;
  shiftCode?:           string;   // required for multi-shift employees
  outOfScheduleReason?: string;   // required when checking in after absent mark
}

export interface CheckOutDto {
  lat?:                number;
  lng?:                number;
  photoPath?:          string;
  note?:               string;
  checkoutLateReason?: CheckoutLateReason;   // required when checkout > shift end + threshold
  claimedCheckOutTime?: string;              // HH:mm — user-stated end when reason = forgot
}

export interface AttendanceFilters {
  userId?:   string;
  deptId?:   string;
  branchId?: string;
  from?:     string;   // YYYY-MM-DD inclusive
  to?:       string;   // YYYY-MM-DD inclusive
  status?:   AttendanceStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Post-migration resolver metrics. */
const resolverStats = {
  resolverPrimaryReads: 0,  // calls served directly from the resolver cache
};

/** Per-entry TTL — cached resolver results are refreshed after 6 hours. */
const RESOLVER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Resolver result cache — key = "userId:dateStr".
 * Each entry wraps the resolved time together with a timestamp so expired
 * entries can be detected synchronously without blocking the read path.
 * Seeded for today's active employees at module init; refreshed asynchronously
 * on stale reads inside getScheduledTimes().
 */
const resolverCache = new Map<string, { value: ResolvedWorkingTime | null; ts: number }>();

setInterval(() => {
  console.info('[ResolverPrimaryStats]', {
    resolverPrimaryReads: resolverStats.resolverPrimaryReads,
  });
}, 300_000); // every 5 minutes


/** Parse HH:mm into minutes-since-midnight (duplicate kept local to avoid circular import). */

/** Return today's date string in YYYY-MM-DD (local time). */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse HH:mm into minutes-since-midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Return the expected shift start/end times for an employee on a given date.
 * Resolver is the sole authoritative source; legacy schedules have been retired.
 *
 * Execution flow (synchronous contract preserved):
 *   1. Cache miss             → invariant violation: fire async seed, log error, return null.
 *   2. Cache hit, expired     → fire async refresh, return current (stale) value immediately.
 *   3. Cache hit, non-null    → return resolver result, increment metric.
 *   4. Cache hit, null        → resolver confirmed no schedule → return null.
 */
function getScheduledTimes(
  userId: string,
  dateStr: string,
): { startTime: string; endTime: string } | null {
  const cacheKey = `${userId}:${dateStr}`;
  const now      = Date.now();
  const entry    = resolverCache.get(cacheKey);

  if (!entry) {
    // True cache miss — should not occur after warmResolverCacheForToday() runs.
    // Fire async seed so the next call (e.g. check-out) may find the key.
    resolveWorkingTime(userId, dateStr)
      .then((r) => resolverCache.set(cacheKey, { value: r, ts: Date.now() }))
      .catch(() => {});
    console.error('[ResolverInvariantViolation]', {
      userId,
      date:   dateStr,
      reason: 'resolver cache miss — key not yet populated',
    });
    return null;
  }

  // Stale entry: fire async refresh, return current value immediately.
  // The synchronous return path is unchanged — no await, no blocking.
  if (now - entry.ts > RESOLVER_CACHE_TTL_MS) {
    resolveWorkingTime(userId, dateStr)
      .then((r) => resolverCache.set(cacheKey, { value: r, ts: Date.now() }))
      .catch(() => {});
  }

  if (entry.value != null) {
    // Holiday records carry source === 'holiday' with empty startTime/endTime.
    // Treat them as "no schedule" so check-in on a holiday → pending_approval.
    if (entry.value.source === 'holiday') return null;
    resolverStats.resolverPrimaryReads++;
    return entry.value;
  }

  // Resolver confirmed no schedule for this employee on this date.
  return null;
}

/**
 * Pre-seeds resolverCache for all active employees for today's date.
 * Called once at module initialisation — runs async in the background and
 * never blocks server startup.  Any employee whose resolver call fails is
 * skipped; getScheduledTimes() handles the resulting cache miss safely.
 */
async function warmResolverCacheForToday(): Promise<void> {
  const today  = todayStr();
  const active = employeeStore.findAll((u) => u.isActive);
  console.info('[ResolverWarmupStart]', { employeeCount: active.length, date: today });

  let processed = 0;
  for (const emp of active) {
    try {
      const result = await resolveWorkingTime(emp.id, today);
      resolverCache.set(`${emp.id}:${today}`, { value: result, ts: Date.now() });
      processed++;
    } catch {
      // Individual resolution failure — skip; cache miss handled by invariant guard.
    }
  }

  console.info('[ResolverWarmupComplete]', { usersProcessed: processed });
}

// Seed the cache for today's shift before any check-ins arrive.
// Fire-and-forget — must NOT block module initialisation.
warmResolverCacheForToday().catch(() => {});

/**
 * Validate GPS coordinates against the employee's branch fence.
 * Throws 403 if outside the fence.
 * No-ops when the branch has no fence configured.
 */
function enforceGpsFence(branchId: string, lat?: number, lng?: number): void {
  const branch = branchStore.findById(branchId);
  if (!branch) return;
  if (
    branch.latitude === undefined || branch.longitude === undefined ||
    branch.radiusMeters === undefined
  ) return;

  if (lat === undefined || lng === undefined) {
    throw new AppError(400, 'GPS coordinates are required for this branch', 'GPS_REQUIRED');
  }

  const inside = isWithinRadius(
    branch.latitude, branch.longitude, branch.radiusMeters,
    lat, lng,
  );

  if (!inside) {
    const dist = Math.round(haversineMeters(branch.latitude, branch.longitude, lat, lng));
    throw new AppError(
      403,
      `You are outside the check-in radius (approx. ${dist} m from branch)`,
      'OUTSIDE_GPS_FENCE',
    );
  }
}

// ─── Department / employee access guard ──────────────────────────────────────

/**
 * Verify the actor has authority over the target employee.
 * HR / super_admin → always allowed.
 * Manager → must manage the employee's department.
 */
function verifyEmployeeAccess(
  actorUserId: string,
  actorRole: UserRole,
  targetUserId: string,
): void {
  if (hasHrAccess(actorRole)) return;

  const employee = employeeStore.findById(targetUserId);
  if (!employee) throw new AppError(404, 'Employee not found', 'NOT_FOUND');

  const dept = deptStore.findById(employee.departmentId);
  if (!dept) throw new AppError(404, 'Department not found', 'NOT_FOUND');

  if (dept.managerId !== actorUserId) {
    throw new AppError(403, 'You do not manage this employee\'s department', 'FORBIDDEN');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const attendanceService = {

  // ── Check-in ─────────────────────────────────────────────────────────────────

  checkIn(userId: string, branchId: string, dto: CheckInDto): AttendanceRecord {
    const today   = todayStr();
    const bsettings = getEffectiveBranchSettings(branchId);

    // Photo requirement (configurable per branch)
    if (bsettings.requireCheckInPhoto && !dto.photoPath) {
      throw new AppError(400, 'A check-in photo is required', 'PHOTO_REQUIRED');
    }

    // Guard: already checked in for this shift (userId + date + shiftCode)
    // shiftCode=undefined means single-shift — check for any open record today
    const existing = attendanceStore.findOne((r) => {
      if (r.userId !== userId || r.date !== today) return false;
      if (dto.shiftCode) return r.shiftCode === dto.shiftCode;
      return !r.shiftCode; // single-shift: only block if no shiftCode on existing record
    });
    if (existing && existing.status !== 'absent') {
      throw new AppError(409, 'Already checked in for this shift', 'ALREADY_CHECKED_IN');
    }

    // GPS fence validation (skipped when location rule is disabled for this branch)
    if (bsettings.locationEnabled) {
      enforceGpsFence(branchId, dto.lat, dto.lng);
    }

    // Leave projection — synchronous JSON read, no I/O.
    const leaveInfo = getLeaveStatusForDate(userId, today);

    const now   = new Date();
    const times = getScheduledTimes(userId, today);

    // Check-in time-window enforcement (only when a shift is scheduled)
    if (times && !leaveInfo.isOnLeave) {
      const nowMins        = now.getHours() * 60 + now.getMinutes();
      const shiftStartMins = toMinutes(times.startTime);

      // Too early: enforce check-in window
      const windowMins = bsettings.checkInWindowMinutes;
      if (windowMins > 0 && nowMins < shiftStartMins - windowMins) {
        const earliest = `${String(Math.floor((shiftStartMins - windowMins) / 60)).padStart(2, '0')}:${String((shiftStartMins - windowMins) % 60).padStart(2, '0')}`;
        throw new AppError(400, `ยังไม่ถึงเวลาเช็คอิน (เช็คอินได้ตั้งแต่ ${earliest} น.)`, 'TOO_EARLY_CHECKIN');
      }

      // Too late: absent threshold — mark existing record absent, allow out-of-schedule check-in
      const absentMins = bsettings.absentAfterMinutes;
      if (absentMins > 0 && nowMins > shiftStartMins + absentMins) {
        // Ensure an absent record exists for the scheduled shift
        if (existing?.status !== 'absent') {
          if (existing) {
            attendanceStore.updateById(existing.id, { status: 'absent' });
          } else {
            attendanceStore.create({
              userId, branchId, date: today,
              shiftCode: dto.shiftCode,
              status: 'absent',
            } as Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>);
          }
        }
        // Fall through as OUT_OF_SCHEDULE_CHECKIN — handled below
        return attendanceStore.create({
          userId, branchId,
          date:               today,
          shiftCode:          dto.shiftCode,
          checkInTime:        now.toISOString(),
          checkInPhoto:       dto.photoPath,
          checkInLat:         dto.lat,
          checkInLng:         dto.lng,
          status:             'in_progress',
          checkInType:        'OUT_OF_SCHEDULE_CHECKIN',
          outOfScheduleReason: dto.outOfScheduleReason ?? 'มาสายเกินกำหนด',
          note:               dto.note,
        } as Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>);
      }
    }

    // No schedule → in_progress (pending_approval only after checkout)
    const hasSchedule = !!times && !leaveInfo.isOnLeave;
    const checkInType: AttendanceRecord['checkInType'] =
      hasSchedule ? 'NORMAL_CHECKIN' : 'OUT_OF_SCHEDULE_CHECKIN';

    const status = hasSchedule
      ? resolveCheckInStatus(now, times, leaveInfo, branchId)
      : 'in_progress';

    return attendanceStore.create({
      userId,
      branchId,
      date:               today,
      shiftCode:          dto.shiftCode,
      checkInTime:        now.toISOString(),
      checkInPhoto:       dto.photoPath,
      checkInLat:         dto.lat,
      checkInLng:         dto.lng,
      status,
      checkInType,
      outOfScheduleReason: !hasSchedule ? dto.outOfScheduleReason : undefined,
      note:               dto.note,
    } as Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>);
  },

  // ── Check-out ────────────────────────────────────────────────────────────────

  checkOut(userId: string, branchId: string, dto: CheckOutDto): AttendanceRecord {
    const today     = todayStr();
    const bsettings = getEffectiveBranchSettings(branchId);

    // Photo requirement (configurable per branch)
    if (bsettings.requireCheckOutPhoto && !dto.photoPath) {
      throw new AppError(400, 'A check-out photo is required', 'PHOTO_REQUIRED');
    }

    // Find the most recent open (not checked out) record for today
    // For multi-shift: match by shiftCode if provided
    const allToday = attendanceStore.findAll(
      (r) => r.userId === userId && r.date === today && !r.checkOutTime,
    ).sort((a, b) => (b.checkInTime ?? '').localeCompare(a.checkInTime ?? ''));

    const record = allToday[0] ?? null;
    if (!record) {
      throw new AppError(400, 'No open check-in found for today', 'NOT_CHECKED_IN');
    }

    // GPS fence validation
    if (bsettings.locationEnabled) {
      enforceGpsFence(branchId, dto.lat, dto.lng);
    }

    const now       = new Date();
    const times     = getScheduledTimes(userId, today);
    const leaveInfo = getLeaveStatusForDate(userId, today);

    // in_progress → pending_approval on checkout (no-schedule flow)
    if (record.status === 'in_progress') {
      return attendanceStore.updateById(record.id, {
        checkOutTime:        now.toISOString(),
        checkOutPhoto:       dto.photoPath,
        checkOutLat:         dto.lat,
        checkOutLng:         dto.lng,
        status:              'pending_approval',
        claimedCheckOutTime: dto.claimedCheckOutTime,
        note:                dto.note ?? record.note,
      }) as AttendanceRecord;
    }

    // Late-checkout handling: when checkout time exceeds shift end + threshold
    const lateThreshold = bsettings.checkoutLateThresholdMinutes;
    if (lateThreshold > 0 && times?.endTime) {
      const nowMins     = now.getHours() * 60 + now.getMinutes();
      const shiftEndMin = toMinutes(times.endTime);

      if (nowMins > shiftEndMin + lateThreshold) {
        if (!dto.checkoutLateReason) {
          throw new AppError(400, 'กรุณาระบุเหตุผลที่เลิกงานช้า', 'CHECKOUT_LATE_REASON_REQUIRED');
        }

        if (dto.checkoutLateReason === 'forgot') {
          // Checkout is recorded at shift end; send to HR for approval
          return attendanceStore.updateById(record.id, {
            checkOutTime:         now.toISOString(),
            checkOutPhoto:        dto.photoPath,
            checkOutLat:          dto.lat,
            checkOutLng:          dto.lng,
            status:               'pending_approval',
            forgotCheckout:       true,
            effectiveCheckOutTime: times.endTime,
            checkoutLateReason:   'forgot',
            note:                 dto.note ?? record.note,
          }) as AttendanceRecord;
        }

        // extra_work / compensate / ot: shift closes at shift end; extra time → new out-of-schedule record
        const baseStatus = resolveCheckOutStatus(record.status, new Date(`${today}T${times.endTime}`), times.endTime, leaveInfo, branchId);
        attendanceStore.updateById(record.id, {
          checkOutTime:       new Date(`${today}T${times.endTime}`).toISOString(),
          status:             baseStatus,
          effectiveCheckOutTime: times.endTime,
          checkoutLateReason: dto.checkoutLateReason,
        });

        // Create an extra-time record for the time beyond shift end → pending_approval
        return attendanceStore.create({
          userId, branchId,
          date:               today,
          shiftCode:          record.shiftCode ? `${record.shiftCode}_EX` : 'EX',
          checkInTime:        new Date(`${today}T${times.endTime}`).toISOString(),
          checkOutTime:       now.toISOString(),
          status:             'pending_approval',
          checkInType:        'OUT_OF_SCHEDULE_CHECKIN',
          outOfScheduleReason: dto.checkoutLateReason,
          checkoutLateReason:  dto.checkoutLateReason,
          note:               dto.note,
        } as Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>);
      }
    }

    // Normal checkout
    const status = resolveCheckOutStatus(record.status, now, times?.endTime, leaveInfo, branchId);

    return attendanceStore.updateById(record.id, {
      checkOutTime:  now.toISOString(),
      checkOutPhoto: dto.photoPath,
      checkOutLat:   dto.lat,
      checkOutLng:   dto.lng,
      status,
      note:          dto.note ?? record.note,
    }) as AttendanceRecord;
  },

  // ── Query ─────────────────────────────────────────────────────────────────────

  /** Get today's record for a specific employee (or null). */
  getToday(userId: string): AttendanceRecord | null {
    return attendanceStore.findOne(
      (r) => r.userId === userId && r.date === todayStr(),
    );
  },

  /** Employee's own records with optional date range filter. */
  getMyRecords(userId: string, from?: string, to?: string): AttendanceRecord[] {
    return attendanceStore.findAll((r) => {
      if (r.userId !== userId) return false;
      if (from && r.date < from) return false;
      if (to   && r.date > to)   return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  },

  /**
   * Manager / HR list — scoped by department when actor is manager.
   */
  list(filters: AttendanceFilters, actorUserId: string, actorRole: UserRole): AttendanceRecord[] {
    // Determine which user IDs are visible
    let scopedIds: Set<string> | null = null;

    if (!hasHrAccess(actorRole)) {
      // Manager: only employees in their departments
      const managedDeptIds = new Set<string>(
        deptStore
          .findAll((d) => d.managerId === actorUserId && d.isActive)
          .map((d) => d.id),
      );

      const employees = employeeStore.findAll(
        (u) => managedDeptIds.has(u.departmentId) && u.isActive,
      );
      scopedIds = new Set(employees.map((e) => e.id));
    }

    return attendanceStore.findAll((r) => {
      if (scopedIds && !scopedIds.has(r.userId)) return false;
      if (filters.userId   && r.userId !== filters.userId)   return false;
      if (filters.status   && r.status !== filters.status)   return false;
      if (filters.from     && r.date   < filters.from)       return false;
      if (filters.to       && r.date   > filters.to)         return false;
      // branchId filter: look up employee
      if (filters.branchId) {
        const emp = employeeStore.findById(r.userId);
        if (!emp || emp.branchId !== filters.branchId) return false;
      }
      if (filters.deptId) {
        const emp = employeeStore.findById(r.userId);
        if (!emp || emp.departmentId !== filters.deptId) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.checkInTime!.localeCompare(a.checkInTime!));
  },

  findById(id: string): AttendanceRecord {
    const r = attendanceStore.findById(id);
    if (!r) throw new AppError(404, 'Attendance record not found', 'NOT_FOUND');
    return r;
  },

  // ── Approval ──────────────────────────────────────────────────────────────────

  /**
   * Manager approves a pending_approval record.
   *
   * Re-evaluates the actual check-in time against the employee's schedule on
   * that date (manager may have since assigned a schedule).  If still no
   * schedule exists the record is simply marked 'present'.
   *
   * Access rule: HR/super_admin always allowed; managers must manage the
   * employee's department.
   */
  approve(id: string, actorUserId: string, actorRole: UserRole): AttendanceRecord {
    const record = attendanceService.findById(id);

    if (record.status !== 'pending_approval') {
      throw new AppError(400, 'Only pending_approval records can be approved', 'INVALID_STATUS');
    }

    verifyEmployeeAccess(actorUserId, actorRole, record.userId);

    // Recalculate: check whether a schedule now exists for that date
    const times  = getScheduledTimes(record.userId, record.date);
    const checkIn = new Date(record.checkInTime!);
    let status: AttendanceStatus;

    if (times) {
      const shiftStartMins = toMinutes(times.startTime);
      const checkInMins    = checkIn.getHours() * 60 + checkIn.getMinutes();
      const grace          = getEffectiveBranchSettings(record.branchId).lateGraceMinutes;
      status = checkInMins > shiftStartMins + grace ? 'late' : 'present';
    } else {
      status = 'present';
    }

    return attendanceStore.updateById(id, { status, approvedBy: actorUserId }) as AttendanceRecord;
  },

  /**
   * Manager rejects a pending_approval record — the check-in will not count
   * towards hours.  Status is set to 'absent'.
   */
  reject(id: string, actorUserId: string, actorRole: UserRole): AttendanceRecord {
    const record = attendanceService.findById(id);

    if (record.status !== 'pending_approval') {
      throw new AppError(400, 'Only pending_approval records can be rejected', 'INVALID_STATUS');
    }

    verifyEmployeeAccess(actorUserId, actorRole, record.userId);

    return attendanceStore.updateById(id, {
      status:     'absent',
      rejectedBy: actorUserId,
    }) as AttendanceRecord;
  },

  // ── Monthly summary ───────────────────────────────────────────────────────────

  /** Employee's own monthly summary. */
  getMySummary(userId: string, month: string): MonthlySummary {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be in YYYY-MM format', 'VALIDATION_ERROR');
    }
    return computeMonthlySummary(userId, month);
  },

  /**
   * Monthly summary for any employee, scoped by the actor's role.
   * HR/super_admin → any employee.
   * Manager → must manage the employee's department.
   */
  getSummary(
    targetUserId: string,
    month:        string,
    actorUserId:  string,
    actorRole:    UserRole,
  ): MonthlySummary {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'month must be in YYYY-MM format', 'VALIDATION_ERROR');
    }
    verifyEmployeeAccess(actorUserId, actorRole, targetUserId);
    return computeMonthlySummary(targetUserId, month);
  },
};
