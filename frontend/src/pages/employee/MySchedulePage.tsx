/**
 * MySchedulePage — monthly calendar of the employee's own work schedule.
 *
 * Uses GET /api/schedules/my-calendar — the backend resolver.
 * Department is resolved by effectiveDate server-side, so the calendar is
 * always correct after a department transfer without requiring a page reload.
 * Do NOT use cached auth token fields (user.workSchedulePatternId, user.departmentId)
 * for schedule rendering — those values are stale after transfers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExtraWork, ExtraWorkReason } from '@hospital-hr/shared';
import { extraWorkApi } from '../../api/extraWork';
import { useAuth } from '../../context/AuthContext';
import { toLocalIso } from '../../utils/date/getWeekStart';
import { useResolvedSchedule } from '../../modules/schedule/useResolvedSchedule';
import type { ResolvedDay, ResolvedShift } from '../../modules/schedule/types';
import { ScheduleCell } from '../../components/schedule/ScheduleCell';

function getMonthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  );
}

const TH_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม',
];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// ─── ShiftEntry — one shift row inside a cell ─────────────────────────────────

function ShiftEntry({
  code,
  shift,
  isToday,
}: {
  code:     string;
  shift:    ResolvedShift | undefined;
  isToday:  boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-px w-full">
      {/* Code badge */}
      <span className={[
        'rounded px-1 leading-tight font-bold',
        'text-[10px]',
        isToday ? 'bg-white/25 text-white' : 'bg-primary-100 text-primary-700',
      ].join(' ')}>
        {code}
      </span>

      {shift ? (
        <>
          {/* Shift name — truncated to one line */}
          <span className={[
            'w-full truncate text-center leading-tight',
            'text-[9px]',
            isToday ? 'text-primary-100' : 'text-gray-500',
          ].join(' ')}
            title={shift.nameTh}
          >
            {shift.nameTh}
          </span>
          {/* Time range */}
          <span className={[
            'leading-tight tabular-nums',
            'text-[9px]',
            isToday ? 'text-primary-200' : 'text-gray-400',
          ].join(' ')}>
            {shift.startTime}–{shift.endTime}
          </span>
        </>
      ) : null}
    </div>
  );
}

// ─── WeeklyDayEntry — time block for WEEKLY_WORKING_TIME pattern ──────────────

