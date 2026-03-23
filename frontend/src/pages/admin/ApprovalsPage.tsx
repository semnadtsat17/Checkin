/**
 * ApprovalsPage — Manager reviews pending_approval attendance records.
 *
 * An employee who checks in without a scheduled shift gets status=pending_approval.
 * The manager sees each record with: employee name, date, check-in time,
 * check-in photo, GPS coordinates, and Approve / Reject actions.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AttendanceRecord, User } from '@hospital-hr/shared';
import {
  listAttendance,
  approveAttendance,
  rejectAttendance,
  photoSrc,
} from '../../api/attendance';
import { employeeApi } from '../../api/employees';
import { deptApi } from '../../api/departments';
import type { Department } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ─── Photo thumbnail with lightbox ───────────────────────────────────────────

function PhotoThumb({ src, label }: { src: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className="text-xs text-gray-300">— ไม่มีรูป</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-xl border border-gray-100 hover:opacity-90 transition-opacity"
      >
        <img src={src} alt={label} className="h-28 w-28 object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={label}
            className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Record card ─────────────────────────────────────────────────────────────

function ApprovalCard({
  record,
  employeeMap,
  onApprove,
  onReject,
  actionPending,
}: {
  record:        AttendanceRecord;
  employeeMap:   Map<string, User>;
  onApprove:     (id: string) => void;
  onReject:      (id: string) => void;
  actionPending: boolean;
}) {
  const { t } = useTranslation();
  const emp = employeeMap.get(record.userId);
  const name = emp ? `${emp.firstNameTh} ${emp.lastNameTh}` : record.userId;

  const checkInPhoto  = photoSrc(record.checkInPhoto);
  const checkOutPhoto = photoSrc(record.checkOutPhoto);

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <p className="font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{emp?.employeeCode}</p>
          <p className="text-sm text-gray-600 mt-1">{fmtDate(record.date)}</p>
        </div>
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
          {t('attendance.status.pending_approval')}
        </span>
      </div>

      {/* Times */}
      <div className="px-5 pb-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-400 mb-1">{t('attendance.checkInTime')}</p>
          <p className="font-medium text-gray-800">{fmtDateTime(record.checkInTime)}</p>
          {record.checkInLat && (
            <p className="text-xs text-gray-400 mt-1">
              {record.checkInLat.toFixed(5)}, {record.checkInLng?.toFixed(5)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-400 mb-1">{t('attendance.checkOutTime')}</p>
          <p className="font-medium text-gray-800">{fmtDateTime(record.checkOutTime)}</p>
          {record.checkOutLat && (
            <p className="text-xs text-gray-400 mt-1">
              {record.checkOutLat.toFixed(5)}, {record.checkOutLng?.toFixed(5)}
            </p>
          )}
        </div>
      </div>

      {/* Photos */}
      <div className="px-5 pb-4 flex gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1">{t('attendance.checkIn')}</p>
          <PhotoThumb src={checkInPhoto} label="check-in photo" />
        </div>
        {checkOutPhoto && (
          <div>
            <p className="text-xs text-gray-400 mb-1">{t('attendance.checkOut')}</p>
            <PhotoThumb src={checkOutPhoto} label="check-out photo" />
          </div>
        )}
      </div>

      {record.note && (
        <p className="px-5 pb-3 text-xs text-gray-500">
          หมายเหตุ: {record.note}
        </p>
      )}

      {/* Actions */}
      <div className="flex border-t border-gray-100">
        <button
          onClick={() => onReject(record.id)}
          disabled={actionPending}
          className="flex-1 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors border-r border-gray-100"
        >
          {t('editRequest.reject')}
        </button>
        <button
          onClick={() => onApprove(record.id)}
          disabled={actionPending}
          className="flex-1 py-3.5 text-sm font-semibold text-green-600 hover:bg-green-50 active:bg-green-100 disabled:opacity-50 transition-colors"
        >
          {t('editRequest.approve')}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { t } = useTranslation();

  const [records,     setRecords]     = useState<AttendanceRecord[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Map<string, User>>(new Map());
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptId,      setDeptId]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [pending,     setPending]     = useState<Set<string>>(new Set());

  // Load employees + departments once
  useEffect(() => {
    employeeApi.list({ pageSize: 500 })
      .then(r => {
        const map = new Map<string, User>();
        r.items.forEach(e => map.set(e.id, e));
        setEmployeeMap(map);
      })
      .catch(() => {});
    deptApi.list({ pageSize: 200 })
      .then(r => setDepartments(r.items))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAttendance({
        status: 'pending_approval',
        ...(deptId ? { deptId } : {}),
      });
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }, [deptId, t]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id: string) {
    setPending(s => new Set(s).add(id));
    try {
      await approveAttendance(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setPending(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function handleReject(id: string) {
    setPending(s => new Set(s).add(id));
    try {
      await rejectAttendance(id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setPending(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('dashboard.pendingApprovals')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">การลงเวลานอกตารางงาน รอการอนุมัติจากหัวหน้า</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={deptId}
            onChange={e => setDeptId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="">— ทุกแผนก —</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.nameTh}</option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <PageSpinner />
      ) : records.length === 0 ? (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm text-gray-500">ไม่มีรายการรออนุมัติ</p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map(record => (
            <ApprovalCard
              key={record.id}
              record={record}
              employeeMap={employeeMap}
              onApprove={handleApprove}
              onReject={handleReject}
              actionPending={pending.has(record.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
