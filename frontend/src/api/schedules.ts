import type { WorkSchedule } from '@hospital-hr/shared';
import { apiFetch } from './client';

// ─── Resolved calendar types (mirror of backend ResolvedCalendarDay) ──────────

/** Shift display info inlined into a resolved calendar day. */
export interface ResolvedCalendarShift {
  code:      string;
  nameTh:    string;
  startTime: string;
  endTime:   string;
}

/**
 * One calendar day as returned by GET /api/schedules/my-calendar.
 *
 * The frontend must render from this type ONLY — never re-derive department
 * or pattern from the cached auth token (stale after transfers).
 */
export interface ResolvedCalendarDay {
  date:        string;
  shiftCodes:  string[];
  shifts:      ResolvedCalendarShift[];
  isDayOff:    boolean;
  weeklyTime?: { startTime: string; endTime: string };
  source:      'published' | 'pattern' | 'empty';
  /**
   * Present when the backend resolver identifies this date as a configured holiday.
   * WEEKLY_WORKING_TIME: weeklyTime will be absent; render the holiday name instead.
   * SHIFT_TIME: shifts are still rendered; holiday.name is shown as a calendar annotation.
   */
  holiday?:    { name: string };
}

// ─── Date-based types (authoritative save/load format) ─────────────────────────

/** One saved cell: a single (userId, date) assignment. */
export interface ScheduleDayRecord {
  id:               string;
  userId:           string;
  date:             string;        // YYYY-MM-DD
  shiftCode:        string | null; // first shift (backward compat)
  shiftCodes:       string[];      // full list
  isDayOff:         boolean;
  weeklyStartTime?: string;        // HH:mm — present on WEEKLY_WORKING_TIME auto-generated records
  weeklyEndTime?:   string;        // HH:mm — present on WEEKLY_WORKING_TIME auto-generated records
  /** Draft/publish lifecycle. undefined = legacy record treated as 'published'. */
  status?:          'draft' | 'published';
}

/** Payload sent when saving touched cells. */
export interface ScheduleDayUpsertDto {
  userId:     string;
  date:       string;
  shiftCodes: string[];
  isDayOff:   boolean;
}

export interface ScheduleDayDto {
  shiftCode:   string | null;   // primary / backward compat
  shiftCodes?: string[];        // multi-shift list
  isDayOff:    boolean;
  note?:       string;
}

export interface UpsertWeekDto {
  userId:    string;
  weekStart: string;
  days:      Record<string, ScheduleDayDto>;
}

export interface ScheduleFilters {
  userId?:       string;
  departmentId?: string;
  weekStart?:    string;
  from?:         string;
  to?:           string;
}

