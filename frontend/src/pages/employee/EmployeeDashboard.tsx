/**
 * EmployeeDashboard.tsx
 *
 * Personal dashboard for employee and part-time users.
 *
 * Three sections:
 *   1. Today's Status Card  — check-in/out times, status indicator
 *   2. My Approvals         — LATE / OT approval history with status badges
 *   3. Notifications        — in-app notifications, mark-as-read optimistically
 *
 * All three are loaded in parallel on mount.  Each section has its own loading
 * and empty state so a slow endpoint does not block the whole page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AttendanceRecord } from '@hospital-hr/shared';
import { getToday } from '../../api/attendance';
import {
  getMyApprovals,
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type AttendanceApproval,
  type AppNotification,
} from '../../api/employee';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Spinner } from '../../components/Spinner';
import { useRealtime } from '../../hooks/useRealtime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
}

// ─── SVG icon helper ──────────────────────────────────────────────────────────

function Icon({ d, cls = 'h-5 w-5' }: { d: string; cls?: string }) {
  return (
    <svg className={`${cls} shrink-0`} fill="none" viewBox="0 0 24 24"
         stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  check:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warn:     'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  clock:    'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  leave:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  absent:   'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  holiday:  'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  pending:  'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  bell:     'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  approval: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  read:     'M5 13l4 4L19 7',
};

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Today Status Card
// ─────────────────────────────────────────────────────────────────────────────

type StatusConfig = {
  iconPath: string;
  label:    string;
  iconCls:  string;
  ringCls:  string;
  bgCls:    string;
};

const STATUS_CONFIG: Record<string, StatusConfig> = {
  present:          { iconPath: ICONS.check,   label: 'ปกติ',          iconCls: 'text-green-600',  ringCls: 'ring-green-100',  bgCls: 'bg-green-50'  },
  late:             { iconPath: ICONS.warn,    label: 'มาสาย',         iconCls: 'text-yellow-600', ringCls: 'ring-yellow-100', bgCls: 'bg-yellow-50' },
  early_leave:      { iconPath: ICONS.clock,   label: 'ออกก่อนเวลา', iconCls: 'text-orange-600', ringCls: 'ring-orange-100', bgCls: 'bg-orange-50' },
  absent:           { iconPath: ICONS.absent,  label: 'ขาดงาน',        iconCls: 'text-red-500',    ringCls: 'ring-red-100',    bgCls: 'bg-red-50'    },
  on_leave:         { iconPath: ICONS.leave,   label: 'วันลา',         iconCls: 'text-blue-600',   ringCls: 'ring-blue-100',   bgCls: 'bg-blue-50'   },
  holiday:          { iconPath: ICONS.holiday, label: 'วันหยุด',       iconCls: 'text-gray-500',   ringCls: 'ring-gray-100',   bgCls: 'bg-gray-50'   },
  pending_approval: { iconPath: ICONS.pending, label: 'รออนุมัติ',     iconCls: 'text-purple-600', ringCls: 'ring-purple-100', bgCls: 'bg-purple-50' },
};

function TodayStatusCard({ record, loading }: { record: AttendanceRecord | null; loading: boolean }) {
  const today = new Date().toLocaleDateString('th-TH', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  if (loading) {
    return (
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Icon d={ICONS.clock} cls="h-5 w-5 text-primary-500" />
          <h2 className="text-sm font-semibold text-gray-700">วันนี้</h2>
        </div>
        <div className="flex justify-center py-6"><Spinner color="gray" /></div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon d={ICONS.clock} cls="h-5 w-5 text-primary-500" />
          <h2 className="text-sm font-semibold text-gray-700">วันนี้</h2>
        </div>
        <p className="text-xs text-gray-400 mb-4">{today}</p>
        <div className="flex flex-col items-center py-5 gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 ring-1 ring-gray-100">
            <Icon d={ICONS.clock} cls="h-7 w-7 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500 font-medium">ยังไม่ได้เช็คอิน</p>
          <p className="text-xs text-gray-400">ไปที่หน้าเช็คอินเพื่อบันทึกการเข้างาน</p>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.present;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Icon d={ICONS.clock} cls="h-5 w-5 text-primary-500" />
        <h2 className="text-sm font-semibold text-gray-700">วันนี้</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">{today}</p>

      {/* Status indicator */}
      <div className={`flex items-center gap-3 rounded-xl p-3.5 ring-1 ${cfg.bgCls} ${cfg.ringCls} mb-4`}>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70`}>
          <Icon d={cfg.iconPath} cls={`h-5 w-5 ${cfg.iconCls}`} />
        </div>
        <div>
          <p className={`text-sm font-semibold ${cfg.iconCls}`}>{cfg.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{record.date}</p>
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">เช็คอิน</p>
          <p className="text-lg font-bold tabular-nums text-gray-800">
            {fmtTime(record.checkInTime)}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">เช็คออก</p>
          <p className={`text-lg font-bold tabular-nums ${record.checkOutTime ? 'text-gray-800' : 'text-gray-300'}`}>
            {record.checkOutTime ? fmtTime(record.checkOutTime) : 'ยังอยู่'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Approval History
// ─────────────────────────────────────────────────────────────────────────────

const APPROVAL_TYPE_LABEL: Record<AttendanceApproval['type'], string> = {
  LATE: 'มาสาย',
  OT:   'ล่วงเวลา',
};

const APPROVAL_TYPE_STYLE: Record<AttendanceApproval['type'], string> = {
  LATE: 'bg-orange-100 text-orange-700',
  OT:   'bg-blue-100   text-blue-700',
};

function ApprovalHistorySection({
  approvals,
  loading,
}: {
  approvals: AttendanceApproval[];
  loading:   boolean;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <Icon d={ICONS.approval} cls="h-5 w-5 text-primary-500" />
        <h2 className="text-sm font-semibold text-gray-700">ประวัติคำขออนุมัติ</h2>
        {!loading && approvals.length > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center
            rounded-full bg-gray-100 px-1.5 text-[10px] font-bold text-gray-500">
            {approvals.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner color="gray" /></div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50">
            <Icon d={ICONS.approval} cls="h-5 w-5 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500">ไม่มีประวัติคำขออนุมัติ</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {approvals.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
              {/* Type pill */}
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5
                text-xs font-semibold ${APPROVAL_TYPE_STYLE[a.type]}`}>
                {APPROVAL_TYPE_LABEL[a.type]}
              </span>

              {/* Duration */}
              <span className="flex-1 min-w-0 text-sm text-gray-700 tabular-nums">
                {fmtMinutes(a.minutes)}
              </span>

              {/* Date */}
              <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
                {fmtDateTime(a.createdAt)}
              </span>

              {/* Status */}
              <StatusBadge status={a.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Notifications
// ─────────────────────────────────────────────────────────────────────────────

const NOTIF_TYPE_LABEL: Partial<Record<AppNotification['type'], string>> = {
  APPROVAL_REQUEST: 'คำขออนุมัติ',
  APPROVAL_RESULT:  'ผลการอนุมัติ',
  schedule_approved: 'ตารางอนุมัติ',
  schedule_rejected: 'ตารางถูกปฏิเสธ',
  schedule_pending:  'ตารางรออนุมัติ',
};

const NOTIF_TYPE_STYLE: Partial<Record<AppNotification['type'], string>> = {
  APPROVAL_REQUEST: 'bg-yellow-100 text-yellow-700',
  APPROVAL_RESULT:  'bg-green-100  text-green-700',
  schedule_approved: 'bg-green-100  text-green-700',
  schedule_rejected: 'bg-red-100   text-red-600',
  schedule_pending:  'bg-blue-100  text-blue-700',
};

function NotificationItem({
  notif,
  onMarkRead,
}: {
  notif:       AppNotification;
  onMarkRead:  (id: string) => void;
}) {
  const typeLabel = NOTIF_TYPE_LABEL[notif.type]  ?? notif.type;
  const typeStyle = NOTIF_TYPE_STYLE[notif.type] ?? 'bg-gray-100 text-gray-600';

  return (
    <li
      className={`relative flex items-start gap-3 px-5 py-3.5 transition-colors
        ${notif.isRead ? '' : 'bg-primary-50/40'}`}
    >
      {/* Unread dot */}
      {!notif.isRead && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5
          rounded-full bg-primary-500" aria-hidden="true" />
      )}

      <div className="flex-1 min-w-0">
        {/* Type + time row */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px]
            font-semibold ${typeStyle}`}>
            {typeLabel}
          </span>
          <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
            {fmtDateTime(notif.createdAt)}
          </span>
        </div>

        {/* Title */}
        <p className={`text-sm leading-snug ${notif.isRead ? 'text-gray-500' : 'font-medium text-gray-800'}`}>
          {notif.title}
        </p>

        {/* Body */}
        {notif.body && (
          <p className="mt-0.5 text-xs text-gray-400 leading-snug line-clamp-2">
            {notif.body}
          </p>
        )}
      </div>

      {/* Mark-read button */}
      {!notif.isRead && (
        <button
          type="button"
          onClick={() => onMarkRead(notif.id)}
          title="ทำเครื่องหมายว่าอ่านแล้ว"
          className="shrink-0 mt-0.5 rounded-lg p-1 text-gray-300 hover:text-primary-500
            hover:bg-white transition-colors"
        >
          <Icon d={ICONS.read} cls="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function NotificationsSection({
  notifications,
  loading,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: AppNotification[];
  loading:       boolean;
  onMarkRead:    (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <div className="relative">
          <Icon d={ICONS.bell} cls="h-5 w-5 text-primary-500" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center
              justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        <h2 className="text-sm font-semibold text-gray-700">การแจ้งเตือน</h2>

        {/* Mark all read */}
        {!loading && unread > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="ml-auto text-xs text-primary-600 hover:text-primary-700 font-medium
              transition-colors"
          >
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner color="gray" /></div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50">
            <Icon d={ICONS.bell} cls="h-5 w-5 text-gray-300" />
          </div>
          <p className="text-sm text-gray-500">ไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notif={n} onMarkRead={onMarkRead} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  // ── Data ────────────────────────────────────────────────────────────────────
  const [today,         setToday]         = useState<AttendanceRecord | null>(null);
  const [approvals,     setApprovals]     = useState<AttendanceApproval[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // ── Loading state per section (parallel fetch) ──────────────────────────────
  const [loadingToday, setLoadingToday]  = useState(true);
  const [loadingApprs, setLoadingApprs]  = useState(true);
  const [loadingNotif, setLoadingNotif]  = useState(true);

  // ── Page-level error (only for full-load failures) ──────────────────────────
  const [pageError, setPageError] = useState('');
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string) {
    setPageError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setPageError(''), 5000);
  }

  // ── Load all three sections in parallel ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoadingToday(true);
    setLoadingApprs(true);
    setLoadingNotif(true);
    setPageError('');

    const [todayRes, apprsRes, notifRes] = await Promise.allSettled([
      getToday(),
      getMyApprovals(),
      getMyNotifications(),
    ]);

    if (todayRes.status === 'fulfilled') {
      setToday(todayRes.value);
    } else {
      showError(todayRes.reason instanceof Error ? todayRes.reason.message : 'โหลดข้อมูลวันนี้ล้มเหลว');
    }

    if (apprsRes.status === 'fulfilled') {
      setApprovals(apprsRes.value);
    }

    if (notifRes.status === 'fulfilled') {
      setNotifications(notifRes.value);
    }

    setLoadingToday(false);
    setLoadingApprs(false);
    setLoadingNotif(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Realtime updates ────────────────────────────────────────────────────────
  useRealtime({
    // Approval status changed — update the matching row in-place
    onApprovalUpdated: (record) => {
      setApprovals((prev) =>
        prev.map((a) => a.id === record.id ? record : a),
      );
    },
    // New notification arrived — prepend if not already present
    onNotification: (notif) => {
      setNotifications((prev) =>
        prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev],
      );
    },
  });

  // ── Mark one notification as read (optimistic) ───────────────────────────────
  function handleMarkRead(id: string) {
    // Optimistic: flip locally before the API responds
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, isRead: true } : n),
    );
    // Fire-and-forget — mark-as-read failure is not worth surfacing
    markNotificationRead(id).catch(() => {});
  }

  // ── Mark all as read (optimistic) ────────────────────────────────────────────
  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    markAllNotificationsRead().catch(() => {});
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">ภาพรวมของฉัน</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('th-TH', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loadingToday && loadingApprs && loadingNotif}
            className="rounded-xl border border-gray-200 p-2 text-gray-400
              hover:bg-white hover:text-gray-600 disabled:opacity-40 transition-colors"
            title="รีเฟรช"
          >
            <Icon d={ICONS.refresh} cls="h-4 w-4" />
          </button>
        </div>

        {/* ── Error banner ── */}
        {pageError && (
          <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm
            text-red-600 ring-1 ring-red-200">
            <Icon d={ICONS.warn} cls="h-4 w-4 shrink-0" />
            {pageError}
          </div>
        )}

        {/* ── Section 1: Today ── */}
        <TodayStatusCard record={today} loading={loadingToday} />

        {/* ── Section 2: Approval history ── */}
        <ApprovalHistorySection approvals={approvals} loading={loadingApprs} />

        {/* ── Section 3: Notifications ── */}
        <NotificationsSection
          notifications={notifications}
          loading={loadingNotif}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />

      </div>
    </div>
  );
}
