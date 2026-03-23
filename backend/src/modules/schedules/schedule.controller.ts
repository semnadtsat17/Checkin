import { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../shared/utils/response';
import { scheduleService } from './schedule.service';
import type { UpsertWeekDto, UpsertDayDto } from './schedule.service';

// ─── List ──────────────────────────────────────────────────────────────────────
// GET /api/schedules
// Query: userId?, departmentId?, weekStart?, from?, to?
//
// Manager → auto-scoped to departments they manage.
// HR/super_admin → unscoped (or filtered by departmentId).

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const schedules = scheduleService.findAll(
      {
        userId:       req.query.userId       as string | undefined,
        departmentId: req.query.departmentId as string | undefined,
        weekStart:    req.query.weekStart    as string | undefined,
        from:         req.query.from         as string | undefined,
        to:           req.query.to           as string | undefined,
      },
      user.userId,
      user.role
    );
    ok(res, schedules);
  } catch (err) {
    next(err);
  }
}

// ─── My Schedules ──────────────────────────────────────────────────────────────
// GET /api/schedules/my
// Query: weekStart?, from?, to?
//
// Available to any authenticated user — always scoped to their own userId.
// Used by the employee check-in page to show their own shift grid.

export async function getMySchedules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    // Uses getMySchedule() which merges real manual schedules with auto-generated
    // virtual entries from the employee's department WEEKLY_WORKING_TIME pattern.
    const schedules = scheduleService.getMySchedule(userId, {
      weekStart: req.query.weekStart as string | undefined,
      from:      req.query.from      as string | undefined,
      to:        req.query.to        as string | undefined,
    });
    ok(res, schedules);
  } catch (err) {
    next(err);
  }
}

// ─── Get One ───────────────────────────────────────────────────────────────────
// GET /api/schedules/:id

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, scheduleService.findById(req.params.id));
  } catch (err) {
    next(err);
  }
}

// ─── Upsert Week ───────────────────────────────────────────────────────────────
// POST /api/schedules
// Body: { userId, weekStart, days: { "YYYY-MM-DD": { shiftCode, isDayOff, timeOverride?, note? } } }
//
// Creates the schedule if none exists for (userId, weekStart); otherwise overwrites.

export async function upsertWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const schedule = scheduleService.upsertWeek(req.body, user.userId, user.role);
    created(res, schedule, 'Schedule saved');
  } catch (err) {
    next(err);
  }
}

// ─── Batch Upsert ─────────────────────────────────────────────────────────────
// POST /api/schedules/batch
// Body: { weeks: UpsertWeekDto[] }
//
// Saves multiple (userId, weekStart) records in one request.
// Used by the month-grid UI.

export async function batchUpsertWeeks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user  = req.user!;
    const weeks = req.body.weeks as UpsertWeekDto[];
    if (!Array.isArray(weeks)) {
      res.status(400).json({ message: 'weeks must be an array' });
      return;
    }
    const results = scheduleService.batchUpsert(weeks, user.userId, user.role);
    ok(res, results, 'Schedules saved');
  } catch (err) {
    next(err);
  }
}

// ─── Update Single Day ────────────────────────────────────────────────────────
// PATCH /api/schedules/:id/days/:date
// Body: { shiftCode, isDayOff, timeOverride?, note? }

export async function updateDay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const schedule = scheduleService.updateDay(
      req.params.id,
      req.params.date,
      req.body,
      user.userId,
      user.role
    );
    ok(res, schedule, 'Day updated');
  } catch (err) {
    next(err);
  }
}

// ─── Date-based upsert ─────────────────────────────────────────────────────────
// POST /api/schedules/days
// Body: { days: UpsertDayDto[] }
//
// Saves exactly the provided (userId, date) pairs — no week merge, no auto-fill.
// Each record is stored independently in schedule_days.json.

export async function upsertDays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const days = req.body.days as UpsertDayDto[];
    if (!Array.isArray(days) || days.length === 0) {
      res.status(400).json({ success: false, error: 'days must be a non-empty array' });
      return;
    }
    const results = scheduleService.upsertDays(days, user.userId, user.role);
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

// ─── My Calendar (resolver endpoint) ──────────────────────────────────────────
// GET /api/schedules/my-calendar?month=YYYY-MM
//
// Single endpoint for the employee calendar page.
// Returns one ResolvedCalendarDay per calendar day in the requested month,
// with department resolved by effectiveDate so post-transfer data is always fresh.

