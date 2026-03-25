import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkSchedulePattern, WorkSchedulePatternShift, User, Department, ScheduleDay, ExtraWork, ExtraWorkReason, HolidayDate } from '@hospital-hr/shared';
import { ROLE_LEVEL } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { useAuth } from '../../context/AuthContext';
import { scheduleApi, type ScheduleDayDto, type UpsertWeekDto, type ScheduleDayRecord, type ScheduleDayUpsertDto } from '../../api/schedules';
import { workSchedulePatternApi } from '../../api/subRoles';
import { employeeApi } from '../../api/employees';
import { deptApi } from '../../api/departments';
import { extraWorkApi, type CreateExtraWorkDto, type UpdateExtraWorkDto } from '../../api/extraWork';
import { holidaysApi } from '../../api/holidays';
import { invalidateScheduleCache } from '../../modules/schedule/scheduleInvalidator';
import {
  computeAllowedTimeRanges,
  NO_START_END_SLOTS,
} from '../../modules/schedule/timeRangeEngine';
import {
  addDays,
  normalizeHhmm,
  type TimeRange,
} from '../../modules/schedule/rangeEngine';
import { buildEmployeeBusyTimeline } from '../../modules/scheduling/availabilityEngine';
import { serializeUiTime, displayUiEndTime } from '../../modules/schedule/timeUiAdapter';
import type { ResolvedCalendarDay } from '../../api/schedules';
import { ScheduleCell } from '../../components/schedule/ScheduleCell';
import { PageSpinner } from '../../components/Spinner';
import { getWeekStart, getWeekDates, toLocalIso } from '../../utils/date/getWeekStart';
import { TimePicker } from '../../components/ui/TimePicker';


/** Normalize a ScheduleDayDto so exactly ONE of shiftCode / shiftCodes is present. */
function normalizeDay(day: ScheduleDayDto): ScheduleDayDto {
  if (day.shiftCodes && day.shiftCodes.length > 1) {
    // Multi-shift: send shiftCodes only
    const { shiftCode: _sc, ...rest } = day;
    void _sc;
    return rest as ScheduleDayDto;
  }
  if (day.shiftCodes && day.shiftCodes.length === 1) {
    // Single item in array: flatten to scalar shiftCode
    return { ...day, shiftCode: day.shiftCodes[0], shiftCodes: undefined };
  }
  // No shiftCodes array: return as-is (shiftCode may be null for day-off / clear)
  return { ...day, shiftCodes: undefined };
}

/**
 * Merge a new shift code into an existing day, preventing duplicates.
 * - 1 resulting code  → { shiftCode }
 * - 2+ resulting codes → { shiftCodes }
 * - Always sets isDayOff: false (callers must NOT call this for day-off / clear)
 */
function mergeShift(
  existing: ScheduleDayDto | undefined,
  newShift: string
): ScheduleDayDto {
  const current: ScheduleDayDto = existing
    ? structuredClone(existing)
    : { shiftCode: null, isDayOff: false };

  let codes: string[] = [];
  if (current.shiftCodes && current.shiftCodes.length > 0) {
    codes = [...current.shiftCodes];
  } else if (current.shiftCode) {
    codes = [current.shiftCode];
  }

  if (!codes.includes(newShift)) {
    codes.push(newShift);
  }

  if (codes.length === 1) {
    return { shiftCode: codes[0], isDayOff: false };
  }
  // Multi-shift: shiftCodes is the source of truth; shiftCode holds the primary for compat
  return { shiftCode: codes[0], shiftCodes: codes, isDayOff: false };
}

/**
 * 🔒 SCHEDULE WRITE LOCK
 *
 * NEVER write to draft.days directly for shift-code assignment.
 * ALWAYS use assignShiftToDraft().
 *
 * This prevents overwrite bugs between click assignment and drag assignment.
 */
function assignShiftToDraft(
  draft: UpsertWeekDto,
  date: string,
  shiftCode: string
): void {
  console.log('ASSIGN BEFORE', draft.days[date]);
  draft.days[date] = mergeShift(draft.days[date], shiftCode);
  console.log('ASSIGN AFTER', draft.days[date]);
}

/**
 * Pure immutable engine — applies one or more cell assignments to a draft map.
 *
 * Write routing:
 *   isDayOff | shiftCode=null       → normalizeDay overwrite  (day-off / clear)
 *   shiftCodes array present        → normalizeDay overwrite  (modal exact-list)
 *   single shiftCode (no array)     → assignShiftToDraft       (paint / drag MERGE)
 *
 * Defined OUTSIDE the component so it is safe to call from useEffect([]) closures.
 */
function applyShiftsToDraft(
  prev: Map<string, UpsertWeekDto>,
  cells: Array<{ userId: string; date: string }>,
  dto: ScheduleDayDto,
  flat: Record<string, Record<string, ScheduleDay>>
): Map<string, UpsertWeekDto> {
  const next = new Map(prev);
  for (const { userId, date } of cells) {
    console.debug('applyShiftsToDraft', { userId, date, shiftCode: dto.shiftCode, shiftCodes: dto.shiftCodes, isDayOff: dto.isDayOff });
    const weekStart = getWeekStart(date);
    const weekKey   = `${userId}::${weekStart}`;
    // structuredClone guarantees no shared-reference mutation across cells
    const week = structuredClone(next.get(weekKey) ?? seedWeek(userId, weekStart, flat));

    if (dto.isDayOff) {
      // Explicit day-off — intentional overwrite
      week.days[date] = normalizeDay(dto);
    } else if (dto.shiftCodes && dto.shiftCodes.length > 0) {
      // Exact code list from modal checkbox picker — takes priority over shiftCode===null
      week.days[date] = normalizeDay(dto);
    } else if (dto.shiftCode === null) {
      // Clear (no codes, no day-off) — intentional overwrite
      week.days[date] = normalizeDay(dto);
    } else {
      // Single code from paint-mode click or drag — merge via write lock (dedup, no overwrite)
      assignShiftToDraft(week, date, dto.shiftCode);
    }

    next.set(weekKey, week);
  }
  return next;
}

/**
 * Build a complete UpsertWeekDto pre-populated from already-loaded schedule data.
 * Called once the first time a user touches a cell in a given week, so the payload
 * always contains ALL days for that week — not just the one being changed.
 */
function seedWeek(
  userId: string,
  weekStart: string,
  flat: Record<string, Record<string, ScheduleDay>>
): UpsertWeekDto {
  const days: Record<string, ScheduleDayDto> = {};
  for (const d of getWeekDates(weekStart)) {
    const existing = flat[userId]?.[d];
    // Only seed days that have a real assignment — skip null-shift non-dayOff entries
    if (existing && (existing.isDayOff || existing.shiftCode !== null || (existing.shiftCodes?.length ?? 0) > 0)) {
      days[d] = normalizeDay({
        shiftCode:  existing.shiftCode ?? null,
        shiftCodes: existing.shiftCodes ?? (existing.shiftCode ? [existing.shiftCode] : []),
        isDayOff:   existing.isDayOff,
      });
    }
  }
  return { userId, weekStart, days };
}