export const scheduleApi = {
  list(f: ScheduleFilters = {}) {
    const p = new URLSearchParams();
    if (f.userId)       p.set('userId',       f.userId);
    if (f.departmentId) p.set('departmentId', f.departmentId);
    if (f.weekStart)    p.set('weekStart',    f.weekStart);
    if (f.from)         p.set('from',         f.from);
    if (f.to)           p.set('to',           f.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<WorkSchedule[]>(`/api/schedules${qs}`);
  },

  upsert(dto: UpsertWeekDto) {
    return apiFetch<WorkSchedule>('/api/schedules', { method: 'POST', body: JSON.stringify(dto) });
  },

  batchUpsert(weeks: UpsertWeekDto[]) {
    return apiFetch<WorkSchedule[]>('/api/schedules/batch', {
      method: 'POST',
      body: JSON.stringify({ weeks }),
    });
  },

  updateDay(id: string, date: string, dto: ScheduleDayDto) {
    return apiFetch<WorkSchedule>(`/api/schedules/${id}/days/${date}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  /**
   * Resolve the complete employee calendar for a given month.
   *
   * The backend resolves department by effectiveDate, handles both
   * WEEKLY_WORKING_TIME (pattern) and SHIFT_TIME (published records),
   * and inlines all shift display info. This is the single source of truth
   * for MySchedulePage — do NOT use weeklyDayMap or cached auth state.
   */
  myCalendar(params: { month: string }) {
    const p = new URLSearchParams();
    p.set('month', params.month);
    return apiFetch<ResolvedCalendarDay[]>(`/api/schedules/my-calendar?${p}`);
  },

  /**
   * Fetch the employee's own published schedule days for a given month.
   * Returns [] if no published HR approval exists for the department+month.
   */
  myDays(params: { month?: string } = {}) {
    const p = new URLSearchParams();
    if (params.month) p.set('month', params.month);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<ScheduleDayRecord[]>(`/api/schedules/my-days${qs}`);
  },

  /** Fetch the current user's own schedules — no manager role required. */
  my(params: { weekStart?: string; from?: string; to?: string } = {}) {
    const p = new URLSearchParams();
    if (params.weekStart) p.set('weekStart', params.weekStart);
    if (params.from)      p.set('from',      params.from);
    if (params.to)        p.set('to',        params.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<WorkSchedule[]>(`/api/schedules/my${qs}`);
  },

  /**
   * Read-only publish-readiness check for a department+month.
   *   changedFromPublished — draft records exist; Publish button should be enabled.
   *   alreadyPublished     — all records are published; button should show "เผยแพร่แล้ว".
   *   Both false           — no saved records; nothing to publish yet.
   */
  publishStatus(params: { departmentId: string; month: string }) {
    const p = new URLSearchParams();
    p.set('departmentId', params.departmentId);
    p.set('month',        params.month);
    return apiFetch<{ scheduleChanged: boolean; extraWorkChanged: boolean; changedFromPublished: boolean; alreadyPublished: boolean }>(
      `/api/schedules/publish-status?${p}`
    );
  },

  /**
   * Publish all draft records for a department+month, making them visible to employees.
   * Blocked by the backend when department.requireHrApproval === true and actor is a manager.
   */
  publishSchedule(params: { departmentId: string; month: string }) {
    return apiFetch<ScheduleDayRecord[]>('/api/schedules/publish', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Resolved calendar for a specific employee — manager view.
   *
   * Identical shape to myCalendar() but:
   *   • Accepts any userId (not just the caller's own).
   *   • Includes DRAFT shift records so OT validation blocks against shifts
   *     that have been assigned but not yet published.
   *
   * Fetch once per (employeeId, month) pair and cache in state.
   * Cache must be invalidated after schedule publish.
   */
  employeeCalendar(params: { userId: string; month: string }) {
    const p = new URLSearchParams();
    p.set('userId', params.userId);
    p.set('month',  params.month);
    return apiFetch<ResolvedCalendarDay[]>(`/api/schedules/employee-calendar?${p}`);
  },

  /**
   * Returns the main working-time ranges for a given employee on a specific date.
   * Used by the ExtraWorkModal to disable time slots that overlap main working time.
   * Returns { ranges: [] } when the employee has no schedule / is off that day.
   */
  workingTime(params: { userId: string; date: string }) {
    const p = new URLSearchParams();
    p.set('userId', params.userId);
    p.set('date',   params.date);
    return apiFetch<{ ranges: { start: string; end: string }[] }>(
      `/api/schedules/working-time?${p}`
    );
  },

  remove(id: string) {
    return apiFetch<void>(`/api/schedules/${id}`, { method: 'DELETE' });
  },

  // ── Date-based API (authoritative save/load for the schedule grid) ───────────

  /** Save exactly the provided (userId, date) cells — no week reconstruction. */
  upsertDays(days: ScheduleDayUpsertDto[]) {
    return apiFetch<ScheduleDayRecord[]>('/api/schedules/days', {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
  },

  /** Load saved cells for a department and date range. */
  listDays(f: { departmentId?: string; from?: string; to?: string } = {}) {
    const p = new URLSearchParams();
    if (f.departmentId) p.set('departmentId', f.departmentId);
    if (f.from)         p.set('from', f.from);
    if (f.to)           p.set('to',   f.to);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<ScheduleDayRecord[]>(`/api/schedules/days${qs}`);
  },
};