export async function getMyCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const month  = req.query.month as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: 'month must be YYYY-MM' });
      return;
    }
    const days = scheduleService.resolveMyCalendar(userId, month);
    ok(res, days);
  } catch (err) {
    next(err);
  }
}

// ─── Employee Calendar (manager view, draft-inclusive) ─────────────────────────
// GET /api/schedules/employee-calendar?userId=...&month=YYYY-MM
//
// Returns the resolved calendar for any employee, including DRAFT shift records.
// Used by the ExtraWork modal so OT validation sees shifts the manager has
// assigned but not yet published.
//
// NOT exposed to employees — manager role required.
export async function getEmployeeCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.query.userId as string | undefined;
    const month  = req.query.month  as string | undefined;
    if (!userId) { res.status(400).json({ success: false, error: 'userId required' }); return; }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: 'month must be YYYY-MM' });
      return;
    }
    const days = scheduleService.resolveMyCalendar(userId, month, { includeDraftShifts: true });
    ok(res, days);
  } catch (err) {
    next(err);
  }
}

// ─── My Published Days ─────────────────────────────────────────────────────────
// GET /api/schedules/my-days?month=YYYY-MM
//
// Returns the employee's own ScheduleDayRecord[] for a given month,
// but ONLY when HR has published an approval for their department+month.

export async function getMyDays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const month  = req.query.month as string | undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ success: false, error: 'month must be YYYY-MM' });
      return;
    }
    const results = scheduleService.findMyPublishedDays(userId, month);
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

// ─── Date-based list ───────────────────────────────────────────────────────────
// GET /api/schedules/days?departmentId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns all ScheduleDayRecord rows in the date range for the department.
// Works for all admin roles (no draft/published split).

export async function findDays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const results = scheduleService.findDays(
      {
        departmentId: req.query.departmentId as string | undefined,
        from:         req.query.from         as string | undefined,
        to:           req.query.to           as string | undefined,
      },
      user.userId,
      user.role
    );
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

// ─── Publish Status ────────────────────────────────────────────────────────────
// GET /api/schedules/publish-status?departmentId=...&month=YYYY-MM
//
// Read-only check — returns whether there are unpublished drafts for a dept+month.
// Used by the UI to decide whether the Publish button should be enabled.

export async function getPublishStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const departmentId = req.query.departmentId as string | undefined;
    const month        = req.query.month        as string | undefined;
    if (!departmentId) { res.status(400).json({ success: false, error: 'departmentId required' }); return; }
    if (!month)        { res.status(400).json({ success: false, error: 'month required' });         return; }
    ok(res, scheduleService.publishStatus(departmentId, month, userId, role));
  } catch (err) {
    next(err);
  }
}

// ─── Publish Schedule ──────────────────────────────────────────────────────────
// POST /api/schedules/publish
// Body: { departmentId, month }
//
// Marks all draft ScheduleDayRecord entries for the dept+month as 'published'.
// Blocked for managers when department.requireHrApproval === true.

export async function publishSchedule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const { departmentId, month } = req.body as { departmentId?: string; month?: string };
    if (!departmentId) { res.status(400).json({ success: false, error: 'departmentId required' }); return; }
    if (!month)        { res.status(400).json({ success: false, error: 'month required' });         return; }
    const results = scheduleService.publishDays(departmentId, month, userId, role);
    ok(res, results, `Published ${results.length} schedule record(s)`);
  } catch (err) {
    next(err);
  }
}

// ─── Working-time ranges ───────────────────────────────────────────────────────
// GET /api/schedules/working-time?userId=...&date=YYYY-MM-DD
//
// Returns the main working-time ranges for a given employee on a specific date.
// Used by the UI to disable time slots that overlap with main working time when
// creating or editing an extra-work entry.

export async function getWorkingTime(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.query.userId as string | undefined;
    const date   = req.query.date   as string | undefined;
    if (!userId) { res.status(400).json({ success: false, error: 'userId required' }); return; }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ success: false, error: 'date must be YYYY-MM-DD' });
      return;
    }
    const ranges = scheduleService.resolveWorkingTimeRanges(userId, date);
    ok(res, { ranges });
  } catch (err) {
    next(err);
  }
}

// ─── Remove ────────────────────────────────────────────────────────────────────
// DELETE /api/schedules/:id

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    scheduleService.remove(req.params.id, user.userId, user.role);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