/** Returns all YYYY-MM-DD strings for every day of the given month (YYYY-MM). */
function getMonthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  );
}

const TH_DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Extract the effective list of shift codes from a cell value */
function getCodes(cell: ScheduleDay | ScheduleDayDto | null): string[] {
  if (!cell || cell.isDayOff) return [];
  if (cell.shiftCodes && cell.shiftCodes.length > 0) return cell.shiftCodes;
  return cell.shiftCode ? [cell.shiftCode] : [];
}

// ─── Cell badge ────────────────────────────────────────────────────────────────

function CellBadge({
  cell,
  isPending,
  shifts = [],
  date,
}: {
  cell:      ScheduleDay | ScheduleDayDto | null;
  isPending: boolean;
  /** Department shift definitions — used to sort badges by startTime ascending. */
  shifts?:   WorkSchedulePatternShift[];
  /** Calendar date (YYYY-MM-DD) — enables absolute-time sort order. */
  date?:     string;
}) {
  if (!cell) return <span className="text-xs text-gray-200">—</span>;

  if (cell.isDayOff) {
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
        isPending ? 'bg-amber-200 text-amber-700' : 'bg-gray-100 text-gray-500'
      }`}>
        หยุด
      </span>
    );
  }

  const codes = getCodes(cell);
  if (codes.length === 0) return <span className="text-xs text-gray-200">—</span>;

  // Sort by absolute start time using normalizeHhmm so cross-midnight shifts
  // always appear after same-day shifts (e.g. N 20:00→04:00 sorts after D 08:00).
  const shiftMap = new Map(shifts.map((s) => [s.code, s]));
  function sortValue(code: string): number {
    const s = shiftMap.get(code);
    if (!s) return 0;
    if (date) {
      return normalizeHhmm(date, s.startTime, s.endTime, 'SHIFT').start.getTime();
    }
    // Fallback when date is unknown — heuristic identical to absolute sort.
    const [h, m] = s.startTime.split(':').map(Number);
    return h * 60 + m + (s.isOvernight ? 1440 : 0);
  }
  const sorted = [...codes].sort((a, b) => sortValue(a) - sortValue(b));

  const badgeClass = isPending
    ? 'bg-amber-200 text-amber-700'
    : 'bg-primary-100 text-primary-700';

  return (
    <span className="flex flex-wrap items-center justify-center gap-0.5">
      {sorted.map((code) => (
        <span key={code} className={`rounded px-1 py-0.5 text-xs font-bold leading-tight ${badgeClass}`}>
          {code}
        </span>
      ))}
    </span>
  );
}

// ─── Shift picker modal (multi-select checkbox) ────────────────────────────────

function ShiftPickerModal({
  date,
  subRole,
  currentCodes,
  onSelect,
  onClose,
  onAddExtraWork,
}: {
  date:             string;
  subRole:          WorkSchedulePattern | null;
  currentCodes:     string[];
  onSelect:         (dto: ScheduleDayDto) => void;
  onClose:          () => void;
  onAddExtraWork:   () => void;
}) {
  const [selected, setSelected] = useState<string[]>(currentCodes);

  const d = new Date(date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  function toggle(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  function handleConfirm() {
    if (selected.length === 0) return;
    onSelect({
      shiftCode:  selected[0],
      shiftCodes: selected,
      isDayOff:   false,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-0.5 text-sm font-semibold text-gray-900">เลือกกะ</h2>
        <p className="mb-4 text-xs text-gray-400">{dateLabel}</p>

        {/* Shift checkboxes */}
        {subRole ? (
          <div className="mb-3 space-y-1.5">
            {subRole.shifts.map((shift) => {
              const checked = selected.includes(shift.code);
              return (
                <label
                  key={shift.code}
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors',
                    checked
                      ? 'border-primary-400 bg-primary-50'
                      : 'border-gray-200 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(shift.code)}
                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                  />
                  <span className="min-w-[2rem] rounded bg-primary-600 px-1.5 py-0.5 text-center text-xs font-bold text-white">
                    {shift.code}
                  </span>
                  <span className="flex-1 text-sm text-gray-800">{shift.nameTh}</span>
                  <span className="text-xs text-gray-400">{shift.startTime}–{shift.endTime}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mb-3 py-2 text-center text-xs text-gray-400">พนักงานไม่มีรูปแบบเวลาการทำงาน</p>
        )}

        {/* Confirm multi-select */}
        <button
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className="mb-2 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
        >
          ยืนยัน {selected.length > 0 ? `(${selected.length} กะ)` : ''}
        </button>

        <div className="flex gap-2">
          {/* Day off */}
          <button
            onClick={() => onSelect({ shiftCode: null, shiftCodes: [], isDayOff: true })}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            วันหยุด
          </button>
          {/* Clear */}
          <button
            onClick={() => onSelect({ shiftCode: null, shiftCodes: [], isDayOff: false })}
            className="flex-1 rounded-xl border border-gray-100 py-2 text-xs text-gray-400 hover:bg-gray-50"
          >
            ล้างค่า
          </button>
        </div>

        {/* ── Extra work section ── */}
        <div className="my-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-[11px] text-gray-400">หรือ</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <button
          onClick={onAddExtraWork}
          className="mb-2 w-full rounded-xl border border-dashed border-emerald-400 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          + สร้างเวลางานเพิ่มเติม
        </button>

        <button
          onClick={onClose}
          className="w-full rounded-xl border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

// ─── Extra Work badge ──────────────────────────────────────────────────────────

function ExtraWorkBadge({ ew, onClick }: { ew: ExtraWork; onClick: () => void }) {
  const labelMap: Record<ExtraWorkReason, string> = {
    ot: 'OT', compensate: 'ชด', training: 'อบ', meeting: 'ปร', other: 'พิเศษ',
  };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${ew.startTime}–${ew.endTime} (${ew.customReason ?? labelMap[ew.reason]})`}
      className="mt-0.5 w-full rounded border border-dashed border-emerald-400 bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 leading-tight"
    >
      {labelMap[ew.reason]} {ew.startTime}–{ew.endTime}
    </button>
  );
}

// ─── Extra Work Modal ──────────────────────────────────────────────────────────

const EXTRA_WORK_REASONS: { value: ExtraWorkReason; labelTh: string }[] = [
  { value: 'ot',         labelTh: 'ทำงานล่วงเวลา (OT)' },
  { value: 'compensate', labelTh: 'ชดเชยวันทำงาน' },
  { value: 'training',   labelTh: 'อบรม' },
  { value: 'meeting',    labelTh: 'ประชุม' },
  { value: 'other',      labelTh: 'อื่นๆ' },
];