function WeeklyDayEntry({
  day,
  isToday,
}: {
  day:     { startTime: string; endTime: string };
  isToday: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-px w-full">
      <span className={[
        'rounded px-1 leading-tight font-bold text-[10px]',
        isToday ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700',
      ].join(' ')}>
        ทำงาน
      </span>
      <span className={[
        'leading-tight tabular-nums text-[9px]',
        isToday ? 'text-primary-200' : 'text-gray-400',
      ].join(' ')}>
        {day.startTime}–{day.endTime}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MySchedulePage() {
  const { user } = useAuth();

  const today = toLocalIso(new Date());
  const [month, setMonth] = useState(() => today.slice(0, 7));

  // ── Schedule data — via shared engine ─────────────────────────────────────
  // useResolvedSchedule fetches /api/schedules/my-calendar, normalises the
  // response to ResolvedDay[], caches it, and auto-refreshes when the admin
  // page calls invalidateScheduleCache() after saving or publishing.
  const {
    days:    schedules,
    loading: scheduleLoading,
    refresh: refreshSchedule,
  } = useResolvedSchedule(month);

  // ── Extra works — loaded independently ────────────────────────────────────
  const [extraWorks,  setExtraWorks]  = useState<ExtraWork[]>([]);
  const [ewLoading,   setEwLoading]   = useState(false);

  const loadExtraWorks = useCallback(() => {
    if (!user?.id) return;
    const days = getMonthDays(month);
    setEwLoading(true);
    extraWorkApi
      .my({ from: days[0], to: days[days.length - 1] })
      .then(setExtraWorks)
      .catch(() => {})
      .finally(() => setEwLoading(false));
  }, [user?.id, month]);

  useEffect(() => { loadExtraWorks(); }, [loadExtraWorks]);

  const loading = scheduleLoading || ewLoading;

  // Re-fetch both on window focus (stale-while-away).
  useEffect(() => {
    function onFocus() { refreshSchedule(); loadExtraWorks(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSchedule, loadExtraWorks]);

  // Re-fetch both on cross-tab invalidation written by EmployeesPage after
  // a department transfer ('schedule-invalidate' key in localStorage).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'schedule-invalidate') { refreshSchedule(); loadExtraWorks(); }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshSchedule, loadExtraWorks]);

  // date → ResolvedDay (O(1) lookup during render)
  const dayMap = useMemo(() => {
    const map: Record<string, ResolvedDay> = {};
    for (const r of schedules) map[r.date] = r;
    return map;
  }, [schedules]);

  // extraWorkMap[date] = ExtraWork[]
  const extraWorkMap = useMemo(() => {
    const map: Record<string, ExtraWork[]> = {};
    for (const ew of extraWorks) {
      if (!map[ew.date]) map[ew.date] = [];
      map[ew.date].push(ew);
    }
    return map;
  }, [extraWorks]);

  // Calendar layout
  const monthDays = useMemo(() => getMonthDays(month), [month]);
  const firstDow  = new Date(monthDays[0] + 'T00:00:00').getDay();

  const paddedDays: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...monthDays,
  ];
  while (paddedDays.length % 7 !== 0) paddedDays.push(null);

  function addMonths(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const [y, m] = month.split('-').map(Number);
  const monthLabel = `${TH_MONTHS[m - 1]} ${y + 543}`;

  return (
    <div className="min-h-screen bg-gray-50 px-2 py-4">

      {/* ── Header ── */}
      <div className="mb-4 flex items-center justify-between px-1">
        <button
          onClick={() => addMonths(-1)}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-200 active:bg-gray-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-base font-semibold text-gray-900">{monthLabel}</p>
          {loading && <p className="mt-0.5 text-xs text-gray-400">กำลังโหลด...</p>}
        </div>

        <button
          onClick={() => addMonths(1)}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-200 active:bg-gray-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── Day-of-week headers ── */}
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {TH_DOW.map((d, i) => (
          <div
            key={d}
            className={`py-1 text-center text-[11px] font-semibold
              ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div className="grid grid-cols-7 gap-0.5">
        {paddedDays.map((date, idx) => {
          if (!date) {
            // Empty padding cell — same height as real cells
            return <div key={`pad-${idx}`} className="min-h-[88px]" />;
          }

          const dayData   = dayMap[date];           // ResolvedDay | undefined
          const isToday   = date === today;
          const dow       = new Date(date + 'T00:00:00').getDay();
          const isWeekend = dow === 0 || dow === 6;
          const dayNum    = parseInt(date.slice(8), 10);
          const dayExtras = extraWorkMap[date] ?? [];

          return (
            <div
              key={date}
              className={[
                'flex min-h-[88px] flex-col items-center rounded-xl p-1 transition-colors',
                isToday
                  ? 'bg-primary-600 shadow-md'
                  : isWeekend
                    ? 'bg-red-50'
                    : 'bg-white',
              ].join(' ')}
            >
              {/* Date number */}
              <span className={[
                'mb-1 self-start pl-0.5 text-[11px] font-bold leading-none',
                isToday ? 'text-white' : isWeekend ? 'text-red-400' : 'text-gray-700',
              ].join(' ')}>
                {dayNum}
              </span>

              {/* Content area */}
              <div className="flex w-full flex-1 flex-col items-center justify-start gap-1">
                {!dayData ? (
                  <span className={`text-[10px] ${isToday ? 'text-primary-300' : 'text-gray-300'}`}>
                    —
                  </span>
                ) : (
                  /* ScheduleCell is the single rendering authority:
                     WEEKLY + holiday → replaces content with holiday name.
                     SHIFT  + holiday → appends holiday annotation below shifts.
                     No holiday       → renders children unchanged. */
                  <ScheduleCell
                    patternType={dayData.patternType}
                    holiday={dayData.isHoliday && dayData.holidayName ? { name: dayData.holidayName } : null}
                    isToday={isToday}
                  >
                    {dayData.patternType === 'WEEKLY_WORKING_TIME' ? (
                      dayData.workingTime ? (
                        <WeeklyDayEntry day={dayData.workingTime} isToday={isToday} />
                      ) : (
                        /* WEEKLY day-off (no weeklySchedule entry for this day-of-week) */
                        <span className={[
                          'rounded px-1 text-[10px] font-medium',
                          isToday ? 'text-primary-100' : 'bg-gray-100 text-gray-400',
                        ].join(' ')}>
                          หยุด
                        </span>
                      )
                    ) : dayData.isDayOff ? (
                      <span className={[
                        'rounded px-1 text-[10px] font-medium',
                        isToday ? 'text-primary-100' : 'bg-gray-100 text-gray-400',
                      ].join(' ')}>
                        หยุด
                      </span>
                    ) : dayData.shiftCodes.length > 0 ? (
                      <div className="flex w-full flex-col items-center gap-1">
                        {dayData.shiftCodes.map((code) => (
                          <ShiftEntry
                            key={code}
                            code={code}
                            shift={dayData.shifts.find((s) => s.code === code)}
                            isToday={isToday}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={`text-[10px] ${isToday ? 'text-primary-300' : 'text-gray-300'}`}>
                        —
                      </span>
                    )}
                  </ScheduleCell>
                )}

                {/* Extra work overlays */}
                {dayExtras.map((ew) => {
                  const labelMap: Record<ExtraWorkReason, string> = {
                    ot: 'OT', compensate: 'ชด', training: 'อบ', meeting: 'ปร', other: 'พิเศษ',
                  };
                  return (
                    <div key={ew.id} className="mt-0.5 w-full rounded border border-dashed border-emerald-400 bg-emerald-50 px-0.5 py-0.5 text-center text-[9px] font-medium text-emerald-700 leading-tight">
                      {labelMap[ew.reason]}<br />{ew.startTime}–{ew.endTime}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Legend ── */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-primary-600 text-[10px] font-bold text-white">วัน</span>
          วันนี้
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-primary-100 text-[10px] font-bold text-primary-700">D</span>
          กะทำงาน
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-400">หยุด</span>
          วันหยุด
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-red-50 text-[10px] text-red-400">อา</span>
          สุดสัปดาห์
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-7 items-center justify-center rounded border border-dashed border-emerald-400 bg-emerald-50 text-[10px] text-emerald-700">+</span>
          เพิ่มเติม
        </span>
      </div>
    </div>
  );
}
