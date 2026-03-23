import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceRecord } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { listAttendance } from '../../api/attendance';
import { reportApi, type PendingApprovalsReport, type MonthlySummaryReport } from '../../api/reports';
import { employeeApi } from '../../api/employees';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, to, color, bg, trend,
}: {
  label:   string;
  value:   string | number;
  sub?:    string;
  icon:    string;
  to?:     string;
  color:   string;   // text colour class
  bg:      string;   // icon background colour class
  trend?:  'up' | 'down' | 'neutral';
}) {
  const trendIcon =
    trend === 'up'   ? '↑' :
    trend === 'down' ? '↓' : null;

  const inner = (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 hover:shadow-md transition-shadow h-full">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 truncate">{label}</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>
            {value}
            {trendIcon && (
              <span className="ml-1 text-base">{trendIcon}</span>
            )}
          </p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${bg} flex-shrink-0 ml-3`}>
          <svg className={`h-6 w-6 ${color}`} fill="none" viewBox="0 0 24 24"
               stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );

  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  present:          'bg-green-100 text-green-700',
  late:             'bg-yellow-100 text-yellow-700',
  early_leave:      'bg-orange-100 text-orange-700',
  absent:           'bg-red-100 text-red-500',
  pending_approval: 'bg-purple-100 text-purple-700',
  on_leave:         'bg-blue-100 text-blue-700',
  holiday:          'bg-gray-100 text-gray-500',
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, to, linkLabel }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {to && linkLabel && (
        <Link to={to} className="text-xs font-medium text-primary-600 hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageData {
  todayRecords:    AttendanceRecord[];
  pending:         PendingApprovalsReport;
  monthlyReport:   MonthlySummaryReport | null;
  totalEmployees:  number;
}

export default function DashboardPage() {
  const { t } = useTranslation();

  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const today = todayIso();
    const month = currentMonth();

    Promise.all([
      listAttendance({ from: today, to: today }),
      reportApi.pendingApprovals(),
      reportApi.monthly(month).catch(() => null),   // may fail if no data yet
      employeeApi.list({ isActive: true, pageSize: 1 }),
    ]).then(([todayRecs, pend, monthly, emps]) => {
      setData({
        todayRecords:   todayRecs,
        pending:        pend,
        monthlyReport:  monthly,
        totalEmployees: emps.total,
      });
    }).catch(e => {
      setError(e instanceof Error ? e.message : t('error.generic'));
    }).finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return <PageSpinner />;
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // ── Derived counts ──────────────────────────────────────────────────────────

  const todayRecs = data?.todayRecords ?? [];

  // "Checked in" = any status that means the employee physically came in
  const checkedInToday = todayRecs.filter(r =>
    ['present', 'late', 'early_leave', 'pending_approval'].includes(r.status)
  ).length;

  const lateToday         = todayRecs.filter(r => r.status === 'late').length;
  const pendingCount      = data?.pending.total ?? 0;
  const totalEmp          = data?.totalEmployees ?? 0;

  // OT this month from monthly report totals
  const otHours      = data?.monthlyReport?.totals.overtime ?? null;
  const otDisplay    = otHours !== null
    ? `${otHours >= 0 ? '+' : ''}${otHours.toFixed(1)}`
    : '—';
  const otColor      = otHours === null ? 'text-gray-500'
    : otHours > 0   ? 'text-green-700'
    : otHours < 0   ? 'text-red-600'
    : 'text-gray-700';
  const otBg         = otHours === null ? 'bg-gray-100'
    : otHours > 0   ? 'bg-green-100'
    : otHours < 0   ? 'bg-red-100'
    : 'bg-gray-100';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">{t('nav.dashboard')}</h1>

      {/* ── 4 Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">

        {/* 1. Today attendance */}
        <StatCard
          label={t('dashboard.todayAttendance')}
          value={checkedInToday}
          sub={totalEmp > 0 ? `จาก ${totalEmp} คน` : undefined}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          to="/attendance"
          color="text-primary-700"
          bg="bg-primary-100"
        />

        {/* 2. Late today */}
        <StatCard
          label={t('dashboard.lateCount')}
          value={lateToday}
          sub="วันนี้"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          to="/attendance"
          color={lateToday > 0 ? 'text-yellow-700' : 'text-gray-500'}
          bg={lateToday > 0 ? 'bg-yellow-100' : 'bg-gray-100'}
          trend={lateToday > 0 ? 'up' : undefined}
        />

        {/* 3. Pending approvals */}
        <StatCard
          label={t('dashboard.pendingApprovals')}
          value={pendingCount}
          sub="รอการอนุมัติ"
          icon="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          to="/attendance"
          color={pendingCount > 0 ? 'text-amber-700' : 'text-gray-500'}
          bg={pendingCount > 0 ? 'bg-amber-100' : 'bg-gray-100'}
          trend={pendingCount > 0 ? 'up' : undefined}
        />

        {/* 4. Overtime this month */}
        <StatCard
          label="OT เดือนนี้ (ชม.)"
          value={otDisplay}
          sub={new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          icon="M13 10V3L4 14h7v7l9-11h-7z"
          to="/reports"
          color={otColor}
          bg={otBg}
        />
      </div>

      {/* ── Detail rows ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Today's attendance table */}
        <section>
          <SectionHeader
            title={t('dashboard.todayAttendance')}
            to="/attendance"
            linkLabel="ดูทั้งหมด"
          />
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            {todayRecs.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">ยังไม่มีการลงเวลาวันนี้</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('employee.fullName')}</th>
                    <th className="px-3 py-3 text-left">{t('attendance.checkInTime')}</th>
                    <th className="px-3 py-3 text-left">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {todayRecs.slice(0, 8).map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900 text-xs">{r.userId}</td>
                      <td className="px-3 py-2.5 text-gray-600 tabular-nums">{fmtTime(r.checkInTime)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {t(`attendance.status.${r.status}` as any)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Pending approvals list */}
        <section>
          <SectionHeader
            title={t('dashboard.pendingApprovals')}
            to="/attendance"
            linkLabel="อนุมัติ"
          />
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            {(data?.pending.records.length ?? 0) === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-1">✓</p>
                <p className="text-sm text-gray-400">ไม่มีรายการรออนุมัติ</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">{t('employee.fullName')}</th>
                    <th className="px-3 py-3 text-left">{t('attendance.date')}</th>
                    <th className="px-3 py-3 text-left">{t('attendance.checkInTime')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data!.pending.records.slice(0, 8).map(r => (
                    <tr key={r.attendanceId} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900 text-xs">{r.fullNameTh}</td>
                      <td className="px-3 py-2.5 text-gray-600">{r.date}</td>
                      <td className="px-3 py-2.5 text-gray-600 tabular-nums">{fmtTime(r.checkInTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Monthly attendance summary bar chart (simple) */}
        {data?.monthlyReport && (
          <section className="lg:col-span-2">
            <SectionHeader
              title={`สรุปการลงเวลา — ${new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`}
              to="/reports"
              linkLabel="รายงานเต็ม"
            />
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: t('attendance.summary.presentDays'),   value: data.monthlyReport.totals.presentDays,    color: 'bg-green-400' },
                  { label: t('attendance.summary.lateDays'),      value: data.monthlyReport.totals.lateDays,       color: 'bg-yellow-400' },
                  { label: t('attendance.summary.absentDays'),    value: data.monthlyReport.totals.absentDays,     color: 'bg-red-400' },
                  { label: t('attendance.summary.leaveDays'),     value: data.monthlyReport.totals.leaveDays,      color: 'bg-blue-400' },
                  { label: t('attendance.summary.workedHours'),   value: `${data.monthlyReport.totals.workedHours.toFixed(0)} ชม.`, color: 'bg-primary-400' },
                  { label: 'OT',                                  value: `${otDisplay} ชม.`, color: otHours !== null && otHours < 0 ? 'bg-red-400' : 'bg-green-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center">
                    <div className={`mx-auto mb-2 h-1.5 w-full max-w-16 rounded-full ${color}`} />
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