function ExtraWorkModal({
  departmentId,
  employees,
  extraWorks,
  initial,
  defaultEmployeeId = '',
  defaultDate       = '',
  onSave,
  onDelete,
  onClose,
}: {
  departmentId:      string;
  employees:         User[];
  /** All extra-work entries for this department+month — used for overlap detection. */
  extraWorks:        ExtraWork[];
  initial:           ExtraWork | null;   // null = create mode
  defaultEmployeeId?: string;            // pre-fill when creating from a cell
  defaultDate?:       string;            // pre-fill when creating from a cell
  onSave:            (dto: CreateExtraWorkDto | (UpdateExtraWorkDto & { id: string })) => Promise<void>;
  onDelete:          (id: string) => Promise<void>;
  onClose:           () => void;
}) {
  const [employeeId,    setEmployeeId]    = useState(initial?.employeeId ?? defaultEmployeeId);
  const [date,          setDate]          = useState(initial?.date       ?? defaultDate);
  const [startTime,     setStartTime]     = useState(initial?.startTime    ?? '');
  const [endTime,       setEndTime]       = useState(initial?.endTime ? displayUiEndTime(initial.endTime) : '');
  const [reason,        setReason]        = useState<ExtraWorkReason>(initial?.reason ?? 'ot');
  const [customReason,  setCustomReason]  = useState(initial?.customReason ?? '');
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [error,         setError]         = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * One month of resolved calendar days for the selected employee.
   * Fetched once per (uid + month) — includes DRAFT shift records so
   * OT validation blocks against shifts the manager has assigned but
   * not yet published.  Re-fetched automatically when uid or month changes.
   */
  const [resolvedCalendar, setResolvedCalendar] = useState<ResolvedCalendarDay[]>([]);

  useEffect(() => {
    const uid   = employeeId || initial?.employeeId;
    const month = date ? date.slice(0, 7) : '';   // YYYY-MM from YYYY-MM-DD
    if (!uid || !month) { setResolvedCalendar([]); return; }

    // Fetch boundary days so cross-midnight shifts at the start/end of the
    // month are included in buildEmployeeBusyTimeline.
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const fetchFrom = addDays(`${month}-01`,                                  -1);
    const fetchTo   = addDays(`${month}-${String(lastDay).padStart(2, '0')}`, +1);

    let cancelled = false;
    scheduleApi.employeeCalendar({ userId: uid, month, from: fetchFrom, to: fetchTo })
      .then((days) => { if (!cancelled) setResolvedCalendar(days); })
      .catch(() => { if (!cancelled) setResolvedCalendar([]); });
    return () => { cancelled = true; };
  }, [employeeId, date, initial?.employeeId]);

  /**
   * Employee's complete busy timeline — all shifts + all OT entries (excl. self),
   * as merged absolute TimeRange[].
   *
   * buildEmployeeBusyTimeline:
   *   • Converts every resolved day's shifts to absolute TimeRanges via normalizeHhmm.
   *   • Cross-midnight shifts naturally extend into the next calendar day —
   *     no sliceRangeByDay or prevDay injection needed.
   *   • OT entries are anchored to their own date; cross-date conflicts are handled
   *     by the same absolute-overlap math.
   *
   * Future leave: add leave ranges inside buildEmployeeBusyTimeline params when ready.
   */
  const busyTimeline = useMemo<TimeRange[]>(
    () => buildEmployeeBusyTimeline({
      resolvedDays: resolvedCalendar,
      extraWorks:   extraWorks.filter(
        (ew) =>
          ew.employeeId === (employeeId || initial?.employeeId) &&
          ew.id !== initial?.id
      ),
    }),
    [resolvedCalendar, extraWorks, employeeId, initial?.employeeId, initial?.id]
  );

  /** Engine instance — recomputed only when date or busy timeline changes. */
  const engine = useMemo(
    () => computeAllowedTimeRanges(date, busyTimeline),
    [date, busyTimeline]
  );

  /** End-slot list for the current startTime — updates on every startTime change. */
  const currentEndSlots = useMemo(
    () => (startTime ? engine.endSlots(startTime) : NO_START_END_SLOTS),
    [engine, startTime]
  );

  /**
   * Change startTime; when the existing endTime becomes invalid, clear it and
   * auto-suggest the nearest valid end slot.
   */
  function handleStartTimeChange(newStart: string) {
    setStartTime(newStart);
    const candidateEndSlots = engine.endSlots(newStart);
    const currentEndStillValid =
      endTime && !candidateEndSlots.find((s) => s.value === endTime)?.disabled;
    if (!currentEndStillValid) {
      const firstValid = candidateEndSlots.find((s) => !s.disabled);
      setEndTime(firstValid?.value ?? '');
    }
  }

  const isEdit = initial !== null;

  /** Pure duration calculator that understands the "24:00" display sentinel. */
  function otDuration(start: string, end: string): string | null {
    if (!start || !end) return null;
    const [sh, sm] = start.split(':').map(Number);
    const endH     = end === '24:00' ? 24 : Number(end.split(':')[0]);
    const endM     = end === '24:00' ?  0 : Number(end.split(':')[1]);
    if ([sh, sm, endH, endM].some(isNaN)) return null;
    const diff = (endH * 60 + endM) - (sh * 60 + sm);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return [h > 0 && `${h} ชม.`, m > 0 && `${m} นาที`].filter(Boolean).join(' ');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!employeeId) { setError('กรุณาเลือกพนักงาน'); return; }
    if (!date)       { setError('กรุณาระบุวันที่');    return; }
    if (!startTime || !endTime) { setError('กรุณาระบุเวลาเริ่มต้นและสิ้นสุด'); return; }
    if (startTime >= endTime)   { setError('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น'); return; }
    if (reason === 'other' && !customReason.trim()) { setError('กรุณาระบุรายละเอียด'); return; }

    setSaving(true);
    try {
      const endNextDay = endTime === '24:00';
      const apiEndTime = serializeUiTime(endTime);
      if (isEdit) {
        await onSave({
          id: initial.id,
          date, startTime, endTime: apiEndTime, endNextDay, reason,
          customReason: reason === 'other' ? customReason.trim() : undefined,
        });
      } else {
        await onSave({
          employeeId, departmentId, date, startTime, endTime: apiEndTime, endNextDay, reason,
          customReason: reason === 'other' ? customReason.trim() : undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    setDeleting(true);
    try {
      await onDelete(initial.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {isEdit ? 'แก้ไขเวลางานเพิ่มเติม' : 'สร้างเวลางานเพิ่มเติม'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Employee — only in create mode */}
          {!isEdit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">พนักงาน</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
                required
              >
                <option value="">— เลือกพนักงาน —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstNameTh} {emp.lastNameTh}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">วันที่</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
              required
            />
          </div>

          {/* Time range */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">เวลาเริ่มต้น</label>
              <TimePicker
                value={startTime}
                onChange={handleStartTimeChange}
                className="w-full"
                required
                slots={engine.startSlots}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-700">เวลาสิ้นสุด</label>
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                className="w-full"
                required
                slots={currentEndSlots}
              />
            </div>
          </div>
          {/* Duration preview */}
          {otDuration(startTime, endTime) && (
            <p className="text-xs text-primary-600">
              ⏱ รวม {otDuration(startTime, endTime)}
            </p>
          )}
          {/* Show blocked working-time info from resolved calendar */}
          {(() => {
            const day = resolvedCalendar.find((d) => d.date === date);
            if (!day || day.isDayOff) return null;
            const ranges: { label: string }[] = [];
            if (day.weeklyTime && !day.isDayOff) {
              ranges.push({ label: `${day.weeklyTime.startTime}–${day.weeklyTime.endTime}` });
            }
            day.shifts.forEach((s) => {
              if (s.startTime && s.endTime) ranges.push({ label: `${s.startTime}–${s.endTime}` });
            });
            if (ranges.length === 0) return null;
            return (
              <p className="text-xs text-amber-600">
                ⚠ ช่วงเวลางานหลัก{' '}
                {ranges.map((r, i) => (
                  <span key={i}>{r.label}{i < ranges.length - 1 ? ', ' : ''}</span>
                ))}{' '}
                — ตัวเลือกในช่วงนั้นถูกปิดไว้
              </p>
            );
          })()}

          {/* Reason */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">เหตุผล</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ExtraWorkReason)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            >
              {EXTRA_WORK_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.labelTh}</option>
              ))}
            </select>
          </div>

          {/* Custom reason (when 'other') */}
          {reason === 'other' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">ระบุรายละเอียด</label>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="ระบุเหตุผล..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
          </div>

          {/* Delete button — edit mode only */}
          {isEdit && (
            confirmDelete ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40"
                >
                  {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50"
              >
                ลบรายการนี้
              </button>
            )
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Holiday cell components ───────────────────────────────────────────────────

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManager  = user?.role === 'manager';
  const isHRRole   = user ? ROLE_LEVEL[user.role] >= 4 : false;

  // ── State ──────────────────────────────────────────────────────────────────
  const [month,       setMonth]       = useState(() => toLocalIso(new Date()).slice(0, 7));
  const [deptId,      setDeptId]      = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees,   setEmployees]   = useState<User[]>([]);
  const [subRoles,    setSubRoles]    = useState<WorkSchedulePattern[]>([]);
  const [schedules,   setSchedules]   = useState<ScheduleDayRecord[]>([]);

  /** Complete week records being edited: `userId::weekStart` → UpsertWeekDto (single source of truth) */
  const [draftWeeks,   setDraftWeeks]   = useState<Map<string, UpsertWeekDto>>(new Map());
  /** Cells the user has manually touched — drives the amber highlight + pending count */
  const [touchedCells, setTouchedCells] = useState<Set<string>>(new Set());

  const [subRoleFilter, setSubRoleFilter] = useState('');

  /** Holiday dates for the selected department's holiday policy (enabled only). */
  const [holidayDates, setHolidayDates] = useState<HolidayDate[]>([]);

  /** Active paint-mode shift — when set, clicking a cell stamps it immediately */
  const [activeShift, setActiveShift] = useState<ScheduleDayDto | null>(null);

  const [editCell, setEditCell] = useState<{ userId: string; date: string } | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');

  const today = useMemo(() => toLocalIso(new Date()), []);

  // ── Publish state ──────────────────────────────────────────────────────────
  const [publishing,   setPublishing]   = useState(false);
  const [publishMsg,   setPublishMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * Publish-readiness from the backend.
   *   changedFromPublished  — there are saved draft rows; Publish should be enabled.
   *   alreadyPublished      — nothing new to publish; button shows "เผยแพร่แล้ว".
   *   null                  — not yet loaded (dept/month not selected, or loading).
   */
  const [publishStatus, setPublishStatus] = useState<{
    scheduleChanged:      boolean;
    extraWorkChanged:     boolean;
    changedFromPublished: boolean;
    alreadyPublished:     boolean;
  } | null>(null);

  // ── Extra work ─────────────────────────────────────────────────────────────
  const [extraWorks,        setExtraWorks]        = useState<ExtraWork[]>([]);
  const [ewEdit,            setEwEdit]            = useState<ExtraWork | null>(null); // null = create
  const [showEWModal,       setShowEWModal]        = useState(false);
  const [ewPrefillEmployee, setEwPrefillEmployee]  = useState('');
  const [ewPrefillDate,     setEwPrefillDate]      = useState('');

  // ── Drag-to-assign state ────────────────────────────────────────────────────
  /** Keys of cells highlighted while dragging: `${userId}::${date}` */
  const [dragCells, setDragCells] = useState<Set<string>>(new Set());

  /** True once the pointer has entered a second cell after mousedown */
  const isDraggingRef   = useRef(false);
  /** Set on mousedown; allows the first mouseenter to include the origin cell */
  const dragStartKeyRef = useRef<string | null>(null);
  /** Mirrors activeShift so the stable global mouseup handler can read it */
  const activeShiftRef  = useRef<ScheduleDayDto | null>(null);
  /** Set for one tick after a drag completes to suppress the spurious onClick */
  const justDraggedRef  = useRef(false);
  /** Long-press timer for mobile drag */
  const longPressRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True once long-press threshold is reached on mobile */
  const touchDragRef    = useRef(false);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  /** Visual status driven by the auto-save effect below. */
  const [draftSaveStatus, setDraftSaveStatus] =
    useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  /** Debounce timer — cleared on every new mutation or unmount. */
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Always points to the latest `handleSave`.
   * The timer callback reads this ref so it never captures a stale closure.
   * Updated by a bare useEffect (no deps) that runs after every render.
   */
  const handleSaveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));

  // ── Derived ────────────────────────────────────────────────────────────────

  const monthDays = useMemo(() => getMonthDays(month), [month]);

  /** Flat map: userId → date → ScheduleDay (from loaded schedules).
   *  Every day is normalised on ingest so shiftCodes is ALWAYS a populated
   *  array — regardless of whether the stored record predates multi-shift support
   *  or arrived with only a scalar shiftCode. */
  const flatSchedule = useMemo(() => {
    const flat: Record<string, Record<string, ScheduleDay>> = {};
    for (const r of schedules) {
      if (!flat[r.userId]) flat[r.userId] = {};
      flat[r.userId][r.date] = {
        shiftCode:  r.shiftCode,
        shiftCodes: r.shiftCodes.length > 0 ? r.shiftCodes : undefined,
        isDayOff:   r.isDayOff,
      };
    }
    return flat;
  }, [schedules]);

  /** Stable ref so the drag handler (mounted once, [] deps) can read fresh flatSchedule */
  const flatScheduleRef = useRef<Record<string, Record<string, ScheduleDay>>>({});
  useEffect(() => { flatScheduleRef.current = flatSchedule; }, [flatSchedule]);

  const subRoleById = useMemo(
    () => Object.fromEntries(subRoles.map((sr) => [sr.id, sr])),
    [subRoles]
  );

  /** The currently selected Department record (null when no dept is selected). */
  const selectedDept = useMemo<Department | null>(
    () => departments.find((d) => d.id === deptId) ?? null,
    [departments, deptId]
  );

  /**
   * True when HR must approve before schedules are visible to employees.
   * When true: Save stores as draft only; Publish button is disabled for managers.
   * HR approval (via the pending-approvals panel) is the only publish path.
   */
  const requiresHrApproval = selectedDept?.requireHrApproval ?? false;

  /**
   * The single work schedule pattern assigned to the selected department.
   * Source of truth: department.workSchedulePatternId only.
   * No fallback to employee-level patterns (avoids cross-department shift leakage).
   */
  const deptPattern = useMemo<WorkSchedulePattern | null>(() => {
    const patternId = selectedDept?.workSchedulePatternId;
    if (!patternId) return null;
    return subRoles.find((sr) => sr.id === patternId) ?? null;
  }, [selectedDept, subRoles]);

  /** True when the department uses a WEEKLY_WORKING_TIME pattern — shift painting is not applicable. */
  const isWeeklyPattern = (deptPattern?.type ?? 'SHIFT_TIME') === 'WEEKLY_WORKING_TIME';

  /** Kept for backward compat (subRoleFilter dropdown). Single-element or empty. */
  const deptSubRoles = useMemo(
    () => (deptPattern ? [deptPattern] : []),
    [deptPattern]
  );

  /** Shift buttons for the paint toolbar — only from the department's SHIFT_TIME pattern. */
  const allDeptShifts = useMemo<WorkSchedulePatternShift[]>(
    () => (!deptPattern || isWeeklyPattern ? [] : deptPattern.shifts),
    [deptPattern, isWeeklyPattern]
  );

  /** extraWorkMap[employeeId][date] = ExtraWork[] */
  const extraWorkMap = useMemo(() => {
    const map: Record<string, Record<string, ExtraWork[]>> = {};
    for (const ew of extraWorks) {
      if (!map[ew.employeeId]) map[ew.employeeId] = {};
      if (!map[ew.employeeId][ew.date]) map[ew.employeeId][ew.date] = [];
      map[ew.employeeId][ew.date].push(ew);
    }
    return map;
  }, [extraWorks]);

  /** MM-DD → HolidayDate (enabled only). Used for fast holiday lookups in cell rendering. */
  const holidayByMmdd = useMemo<Map<string, HolidayDate>>(() => {
    const map = new Map<string, HolidayDate>();
    for (const hd of holidayDates) {
      if (hd.enabled) map.set(hd.date, hd);
    }
    return map;
  }, [holidayDates]);

  /** Employees visible in the grid after work schedule pattern filter */
  const visibleEmployees = useMemo(
    () => subRoleFilter ? employees.filter((e) => e.workSchedulePatternId === subRoleFilter) : employees,
    [employees, subRoleFilter]
  );

  const hasPending   = touchedCells.size > 0;
  const pendingCount = touchedCells.size;

  // ── Cell value (pending overrides loaded) ─────────────────────────────────

  function getCellValue(
    userId: string,
    date: string
  ): ScheduleDay | ScheduleDayDto | null {
    const weekKey = `${userId}::${getWeekStart(date)}`;
    const draft = draftWeeks.get(weekKey);
    if (draft?.days[date] !== undefined) return draft.days[date];
    return flatSchedule[userId]?.[date] ?? null;
  }

  // ── Load static data ───────────────────────────────────────────────────────

  useEffect(() => {
    deptApi.list({ pageSize: 200 }).then((r) => {
      if (isManager) {
        const allowedIds = new Set(user?.managerDepartments ?? []);
        setDepartments(r.items.filter((d) => allowedIds.has(d.id)));
      } else {
        setDepartments(r.items);
      }
    }).catch(() => {});
    workSchedulePatternApi.list().then(setSubRoles).catch(() => {});
  }, [isManager, user?.managerDepartments]);

  // Load employees when dept changes; reset filters and paint mode
  useEffect(() => {
    setSubRoleFilter('');
    setActiveShift(null);
    if (!deptId) { setEmployees([]); return; }
    employeeApi
      .list({ departmentId: deptId, isActive: true, pageSize: 200 })
      .then((r) => setEmployees(r.items))
      .catch(() => {});
  }, [deptId]);

  // Load holiday dates when the selected dept's holiday policy changes
  useEffect(() => {
    const typeId = selectedDept?.holidayTypeId;
    if (!typeId) { setHolidayDates([]); return; }
    holidaysApi.listDates(typeId).then(setHolidayDates).catch(() => setHolidayDates([]));
  }, [selectedDept?.holidayTypeId]);

  // ── Keep activeShiftRef in sync ────────────────────────────────────────────
  useEffect(() => { activeShiftRef.current = activeShift; }, [activeShift]);

  // ── Global drag-end handler ─────────────────────────────────────────────────
  useEffect(() => {
    function applyDrag() {
      const shift = activeShiftRef.current;
      setDragCells((prev) => {
        if (shift && prev.size > 0) {
          justDraggedRef.current = true;
          setTimeout(() => { justDraggedRef.current = false; }, 0);

          // Collect cells before entering nested setters
          const cells: Array<{ userId: string; date: string }> = [];
          for (const key of prev) {
            const sep = key.lastIndexOf('::');
            cells.push({ userId: key.slice(0, sep), date: key.slice(sep + 2) });
          }

          setDraftWeeks((draftPrev) =>
            applyShiftsToDraft(draftPrev, cells, shift, flatScheduleRef.current)
          );

          setTouchedCells((touchedPrev) => {
            const next = new Set(touchedPrev);
            for (const { userId, date } of cells) next.add(`${userId}::${date}`);
            return next;
          });
        }
        return new Set<string>();
      });
      isDraggingRef.current   = false;
      dragStartKeyRef.current = null;
    }

    function onMouseUp() {
      if (!isDraggingRef.current && !dragStartKeyRef.current) return;
      applyDrag();
    }

    function onTouchEnd() {
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
      if (touchDragRef.current) {
        touchDragRef.current = false;
        applyDrag();
      }
    }

    window.addEventListener('mouseup',  onMouseUp);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mouseup',  onMouseUp);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // stable: only refs + stable setters used inside

  // ── Load extra works ───────────────────────────────────────────────────────

  const loadExtraWorks = useCallback(async () => {
    if (!deptId) { setExtraWorks([]); return; }
    const days = getMonthDays(month);
    try {
      const res = await extraWorkApi.list({
        departmentId: deptId,
        from: days[0],
        to:   days[days.length - 1],
      });
      setExtraWorks(res);
    } catch { /* ignore */ }
  }, [deptId, month]);

  useEffect(() => { loadExtraWorks(); }, [loadExtraWorks]);

  // ── Load schedules ─────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async () => {
    if (!deptId) { setSchedules([]); return; }
    const days = getMonthDays(month);
    setLoading(true);
    try {
      const res = await scheduleApi.listDays({
        departmentId: deptId,
        from: days[0],
        to:   days[days.length - 1],
      });
      setSchedules(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [deptId, month]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // ── Publish status — re-fetched whenever dept/month change, after save, after publish ──

  const fetchPublishStatus = useCallback(async () => {
    if (!deptId) { setPublishStatus(null); return; }
    try {
      const status = await scheduleApi.publishStatus({ departmentId: deptId, month });
      setPublishStatus(status);
    } catch {
      setPublishStatus(null);
    }
  }, [deptId, month]);

  useEffect(() => { fetchPublishStatus(); }, [fetchPublishStatus]);

  // ── beforeunload — warn if there are unsaved changes ─────────────────────
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!hasPending && !showEWModal) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasPending, showEWModal]);

  // ── Keep handleSaveRef current (no deps — intentional, runs after every render) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ── Auto-save: debounce 600 ms after the last cell mutation ──────────────
  useEffect(() => {
    if (touchedCells.size === 0) {
      // Nothing pending — clear any queued timer (e.g. after Cancel or successful save).
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    // Reset timer on every new mutation (debounce).
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setDraftSaveStatus('pending');

    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      setDraftSaveStatus('saving');
      const ok = await handleSaveRef.current();
      setDraftSaveStatus(ok ? 'saved' : 'error');
      if (ok) setTimeout(() => setDraftSaveStatus('idle'), 2500);
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  // touchedCells is the only trigger; handleSave is accessed via ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchedCells]);

  // ── Publish schedule — marks all draft records as published ──────────────

  async function handlePublish() {
    if (!deptId || hasPending || showEWModal) return;
    setPublishing(true);
    setPublishMsg(null);
    try {
      const updated = await scheduleApi.publishSchedule({ departmentId: deptId, month });
      // Notify mounted employee views (same tab) that published records are now visible.
      invalidateScheduleCache();
      setPublishMsg({ ok: true, text: `เผยแพร่ตารางงานแล้ว (${updated.length} รายการ)` });
      // Refresh grid + publish-status so button reflects the new state.
      await loadSchedules();
      await fetchPublishStatus();
    } catch (err) {
      setPublishMsg({ ok: false, text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setPublishing(false);
    }
  }

  // ── Apply a shift to a cell (used by paint mode and modal) ───────────────

  function applyShift(userId: string, date: string, dto: ScheduleDayDto) {
    if (isWeeklyPattern) {
      console.warn('applyShift blocked in GENERAL mode');
      return;
    }
    console.log('CLICK BEFORE', { userId, date, dto });
    setDraftWeeks((prev) => {
      const next = applyShiftsToDraft(prev, [{ userId, date }], dto, flatScheduleRef.current);
      const weekKey = `${userId}::${getWeekStart(date)}`;
      console.log('CLICK AFTER', next.get(weekKey)?.days[date]);
      return next;
    });
    setTouchedCells((prev) => new Set([...prev, `${userId}::${date}`]));
  }

  // ── Cell click: paint mode toggles one shift; otherwise open modal ─────────

  function handleCellClick(userId: string, date: string) {
    // Suppress the synthetic onClick that fires at the end of a drag
    if (justDraggedRef.current) return;

    if (isWeeklyPattern) {
      // No shift assignment for weekly-time depts — open extra work modal directly
      openEwFromCell(userId, date);
      return;
    }
    setSaveError('');
    if (activeShift !== null) {
      if (activeShift.isDayOff || activeShift.shiftCode === null) {
        // วันหยุด / ล้างค่า — intentional overwrite
        applyShift(userId, date, activeShift);
      } else {
        // Shift code paint — pass ONLY the single code so the merge engine
        // accumulates it into existing codes (D → click N → DN, no toggle-off).
        // DO NOT pre-compute the combined list here; that caused the overwrite bug
        // because applyShiftsToDraft would only use dto.shiftCode (the first code).
        applyShift(userId, date, { shiftCode: activeShift.shiftCode, isDayOff: false });
      }
    } else {
      setEditCell({ userId, date });
    }
  }

  // ── Modal shift selection ─────────────────────────────────────────────────

  function handleShiftSelect(dto: ScheduleDayDto) {
    if (!editCell) return;
    applyShift(editCell.userId, editCell.date, dto);
    setEditCell(null);
  }

  // ── Open EW modal from a cell (pre-fill employee + date) ─────────────────

  function openEwFromCell(userId: string, date: string) {
    setEditCell(null);          // close shift picker if open
    setEwEdit(null);            // create mode
    setEwPrefillEmployee(userId);
    setEwPrefillDate(date);
    setShowEWModal(true);
  }

  // ── Extra work handlers ────────────────────────────────────────────────────

  async function handleSaveExtraWork(
    dto: CreateExtraWorkDto | (UpdateExtraWorkDto & { id: string })
  ) {
    if ('id' in dto) {
      const { id, ...patch } = dto;
      await extraWorkApi.update(id, patch);
    } else {
      await extraWorkApi.create(dto);
    }
    await loadExtraWorks();
    setShowEWModal(false);
    setEwPrefillEmployee('');
    setEwPrefillDate('');
    await fetchPublishStatus();
  }

  async function handleDeleteExtraWork(id: string) {
    await extraWorkApi.remove(id);
    await loadExtraWorks();
    await fetchPublishStatus();
  }

  // ── Save all pending edits ─────────────────────────────────────────────────

  async function handleSave(): Promise<boolean> {
    if (!hasPending) return true;
    setSaving(true);
    setSaveError('');
    try {
      // Build payload from ONLY the cells the user explicitly touched.
      // Each entry is a flat (userId, date, shiftCodes, isDayOff) record —
      // no week merging, no extra days included.
      //
      // Cleared cells (shiftCodes=[], isDayOff=false) ARE included — the backend
      // treats them as a DELETE signal and removes the existing record.
      // Do NOT skip them here; skipping them would leave stale data in the DB.
      const payload: ScheduleDayUpsertDto[] = [];
      // Track cleared cells so we can remove them from local state after save.
      const clearedKeys = new Set<string>();

      for (const cellKey of touchedCells) {
        const sep    = cellKey.lastIndexOf('::');
        const userId = cellKey.slice(0, sep);
        const date   = cellKey.slice(sep + 2);
        const weekKey = `${userId}::${getWeekStart(date)}`;

        const draft = draftWeeks.get(weekKey);
        if (!draft) continue;

        const day = draft.days[date];
        if (!day) continue;

        const isCleared = !day.isDayOff && day.shiftCode === null && !(day.shiftCodes?.length ?? 0);
        const codes = (day.shiftCodes && day.shiftCodes.length > 0)
          ? day.shiftCodes
          : (day.shiftCode ? [day.shiftCode] : []);

        payload.push({ userId, date, shiftCodes: codes, isDayOff: day.isDayOff });
        if (isCleared) clearedKeys.add(`${userId}::${date}`);
      }

      if (payload.length === 0) {
        setDraftWeeks(new Map());
        setTouchedCells(new Set());
        return true;
      }

      console.log('[SchedulesPage] upsertDays payload', JSON.stringify(payload, null, 2));
      const saved = await scheduleApi.upsertDays(payload);

      // Notify mounted employee views (same tab) that schedule data changed.
      invalidateScheduleCache();

      // Merge upserted records into local state; remove deleted (cleared) records.
      setSchedules((prev) => {
        const map = new Map(prev.map((r) => [`${r.userId}::${r.date}`, r]));
        for (const r of saved) map.set(`${r.userId}::${r.date}`, r);
        for (const key of clearedKeys) map.delete(key);
        return [...map.values()];
      });
      setDraftWeeks(new Map());
      setTouchedCells(new Set());
      // Refresh publish-status so the Publish button reflects the new saved state.
      await fetchPublishStatus();
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('error.generic'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ── Picker context ─────────────────────────────────────────────────────────

  // Use the DEPARTMENT's pattern for the picker — not the employee's own workSchedulePatternId,
  // which may be stale if the department recently changed its pattern.
  const editSubRole      = deptPattern && !isWeeklyPattern ? deptPattern : null;
  const editCurrentCodes = editCell ? getCodes(getCellValue(editCell.userId, editCell.date)) : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 max-w-full">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">ตารางเวร</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deptId && (
            <button
              onClick={() => { setEwEdit(null); setEwPrefillEmployee(''); setEwPrefillDate(''); setShowEWModal(true); }}
              className="rounded-xl border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              + สร้างเวลางานเพิ่มเติม
            </button>
          )}

          {/* ── Auto-save status indicator ── */}
          {draftSaveStatus === 'pending' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              รอบันทึกอัตโนมัติ...
            </span>
          )}
          {draftSaveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              กำลังบันทึก...
            </span>
          )}
          {draftSaveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
              ✓ บันทึกร่างแล้ว
            </span>
          )}
          {draftSaveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
              บันทึกไม่สำเร็จ
            </span>
          )}
          {/* EW modal open but no schedule edits — still warn user */}
          {draftSaveStatus === 'idle' && showEWModal && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              กำลังแก้ไข OT...
            </span>
          )}

          {/* Cancel: discard local draft edits before auto-save fires */}
          {hasPending && (
            <button
              onClick={() => {
                setDraftWeeks(new Map());
                setTouchedCells(new Set());
                setSaveError('');
                setPublishMsg(null);
                setDraftSaveStatus('idle');
              }}
              className="rounded-xl border border-amber-300 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50"
            >
              ยกเลิก ({pendingCount})
            </button>
          )}
          {/* Retry button shown only on save error */}
          {draftSaveStatus === 'error' && (
            <button
              disabled={saving}
              onClick={() => {
                setDraftSaveStatus('saving');
                handleSave().then((ok) => {
                  setDraftSaveStatus(ok ? 'saved' : 'error');
                  if (ok) setTimeout(() => setDraftSaveStatus('idle'), 2500);
                });
              }}
              className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              ลองใหม่
            </button>
          )}

          {/* ── Publish button — three states ── */}
          {deptId && (() => {
            // HR-approval gate overrides everything
            if (requiresHrApproval && !isHRRole) {
              return (
                <button
                  disabled
                  title="เฉพาะ HR เท่านั้นที่สามารถเผยแพร่ตารางงานของแผนกนี้ได้"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  เฉพาะ HR เผยแพร่ได้
                </button>
              );
            }

            // CASE 1 — unsaved schedule edits or EW modal still open (possibly unsaved EW)
            if (hasPending || showEWModal) {
              return (
                <button
                  disabled
                  title="บันทึกการเปลี่ยนแปลงก่อนเผยแพร่"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-700 disabled:opacity-80 cursor-not-allowed"
                >
                  กรุณาบันทึกก่อนเผยแพร่
                </button>
              );
            }

            // CASE 2 — saved, identical to published (nothing new to publish)
            if (publishStatus?.alreadyPublished) {
              return (
                <button
                  disabled
                  className="rounded-xl border border-green-300 bg-green-50 px-5 py-2 text-sm font-semibold text-green-700 disabled:opacity-90"
                >
                  ✓ เผยแพร่แล้ว
                </button>
              );
            }

            // CASE 3 — saved + has unpublished drafts (ready to publish)
            return (
              <button
                onClick={handlePublish}
                disabled={publishing || !publishStatus?.changedFromPublished}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {publishing ? 'กำลังเผยแพร่…' : 'เผยแพร่ตารางงาน'}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Publish result message */}
      {publishMsg && (
        <div className={`mb-3 rounded-xl px-4 py-2 text-sm ${publishMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {publishMsg.text}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); setDraftWeeks(new Map()); setTouchedCells(new Set()); setSaveError(''); setDraftSaveStatus('idle'); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
        />
        <select
          value={deptId}
          onChange={(e) => { setDeptId(e.target.value); setDraftWeeks(new Map()); setTouchedCells(new Set()); setSaveError(''); setDraftSaveStatus('idle'); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
        >
          <option value="">— เลือกแผนก —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.nameTh}</option>
          ))}
        </select>

        {/* Pattern filter — only useful for SHIFT_TIME dept patterns */}
        {deptId && !isWeeklyPattern && deptSubRoles.length > 0 && (
          <select
            value={subRoleFilter}
            onChange={(e) => setSubRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="">— รูปแบบทั้งหมด —</option>
            {deptSubRoles.map((sr) => (
              <option key={sr.id} value={sr.id}>{sr.nameTh}</option>
            ))}
          </select>
        )}
      </div>

      {/* Weekly-pattern notice — replaces painter when dept uses WEEKLY_WORKING_TIME */}
      {deptId && isWeeklyPattern && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm text-blue-700 ring-1 ring-blue-200">
          <svg className="h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          แผนกนี้ใช้เวลาทำงานทั่วไป ไม่ต้องจัดเวร
        </div>
      )}

      {/* Paint-mode shift toolbar — SHIFT_TIME patterns only */}
      {deptId && !isWeeklyPattern && allDeptShifts.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">เลือกกะ:</span>

          {allDeptShifts.map((shift) => {
            const isActive = activeShift?.shiftCode === shift.code && !activeShift?.isDayOff;
            return (
              <button
                key={shift.code}
                onClick={() => setActiveShift(isActive ? null : { shiftCode: shift.code, isDayOff: false })}
                title={`${shift.nameTh}  ${shift.startTime}–${shift.endTime}`}
                className={[
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                  isActive
                    ? 'border-primary-600 bg-primary-600 text-white shadow-md'
                    : 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100',
                ].join(' ')}
              >
                <span>{shift.code}</span>
                <span className="font-normal opacity-75">{shift.startTime}–{shift.endTime}</span>
              </button>
            );
          })}

          {/* วันหยุด */}
          {(() => {
            const isActive = activeShift !== null && activeShift.isDayOff;
            return (
              <button
                onClick={() => setActiveShift(isActive ? null : { shiftCode: null, isDayOff: true })}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-gray-500 bg-gray-600 text-white shadow-md'
                    : 'border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200',
                ].join(' ')}
              >
                วันหยุด
              </button>
            );
          })()}

          {/* ล้างค่า */}
          {(() => {
            const isActive = activeShift !== null && !activeShift.isDayOff && activeShift.shiftCode === null;
            return (
              <button
                onClick={() => setActiveShift(isActive ? null : { shiftCode: null, isDayOff: false })}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  isActive
                    ? 'border-red-400 bg-red-500 text-white shadow-md'
                    : 'border-gray-200 text-gray-400 hover:bg-gray-50',
                ].join(' ')}
              >
                ล้างค่า
              </button>
            );
          })()}

          {activeShift !== null && (
            <button
              onClick={() => setActiveShift(null)}
              className="ml-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100"
            >
              ✕ ออกจากโหมดระบาย
            </button>
          )}

          {activeShift !== null && (
            <span className="text-xs text-amber-600">← คลิกช่องใดก็ได้เพื่อใส่กะ</span>
          )}
        </div>
      )}

      {/* Error */}
      {saveError && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{saveError}</p>
      )}

      {/* Grid */}
      {!deptId ? (
        <p className="py-16 text-center text-sm text-gray-400">เลือกแผนกเพื่อดูตารางเวร</p>
      ) : loading ? (
        <PageSpinner />
      ) : visibleEmployees.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">
          {employees.length === 0 ? 'ไม่มีพนักงานในแผนกนี้' : 'ไม่มีพนักงานในรูปแบบที่เลือก'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
          <table className="border-collapse text-sm" style={{ minWidth: `${140 + monthDays.length * 52}px` }}>
            <thead>
              <tr className="bg-gray-50">
                {/* Sticky employee name column */}
                <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-gray-100 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500">
                  พนักงาน
                </th>
                {monthDays.map((date) => {
                  const d = new Date(date + 'T00:00:00');
                  const dow = d.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th
                      key={date}
                      className={`min-w-[48px] border-b border-r border-gray-100 px-1 py-2 text-center text-xs last:border-r-0 ${
                        isWeekend ? 'bg-red-50 text-red-400' : 'text-gray-500'
                      }`}
                    >
                      <div className="font-semibold leading-tight">{d.getDate()}</div>
                      <div className="font-normal opacity-60">{TH_DOW_SHORT[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/40">
                  {/* Sticky employee name */}
                  <td className="sticky left-0 z-10 border-r border-gray-100 bg-white px-4 py-2">
                    <div className="text-xs font-semibold text-gray-900 leading-tight">
                      {emp.firstNameTh} {emp.lastNameTh}
                    </div>
                    {emp.workSchedulePatternId && subRoleById[emp.workSchedulePatternId] && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        {subRoleById[emp.workSchedulePatternId].nameTh}
                      </div>
                    )}
                  </td>

                  {/* Day cells */}
                  {monthDays.map((date) => {
                    const d = new Date(date + 'T00:00:00');
                    const dow = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const cellKey = `${emp.id}::${date}`;
                    const isPast  = date < today;
                    const isPending = touchedCells.has(cellKey);
                    const cell = getCellValue(emp.id, date);
                    const isDragSelected = dragCells.has(cellKey);

                    return (
                      <td
                        key={date}
                        data-drag-user={isPast ? undefined : emp.id}
                        data-drag-date={isPast ? undefined : date}
                        onClick={() => { if (!isPast) handleCellClick(emp.id, date); }}
                        onMouseDown={(e) => {
                          if (!activeShift || isWeeklyPattern || isPast) return;
                          e.preventDefault();
                          dragStartKeyRef.current = cellKey;
                          isDraggingRef.current   = false;
                        }}
                        onMouseEnter={() => {
                          if (isPast || !dragStartKeyRef.current) return;
                          if (!isDraggingRef.current) {
                            if (cellKey === dragStartKeyRef.current) return;
                            isDraggingRef.current = true;
                            setDragCells(new Set([dragStartKeyRef.current, cellKey]));
                          } else {
                            setDragCells((prev) => new Set([...prev, cellKey]));
                          }
                        }}
                        onTouchStart={(_e) => {
                          if (!activeShift || isWeeklyPattern || isPast) return;
                          dragStartKeyRef.current = cellKey;
                          longPressRef.current = setTimeout(() => {
                            touchDragRef.current  = true;
                            isDraggingRef.current = true;
                            setDragCells(new Set([cellKey]));
                            navigator.vibrate?.(40);
                          }, 350);
                        }}
                        onTouchMove={(e) => {
                          if (!touchDragRef.current) {
                            if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
                            return;
                          }
                          e.preventDefault();
                          const touch = e.touches[0];
                          const el = document.elementFromPoint(touch.clientX, touch.clientY);
                          const td  = el?.closest<HTMLElement>('[data-drag-user]');
                          const u   = td?.dataset.dragUser;
                          const dt  = td?.dataset.dragDate;
                          if (u && dt) setDragCells((prev) => new Set([...prev, `${u}::${dt}`]));
                        }}
                        className={[
                          'select-none border-r border-gray-100 px-1 py-2 text-center last:border-r-0 transition-colors',
                          isPast
                            ? 'cursor-not-allowed opacity-40'
                            : isDragSelected
                              ? 'bg-primary-200/60 ring-1 ring-inset ring-primary-400'
                              : isWeeklyPattern
                                ? 'cursor-pointer hover:bg-emerald-50'
                                : activeShift !== null
                                  ? 'cursor-crosshair hover:bg-primary-100'
                                  : 'cursor-pointer hover:bg-primary-50',
                          !isPast && !isDragSelected && isWeekend && !isPending ? 'bg-red-50/30' : '',
                          !isPast && !isDragSelected && isPending ? 'bg-amber-50' : '',
                        ].join(' ')}
                      >
                        {(() => {
                          const holiday      = holidayByMmdd.get(date.slice(5));
                          const daySchedule  = isWeeklyPattern
                            ? deptPattern?.weeklySchedule?.find((ws) => ws.dayOfWeek === dow)
                            : null;
                          return (
                            <ScheduleCell
                              patternType={isWeeklyPattern ? 'WEEKLY_WORKING_TIME' : 'SHIFT_TIME'}
                              holiday={holiday ? { name: holiday.name } : null}
                            >
                              {isWeeklyPattern ? (
                                daySchedule ? (
                                  <div className="flex flex-col items-center leading-tight">
                                    <span className="text-[10px] font-medium text-emerald-700">{daySchedule.startTime}</span>
                                    <span className="text-[10px] font-medium text-emerald-700">{daySchedule.endTime}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300">-</span>
                                )
                              ) : (
                                <CellBadge cell={cell} isPending={isPending} shifts={allDeptShifts} date={date} />
                              )}
                            </ScheduleCell>
                          );
                        })()}
                        {/* Extra work overlays */}
                        {(extraWorkMap[emp.id]?.[date] ?? []).map((ew) => (
                          <ExtraWorkBadge
                            key={ew.id}
                            ew={ew}
                            onClick={() => { setEwEdit(ew); setShowEWModal(true); }}
                          />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {deptId && !loading && visibleEmployees.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-primary-100 text-xs font-bold text-primary-700">D</span>
            กะทำงาน
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">หยุด</span>
            วันหยุด
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-amber-200 text-xs font-bold text-amber-700">?</span>
            รอบันทึก (ยังไม่ได้กด Save)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-8 rounded bg-red-50 border border-red-100"></span>
            วันหยุดสุดสัปดาห์
          </span>
        </div>
      )}

      {/* Shift picker modal */}
      {editCell && (
        <ShiftPickerModal
          date={editCell.date}
          subRole={editSubRole}
          currentCodes={editCurrentCodes}
          onSelect={handleShiftSelect}
          onClose={() => setEditCell(null)}
          onAddExtraWork={() => openEwFromCell(editCell.userId, editCell.date)}
        />
      )}

      {/* Extra work modal */}
      {showEWModal && (
        <ExtraWorkModal
          departmentId={deptId}
          employees={employees}
          extraWorks={extraWorks}
          initial={ewEdit}
          defaultEmployeeId={ewPrefillEmployee}
          defaultDate={ewPrefillDate}
          onSave={handleSaveExtraWork}
          onDelete={handleDeleteExtraWork}
          onClose={() => { setShowEWModal(false); setEwPrefillEmployee(''); setEwPrefillDate(''); }}
        />
      )}
    </div>
  );
}
