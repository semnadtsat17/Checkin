import type { AttendanceRecord, AttendanceStatus, Branch, Department, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';
import { haversineMeters, isWithinRadius } from '../../shared/utils/geo';
import type { UserRecord } from '../employees/employee.service';
import { computeMonthlySummary, type MonthlySummary } from './hours';
import { resolveWorkingTime } from '../schedules/schedule.resolver';
import type { ResolvedWorkingTime } from '../schedules/schedule.resolver';
import { resolveCheckInStatus, resolveCheckOutStatus } from './attendance.processor';

// ─── Repositories ─────────────────────────────────────────────────────────────

const attendanceStore: IRepository<AttendanceRecord>  = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:   IRepository<UserRecord>        = new JsonRepository<UserRecord>('employees');
const branchStore:     IRepository<Branch>            = new JsonRepository<Branch>('branches');
const deptStore:       IRepository<Department>        = new JsonRepository<Department>('departments');

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CheckInDto {
  lat?:       number;
  lng?:       number;
  photoPath?: string;   // relative filename from multer, e.g. "1234-abc.jpg"
  note?:      string;
}

export interface CheckOutDto {
  lat?:       number;
  lng?:       number;
  photoPath?: string;
  note?:      string;
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


const LATE_GRACE_MINUTES      = 15;
const EARLY_LEAVE_GRACE_MINUTES = 5;

/** Return today's date string in YYYY-MM-DD. */
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
 * Determine check-in status.
 *
 * - No scheduled shift today (times === null)  →  pending_approval
 *   (employee worked outside their assigned schedule; manager review required)
 * - Scheduled shift found, checked in on time  →  present
 * - Scheduled shift found, checked in late     →  late
 */
function determineCheckInStatus(
  checkInTime: Date,
  times: { startTime: string; endTime: string } | null,
): AttendanceStatus {
  if (!times) return 'pending_approval';

  const shiftStartMins = toMinutes(times.startTime);
  const checkInMins    = checkInTime.getHours() * 60 + checkInTime.getMinutes();

  return checkInMins > shiftStartMins + LATE_GRACE_MINUTES ? 'late' : 'present';
}

function shouldMarkEarlyLeave(checkOutTime: Date, shiftEnd?: string): boolean {
  if (!shiftEnd) return false;

  const shiftEndMins = toMinutes(shiftEnd);
  // "00:00" end means midnight — treat as 24 * 60
  const effectiveEnd = shiftEndMins === 0 ? 24 * 60 : shiftEndMins;
  const checkOutMins = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();

  return checkOutMins < effectiveEnd - EARLY_LEAVE_GRACE_MINUTES;
}

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
  if (hasPermission(actorRole, 'hr')) return;

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
    const today = todayStr();

    // Photo is mandatory
    if (!dto.photoPath) {
      throw new AppError(400, 'A check-in photo is required', 'PHOTO_REQUIRED');
    }

    // Guard: already checked in today
    const existing = attendanceStore.findOne(
      (r) => r.userId === userId && r.date === today,
    );
    if (existing) {
      throw new AppError(409, 'Already checked in today', 'ALREADY_CHECKED_IN');
    }

    // GPS fence validation
    enforceGpsFence(branchId, dto.lat, dto.lng);

    // Determine status — delegates to processor so SIMPLE mode is respected
    const now   = new Date();
    const times = getScheduledTimes(userId, today);
    const status = resolveCheckInStatus(now, times);

    return attendanceStore.create({
      userId,
      date:          today,
      checkInTime:   now.toISOString(),
      checkInPhoto:  dto.photoPath,
      checkInLat:    dto.lat,
      checkInLng:    dto.lng,
      status,
      note:          dto.note,
    });
  },

  // ── Check-out ────────────────────────────────────────────────────────────────

  checkOut(userId: string, branchId: string, dto: CheckOutDto): AttendanceRecord {
    const today = todayStr();

    // Photo is mandatory
    if (!dto.photoPath) {
      throw new AppError(400, 'A check-out photo is required', 'PHOTO_REQUIRED');
    }

    // Must have checked in
    const record = attendanceStore.findOne(
      (r) => r.userId === userId && r.date === today,
    );
    if (!record) {
      throw new AppError(400, 'No check-in found for today', 'NOT_CHECKED_IN');
    }
    if (record.checkOutTime) {
      throw new AppError(409, 'Already checked out today', 'ALREADY_CHECKED_OUT');
    }

    // GPS fence validation
    enforceGpsFence(branchId, dto.lat, dto.lng);

    const now = new Date();
    const times = getScheduledTimes(userId, today);

    // Update status to early_leave if leaving before shift end.
    // Delegates to processor — SIMPLE mode always preserves current status.
    const status = resolveCheckOutStatus(record.status, now, times?.endTime);

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

    if (!hasPermission(actorRole, 'hr')) {
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
      status = checkInMins > shiftStartMins + LATE_GRACE_MINUTES ? 'late' : 'present';
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
