import { useEffect, useState } from 'react';
import type { AttendanceRecord, Department } from '@hospital-hr/shared';
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
import { getAttendance, photoSrc } from '../../api/attendance';
import { Modal } from '../../components/ui/Modal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'weekly' | 'monthly' | 'planned' | 'pending';

// ─── Lazy snap detail modal ───────────────────────────────────────────────────
//
// Fetches the full attendance record (including photo paths) only when the
// user clicks "View Snap". The <img> elements are created only inside the
// modal — never in the report list rows.

function SnapDetailModal({
  attendanceId,
  onClose,
}: {
  attendanceId: string | null;
  onClose:      () => void;
}) {
  const [record,  setRecord]  = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Fetch only when the modal is opened (attendanceId becomes non-null)
  useEffect(() => {
    if (!attendanceId) { setRecord(null); return; }
    setLoading(true);
    setError('');
    getAttendance(attendanceId)
      .then(setRecord)
      .catch(e => setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [attendanceId]);

  const checkInSrc  = photoSrc(record?.checkInPhoto);
  const checkOutSrc = photoSrc(record?.checkOutPhoto);

  return (
    <Modal open={!!attendanceId} onClose={onClose} title="รายละเอียดการเช็คอิน" wide>
      {loading && (
        <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด…</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}
      {record && !loading && (
        <div className="space-y-4">
          {/* Times + GPS */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-400 mb-1">เช็คอิน</p>
              <p className="font-medium">
                {record.checkInTime
                  ? new Date(record.checkInTime).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </p>
              {record.checkInLat != null && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {record.checkInLat.toFixed(5)}, {record.checkInLng?.toFixed(5)}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-400 mb-1">เช็คเอาท์</p>
              <p className="font-medium">
                {record.checkOutTime
                  ? new Date(record.checkOutTime).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </p>
              {record.checkOutLat != null && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {record.checkOutLat.toFixed(5)}, {record.checkOutLng?.toFixed(5)}
                </p>
              )}
            </div>
          </div>

          {/* Evidence photos — only loaded when this modal is open */}
          <div className="flex flex-wrap gap-4">
            {checkInSrc && (
              <div>
                <p className="text-xs text-gray-400 mb-1">รูปเช็คอิน</p>
                <img src={checkInSrc} alt="check-in"
                     className="h-48 w-48 rounded-xl object-cover border border-gray-100" />
              </div>
            )}
            {checkOutSrc && (
              <div>
                <p className="text-xs text-gray-400 mb-1">รูปเช็คเอาท์</p>
                <img src={checkOutSrc} alt="check-out"
                     className="h-48 w-48 rounded-xl object-cover border border-gray-100" />
              </div>
            )}
            {!checkInSrc && !checkOutSrc && (
              <p className="text-sm text-gray-400">— ไม่มีรูปภาพ</p>
            )}
          </div>

          {record.note && (
            <p className="text-xs text-gray-500">หมายเหตุ: {record.note}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

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

  // Snap detail modal — holds the attendanceId of the selected row, or null when closed
  const [snapId, setSnapId] = useState<string | null>(null);

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

      {/* Lazy snap modal — image network request fires only when snapId is set */}
      <SnapDetailModal attendanceId={snapId} onClose={() => setSnapId(null)} />

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
                    <th className="px-4 py-3 text-left">หลักฐาน</th>
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
                      {/* View Snap: image fetched only on click, never on list render */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSnapId(row.attendanceId)}
                          className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24"
                               stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          View Snap
                        </button>
                      </td>
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
