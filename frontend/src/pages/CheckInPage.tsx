/**
 * CheckInPage — mobile-first check-in / check-out screen.
 *
 * Sections:
 *  1. Clock card — live time, date, today's shift badge
 *  2. Status card — check-in/out times + status pill
 *  3. Camera capture + GPS
 *  4. CHECK IN / CHECK OUT button
 *  5. Weekly schedule mini-grid
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import type { AttendanceRecord, WorkSchedulePattern, WorkSchedule } from '@hospital-hr/shared';
import { checkIn, checkOut, getToday } from '../api/attendance';
import { scheduleApi } from '../api/schedules';
import { workSchedulePatternApi } from '../api/subRoles';
import { useAuth } from '../context/AuthContext';
import { useOrgSettings } from '../hooks/useOrgSettings';
import { useTranslation } from '../i18n/useTranslation';
import { toLocalIso, getWeekStart, getWeekDates } from '../utils/date/getWeekStart';

// ─── Types ────────────────────────────────────────────────────────────────────

type GpsState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; lat: number; lng: number }
  | { status: 'error'; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatTime(date: Date): string {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function statusColor(status: AttendanceRecord['status']): string {
  switch (status) {
    case 'present':          return 'bg-green-100 text-green-800';
    case 'late':             return 'bg-yellow-100 text-yellow-800';
    case 'early_leave':      return 'bg-orange-100 text-orange-800';
    case 'absent':           return 'bg-red-100 text-red-800';
    case 'pending_approval': return 'bg-purple-100 text-purple-800';
    default:                 return 'bg-gray-100 text-gray-700';
  }
}

const DAY_LABELS_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mode, requireManagerApproval } = useOrgSettings();
  const isSimpleMode = mode === 'SIMPLE';

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayIso     = toLocalIso(now);
  const weekStartIso = getWeekStart(now);

  // Week dates Mon–Sun
  const weekDates: string[] = getWeekDates(weekStartIso);

  // Today's attendance record
  const [record,        setRecord]        = useState<AttendanceRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);

  useEffect(() => {
    getToday()
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoadingRecord(false));
  }, []);

  // This week's schedule + sub-role shifts
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [subRoles, setSubRoles] = useState<WorkSchedulePattern[]>([]);

  useEffect(() => {
    // SIMPLE mode: no schedules used — skip fetch to avoid unnecessary requests
    if (!user?.id || isSimpleMode) return;
    scheduleApi.my({ weekStart: weekStartIso })
      .then(res => setSchedule(res[0] ?? null))
      .catch(() => {});
    workSchedulePatternApi.list()
      .then(setSubRoles)
      .catch(() => {});
  }, [user?.id, weekStartIso, isSimpleMode]);

  const todayDay   = schedule?.days?.[todayIso];
  const subRole    = user?.workSchedulePatternId ? subRoles.find(sr => sr.id === user.workSchedulePatternId) : null;
  // Support both single and multi-shift
  const todayCodes  = todayDay?.shiftCodes?.length ? todayDay.shiftCodes : (todayDay?.shiftCode ? [todayDay.shiftCode] : []);
  const todayShifts = subRole ? todayCodes.map(code => subRole.shifts.find(s => s.code === code)).filter(Boolean) : [];

  // Camera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photo,   setPhoto]   = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhoto(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  }, []);

  // GPS
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGps({ status: 'error', message: t('attendance.locationError') });
      return;
    }
    setGps({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ status: 'ok', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps({ status: 'error', message: t('attendance.locationError') }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [t]);

  // Auto-request GPS on mount so it's ready before the user hits submit
  useEffect(() => { locateMe(); }, [locateMe]);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isCheckedIn  = !!record?.checkInTime;
  const isCheckedOut = !!record?.checkOutTime;

  const handleAction = useCallback(async () => {
    setError(null);
    setSuccessMsg(null);

    if (!photo) {
      setError(t('attendance.photoRequired'));
      return;
    }

    if (gps.status === 'idle' || gps.status === 'locating') {
      setError(t('attendance.gpsRequired'));
      return;
    }

    const lat = gps.status === 'ok' ? gps.lat : undefined;
    const lng = gps.status === 'ok' ? gps.lng : undefined;

    setSubmitting(true);
    try {
      let updated: AttendanceRecord;
      if (!isCheckedIn) {
        updated = await checkIn({ photo, lat, lng });
        setSuccessMsg(t('attendance.checkInSuccess'));
      } else {
        updated = await checkOut({ photo, lat, lng });
        setSuccessMsg(t('attendance.checkOutSuccess'));
      }
      setRecord(updated);
      setPhoto(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }, [photo, gps, isCheckedIn, t]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-sm space-y-4">

        {/* 1. Clock card */}
        <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
          <div className="text-4xl font-bold text-gray-900 tabular-nums tracking-tight">
            {formatTime(now)}
          </div>
          <div className="mt-1 text-sm text-gray-500">{formatDate(now)}</div>

          {/* Today's shift badge(s) — hidden in SIMPLE mode */}
          {!isSimpleMode && <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {todayDay?.isDayOff ? (
              <span className="inline-block rounded-full bg-gray-100 px-4 py-1 text-sm text-gray-500">
                {t('schedule.dayOff')}
              </span>
            ) : todayShifts.length > 0 ? (
              todayShifts.map((shift) => shift && (
                <span key={shift.code} className="inline-block rounded-full bg-primary-100 px-4 py-1 text-sm font-medium text-primary-700">
                  [{shift.code}] {shift.nameTh} · {shift.startTime}–{shift.endTime}
                </span>
              ))
            ) : todayCodes.length > 0 ? (
              todayCodes.map((code) => (
                <span key={code} className="inline-block rounded-full bg-primary-100 px-4 py-1 text-sm font-medium text-primary-700">
                  {code}
                </span>
              ))
            ) : (
              <span className="inline-block rounded-full bg-gray-50 px-4 py-1 text-sm text-gray-400">
                {t('attendance.noShiftToday')}
              </span>
            )}
          </div>}
        </div>

        {/* 2. Status card */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          {loadingRecord ? (
            <div className="text-center text-gray-400 text-sm">{t('common.loading')}</div>
          ) : isCheckedOut ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{t('attendance.checkInTime')}</span>
                <span className="font-medium">{formatHHMM(record!.checkInTime!)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{t('attendance.checkOutTime')}</span>
                <span className="font-medium">{formatHHMM(record!.checkOutTime!)}</span>
              </div>
              <div className="flex justify-center mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(record!.status)}`}>
                  {t(`attendance.status.${record!.status}` as any)}
                </span>
              </div>
            </div>
          ) : isCheckedIn ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{t('attendance.checkInTime')}</span>
                <span className="font-medium">{formatHHMM(record!.checkInTime!)}</span>
              </div>
              <div className="flex justify-center mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(record!.status)}`}>
                  {t(`attendance.status.${record!.status}` as any)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-gray-400">{t('attendance.notCheckedIn')}</div>
          )}
        </div>

        {/* 3. Camera + GPS */}
        {!isCheckedOut && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />

            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="preview"
                  className="w-full rounded-xl object-cover max-h-48"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1 rounded-full"
                >
                  {t('attendance.retakePhoto')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-8 text-gray-400 active:bg-gray-50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium">{t('attendance.takePhoto')}</span>
              </button>
            )}

            {/* GPS */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {gps.status === 'idle'     && t('attendance.location')}
                {gps.status === 'locating' && t('attendance.locating')}
                {gps.status === 'ok'       && `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`}
                {gps.status === 'error'    && <span className="text-red-500">{gps.message}</span>}
              </div>
              <button
                type="button"
                onClick={locateMe}
                disabled={gps.status === 'locating'}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  gps.status === 'ok'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700 active:bg-blue-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {gps.status === 'ok' ? t('common.success') : t('attendance.gettingLocation')}
              </button>
            </div>
          </div>
        )}

        {/* Pending approval notice — only shown when manager approval is required */}
        {record?.status === 'pending_approval' && !successMsg && requireManagerApproval && (
          <div className="bg-purple-50 border border-purple-200 text-purple-700 text-sm rounded-xl px-4 py-3">
            {t('attendance.pendingApprovalNote')}
          </div>
        )}

        {/* Error / success */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
            {successMsg}
          </div>
        )}

        {/* 4. CTA button */}
        {!isCheckedOut ? (
          <button
            type="button"
            onClick={handleAction}
            disabled={submitting || !photo || gps.status === 'locating'}
            className={`w-full py-4 rounded-2xl text-white text-lg font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              isCheckedIn
                ? 'bg-orange-500 active:bg-orange-600'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {submitting
              ? t('common.loading')
              : isCheckedIn
                ? t('attendance.checkOut')
                : t('attendance.checkIn')}
          </button>
        ) : (
          <div className="text-center text-sm text-gray-400 py-2">
            {t('attendance.alreadyCheckedOut')}
          </div>
        )}

        {/* 5. Weekly schedule mini-grid — hidden in SIMPLE mode */}
        {!isSimpleMode && <div className="bg-white rounded-2xl shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">{t('schedule.weekly')}</p>
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS_SHORT.map((label, i) => {
              const date    = weekDates[i];
              const day     = schedule?.days?.[date];
              const isToday = date === todayIso;
              const codes   = day?.shiftCodes?.length ? day.shiftCodes : (day?.shiftCode ? [day.shiftCode] : []);

              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  <span className={`text-xs font-medium ${isToday ? 'text-primary-600' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  <div className={`w-full rounded-lg py-1.5 text-center text-xs font-semibold
                    ${isToday ? 'ring-2 ring-primary-400' : ''}
                    ${day?.isDayOff
                      ? 'bg-gray-100 text-gray-400'
                      : codes.length > 0
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-gray-50 text-gray-300'
                    }`}
                  >
                    {day?.isDayOff ? '–' : codes.length > 0 ? codes.join('/') : (schedule ? '—' : '?')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>}

      </div>
    </div>
  );
}
