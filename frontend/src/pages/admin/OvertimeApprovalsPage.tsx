import { useCallback, useEffect, useState } from 'react';
import type { OvertimeRequest, ShiftTransferRequest, Department } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { overtimeApi } from '../../api/overtime';
import { shiftTransferApi } from '../../api/shiftTransfer';
import { deptApi } from '../../api/departments';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'long',
  });
}

// ─── Overtime Tab ─────────────────────────────────────────────────────────────

type OTFilter = 'all' | OvertimeRequest['status'];

function OvertimeTab() {
  const { t } = useTranslation();
  const [items,       setItems]       = useState<OvertimeRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterStatus, setFilterStatus] = useState<OTFilter>('pending');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [acting,      setActing]      = useState<string | null>(null);
  const [error,       setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await overtimeApi.list({
        status:       filterStatus === 'all' ? undefined : filterStatus,
        departmentId: filterDeptId || undefined,
      });
      setItems(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterStatus, filterDeptId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { deptApi.list().then((r) => setDepartments(r.items)).catch(() => {}); }, []);

  async function act(id: string, fn: () => Promise<unknown>) {
    setActing(id); setError('');
    try { await fn(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : t('error.generic')); }
    finally { setActing(null); }
  }

  function otBadge(status: OvertimeRequest['status']): { label: string; cls: string } {
    switch (status) {
      case 'pending':  return { label: 'รออนุมัติ',  cls: 'bg-yellow-100 text-yellow-700' };
      case 'approved': return { label: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700' };
      case 'rejected': return { label: 'ไม่อนุมัติ',  cls: 'bg-red-100 text-red-700' };
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as OTFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
          <option value="all">ทุกสถานะ</option>
          <option value="pending">รออนุมัติ</option>
          <option value="approved">อนุมัติแล้ว</option>
          <option value="rejected">ไม่อนุมัติ</option>
        </select>
        {departments.length > 0 && (
          <select value={filterDeptId} onChange={(e) => setFilterDeptId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="">{t('common.all')} ({t('nav.departments')})</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.nameTh}</option>)}
          </select>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        {loading ? <PageSpinner /> : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t('common.noData')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">วันที่</th>
                <th className="px-4 py-3 text-left">เวลา</th>
                <th className="px-4 py-3 text-left">ชั่วโมง</th>
                <th className="px-4 py-3 text-left">เหตุผล</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const badge = otBadge(item.status);
                const hrs   = Math.floor(item.durationMinutes / 60);
                const mins  = item.durationMinutes % 60;
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtDate(item.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{item.startTime}–{item.endTime}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {hrs > 0 ? `${hrs}ชม.` : ''}{mins > 0 ? `${mins}น.` : ''}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-600 truncate">{item.reason}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => act(item.id, () => overtimeApi.updateStatus(item.id, { status: 'approved' }))}
                            disabled={acting === item.id}
                            className="rounded-lg bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50">
                            {acting === item.id ? '…' : 'อนุมัติ'}
                          </button>
                          <button onClick={() => act(item.id, () => overtimeApi.updateStatus(item.id, { status: 'rejected' }))}
                            disabled={acting === item.id}
                            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                            {acting === item.id ? '…' : 'ไม่อนุมัติ'}
                          </button>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Shift Transfer Tab ───────────────────────────────────────────────────────

type STFilter = 'all' | ShiftTransferRequest['status'];

function ShiftTransferTab() {
  const { t } = useTranslation();
  const [items,       setItems]   = useState<ShiftTransferRequest[]>([]);
  const [loading,     setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<STFilter>('pending_manager');
  const [acting,      setActing]  = useState<string | null>(null);
  const [error,       setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await shiftTransferApi.list({
        status: filterStatus === 'all' ? undefined : filterStatus,
      });
      setItems(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, decision: 'approved' | 'rejected') {
    setActing(id); setError('');
    try { await shiftTransferApi.managerDecision(id, decision); load(); }
    catch (e) { setError(e instanceof Error ? e.message : t('error.generic')); }
    finally { setActing(null); }
  }

  function stBadge(status: ShiftTransferRequest['status']): { label: string; cls: string } {
    switch (status) {
      case 'pending_target':  return { label: 'รอผู้รับ',         cls: 'bg-gray-100 text-gray-600' };
      case 'pending_manager': return { label: 'รออนุมัติ',        cls: 'bg-yellow-100 text-yellow-700' };
      case 'approved':        return { label: 'อนุมัติแล้ว',      cls: 'bg-green-100 text-green-700' };
      case 'rejected':        return { label: 'ไม่อนุมัติ',        cls: 'bg-red-100 text-red-700' };
    }
  }

  return (
    <div>
      <div className="mb-4">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as STFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
          <option value="pending_manager">รออนุมัติ</option>
          <option value="all">ทุกสถานะ</option>
          <option value="approved">อนุมัติแล้ว</option>
          <option value="rejected">ไม่อนุมัติ</option>
        </select>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        {loading ? <PageSpinner /> : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t('common.noData')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">วันที่กะ</th>
                <th className="px-4 py-3 text-left">รหัสกะ</th>
                <th className="px-4 py-3 text-left">ผู้ส่ง</th>
                <th className="px-4 py-3 text-left">ผู้รับ</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const badge = stBadge(item.status);
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtDate(item.shiftDate)}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{item.shiftCode}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{item.senderId}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{item.receiverId}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'pending_manager' ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => act(item.id, 'approved')} disabled={acting === item.id}
                            className="rounded-lg bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50">
                            {acting === item.id ? '…' : 'อนุมัติ'}
                          </button>
                          <button onClick={() => act(item.id, 'rejected')} disabled={acting === item.id}
                            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                            {acting === item.id ? '…' : 'ไม่อนุมัติ'}
                          </button>
                        </div>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'overtime' | 'shift-transfer';

export default function OvertimeApprovalsPage() {
  const [tab, setTab] = useState<Tab>('overtime');

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">คำขออนุมัติ</h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {([
          { key: 'overtime',       label: 'ล่วงเวลา (OT)' },
          { key: 'shift-transfer', label: 'โอนเวร' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors
              ${tab === t.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overtime'       && <OvertimeTab />}
      {tab === 'shift-transfer' && <ShiftTransferTab />}
    </div>
  );
}
