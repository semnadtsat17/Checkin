import { useEffect, useState } from 'react';
import type { Department } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { deptApi } from '../../api/departments';
import { getWeekStart, toLocalIso } from '../../utils/date/getWeekStart';
import {
  reportApi,
  type WeeklySummaryReport,
  type MonthlySummaryReport,
  type PlannedVsActualReport,
  type PendingApprovalsReport,
} from '../../api/reports';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'weekly' | 'monthly' | 'planned' | 'pending';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { t } = useTranslation();

  const [tab,         setTab]         = useState<Tab>('weekly');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId,      setDeptId]      = useState('');
  const [weekStart,   setWeekStart]   = useState(() => getWeekStart(new Date()));
  const [month,    setMonth]   = useState(() => toLocalIso(new Date()).slice(0, 7));
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');

  const [weeklyData,  setWeeklyData]  = useState<WeeklySummaryReport  | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlySummaryReport | null>(null);
  const [plannedData, setPlannedData] = useState<PlannedVsActualReport | null>(null);
  const [pendingData, setPendingData] = useState<PendingApprovalsReport| null>(null);

  // Load departments for filter
  useEffect(() => {
    deptApi.list({ pageSize: 200 }).then(r => setDepartments(r.items)).catch(() => {});
  }, []);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const dept = deptId || undefined;
      if (tab === 'weekly')  { setWeeklyData(await reportApi.weekly(weekStart, dept)); }
      if (tab === 'monthly') { setMonthlyData(await reportApi.monthly(month, dept)); }
      if (tab === 'planned') { setPlannedData(await reportApi.plannedVsActual(month, dept)); }
      if (tab === 'pending') { setPendingData(await reportApi.pendingApprovals(dept)); }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'weekly',  label: t('report.weekly') },
    { key: 'monthly', label: t('report.monthly') },
    { key: 'planned', label: t('report.plannedVsActual') },
    { key: 'pending', label: t('report.pendingApprovals') },
  ];

  const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500';

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('report.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors
              ${tab === key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={deptId}
          onChange={e => setDeptId(e.target.value)}
          className={inputCls}
        >
          <option value="">— {t('report.selectDepartment')} —</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.nameTh}</option>
          ))}
        </select>

        {(tab === 'weekly') && (
          <input
            type="date"
            value={weekStart}
            onChange={e => setWeekStart(e.target.value)}
            className={inputCls}
          />
        )}

        {(tab === 'monthly' || tab === 'planned') && (
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className={inputCls}
          />
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? t('common.loading') : t('report.generate')}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* ── Weekly ── */}
      {tab === 'weekly' && (
        weeklyData ? (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">พนักงาน</th>
                  <th className="px-3 py-3 text-right">มา</th>
                  <th className="px-3 py-3 text-right">สาย</th>
                  <th className="px-3 py-3 text-right">ขาด</th>
                  <th className="px-3 py-3 text-right">ลา</th>
                  <th className="px-3 py-3 text-right">รออนุมัติ</th>
                  <th className="px-3 py-3 text-right">ชั่วโมง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weeklyData.employees.map(row => (
                  <tr key={row.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.fullNameTh}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.presentDays}</td>
                    <td className="px-3 py-3 text-right text-yellow-600">{row.lateDays}</td>
                    <td className="px-3 py-3 text-right text-red-500">{row.absentDays}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{row.leaveDays}</td>
                    <td className="px-3 py-3 text-right text-orange-500">{row.pendingDays}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.workedHours.toFixed(1)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3">รวม</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.presentDays}</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.lateDays}</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.absentDays}</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.leaveDays}</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.pendingDays}</td>
                  <td className="px-3 py-3 text-right">{weeklyData.totals.workedHours.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )
      )}

      {/* ── Monthly ── */}
      {tab === 'monthly' && (
        monthlyData ? (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">พนักงาน</th>
                  <th className="px-3 py-3 text-right">มา</th>
                  <th className="px-3 py-3 text-right">สาย</th>
                  <th className="px-3 py-3 text-right">ขาด</th>
                  <th className="px-3 py-3 text-right">ชั่วโมง</th>
                  <th className="px-3 py-3 text-right">OT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monthlyData.employees.map(row => (
                  <tr key={row.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.fullNameTh}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.presentDays}</td>
                    <td className="px-3 py-3 text-right text-yellow-600">{row.lateDays}</td>
                    <td className="px-3 py-3 text-right text-red-500">{row.absentDays}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.workedHours.toFixed(1)}</td>
                    <td className={`px-3 py-3 text-right font-medium ${row.overtime >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {row.overtime >= 0 ? '+' : ''}{row.overtime.toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3">รวม</td>
                  <td className="px-3 py-3 text-right">{monthlyData.totals.presentDays}</td>
                  <td className="px-3 py-3 text-right">{monthlyData.totals.lateDays}</td>
                  <td className="px-3 py-3 text-right">{monthlyData.totals.absentDays}</td>
                  <td className="px-3 py-3 text-right">{monthlyData.totals.workedHours.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right">{monthlyData.totals.overtime.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )
      )}

      {/* ── Planned vs Actual ── */}
      {tab === 'planned' && (
        plannedData ? (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">พนักงาน</th>
                  <th className="px-3 py-3 text-right">{t('report.plannedHours')}</th>
                  <th className="px-3 py-3 text-right">{t('report.actualHours')}</th>
                  <th className="px-3 py-3 text-right">{t('report.difference')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plannedData.employees.map(row => (
                  <tr key={row.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.fullNameTh}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.plannedHours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{row.actualHours.toFixed(1)}</td>
                    <td className={`px-3 py-3 text-right font-medium ${row.difference >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {row.difference >= 0 ? '+' : ''}{row.difference.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )
      )}

      {/* ── Pending Approvals ── */}
      {tab === 'pending' && (
        pendingData ? (
          pendingData.records.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t('report.noReport')}</p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
              <div className="border-b border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">รออนุมัติทั้งหมด: <strong>{pendingData.total}</strong> รายการ</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">พนักงาน</th>
                    <th className="px-4 py-3 text-left">วันที่</th>
                    <th className="px-4 py-3 text-left">เช็คอิน</th>
                    <th className="px-4 py-3 text-left">เช็คเอาท์</th>
                    <th className="px-4 py-3 text-left">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingData.records.map(row => (
                    <tr key={row.attendanceId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.fullNameTh}</td>
                      <td className="px-4 py-3 text-gray-700">{row.date}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.checkOutTime ? new Date(row.checkOutTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{row.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <EmptyState />
        )
      )}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-white py-12 text-center shadow-sm ring-1 ring-gray-100">
      <p className="text-sm text-gray-400">{t('report.noReport')}</p>
      <p className="mt-1 text-xs text-gray-300">เลือกช่วงเวลาและกด "สร้างรายงาน"</p>
    </div>
  );
}
