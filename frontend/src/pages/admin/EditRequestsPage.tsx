/**
 * EditRequestsPage โ€” HR reviews manager-submitted edit requests.
 *
 * Managers submit edit requests to change attendance timestamps (e.g. fix a
 * forgotten check-out). HR reviews each request showing:
 *   - Employee name + original attendance record with photos
 *   - What the manager wants to change (original โ’ requested)
 *   - The manager's reason
 *   - Approve / Reject (with rejection reason)
 */
import { useCallback, useEffect, useState } from 'react';
import type { AttendanceRecord, Branch, EditRequest, UserProfile } from '@hospital-hr/shared';
import { editRequestApi } from '../../api/editRequests';
import { getAttendance, photoSrc } from '../../api/attendance';
import { employeeApi } from '../../api/employees';
import { branchApi } from '../../api/branches';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';

// โ”€โ”€โ”€ Helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function fmtDT(iso?: string): string {
  if (!iso) return 'โ€”';
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

// โ”€โ”€โ”€ Photo thumbnail โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function PhotoThumb({ src, label }: { src: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className="text-xs text-gray-300">โ€” ไม่มีรูป</span>;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-xl border border-gray-100 hover:opacity-90 transition-opacity"
      >
        <img src={src} alt={label} className="h-24 w-24 object-cover" />
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

// โ”€โ”€โ”€ Status badge โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

const STATUS_STYLE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

// โ”€โ”€โ”€ Request card โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function RequestCard({
  req,
  attendance,
  employeeMap,
  requestorMap,
  onApprove,
  onReject,
  actionPending,
}: {
  req:           EditRequest;
  attendance:    AttendanceRecord | null;
  employeeMap:   Map<string, UserProfile>;
  requestorMap:  Map<string, UserProfile>;
  onApprove:     (id: string) => void;
  onReject:      (id: string, reason: string) => void;
  actionPending: boolean;
}) {
  const { t } = useTranslation();
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const employee  = attendance ? employeeMap.get(attendance.userId) : null;
  const requestor = requestorMap.get(req.requestedBy);

  const empName = employee
    ? `${employee.firstNameTh} ${employee.lastNameTh}`
    : (attendance?.userId ?? 'โ€”');
  const reqName = requestor
    ? `${requestor.firstNameTh} ${requestor.lastNameTh}`
    : req.requestedBy;

  const checkInPhoto  = photoSrc(attendance?.checkInPhoto);
  const checkOutPhoto = photoSrc(attendance?.checkOutPhoto);

  function submitReject() {
    onReject(req.id, rejectReason);
    setRejectOpen(false);
    setRejectReason('');
  }

  const isPending = req.status === 'pending';

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <p className="font-semibold text-gray-900">{empName}</p>
          {attendance && (
            <p className="text-sm text-gray-500 mt-0.5">{fmtDate(attendance.date)}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            ขอขดย: <span className="text-gray-600">{reqName}</span> ยท {fmtDT(req.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[req.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {t(`editRequest.status.${req.status}` as any)}
        </span>
      </div>

      {/* Photos */}
      {attendance && (
        <div className="px-5 pb-3 flex gap-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">{t('attendance.checkIn')}</p>
            <PhotoThumb src={checkInPhoto} label="check-in" />
          </div>
          {checkOutPhoto && (
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('attendance.checkOut')}</p>
              <PhotoThumb src={checkOutPhoto} label="check-out" />
            </div>
          )}
        </div>
      )}

      {/* Original โ’ Requested diff */}
      <div className="mx-5 mb-4 rounded-xl bg-gray-50 overflow-hidden divide-y divide-gray-100">
        {req.requestedData.checkInTime !== undefined && (
          <div className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-gray-400">{t('editRequest.originalTime>{t('editRequest.originalTime')} (เข้า)<editRequest.originalTime>{t('editRequest.originalTime')} (เข้า)<editRequest.originalTime>{t('editRequest.originalTime')} (ออก)<editRequest.requestedTime>{t('editRequest.originalTime')} (ออก)<common.remark')}</p>
            <p className="text-gray-700">{req.requestedData.note || '(ลบหมายเหตุ)'}</p>
          </div>
        )}
      </div>

      {/* Reason */}
      <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
        <p className="text-xs text-amber-600 mb-0.5 font-medium">{t('editRequest.reason')}</p>
        <p className="text-gray-700">{req.reason}</p>
      </div>

      {/* Rejection reason (if rejected) */}
      {req.status === 'rejected' && req.rejectReason && (
        <div className="mx-5 mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm">
          <p className="text-xs text-red-500 mb-0.5 font-medium">{t('editRequest.rejectReason')}</p>
          <p className="text-gray-700">{req.rejectReason}</p>
        </div>
      )}

      {/* Actions โ€” only for pending */}
      {isPending && (
        rejectOpen ? (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">{t('editRequest.rejectReason')}</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="ระบุเหตุผลที่ปฏิเสธ (ไม่บังคับ)"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitReject}
                disabled={actionPending}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
              >
                {t('editRequest.reject')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex border-t border-gray-100">
            <button
              onClick={() => setRejectOpen(true)}
              disabled={actionPending}
              className="flex-1 py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors border-r border-gray-100"
            >
              {t('editRequest.reject')}
            </button>
            <button
              onClick={() => onApprove(req.id)}
              disabled={actionPending}
              className="flex-1 py-3.5 text-sm font-semibold text-green-600 hover:bg-green-50 active:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {t('editRequest.approve')}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// โ”€โ”€โ”€ Page โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

type FilterStatus = 'pending' | 'approved' | 'rejected';

export default function EditRequestsPage() {
  const { t }    = useTranslation();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === 'super_admin';

  const [requests,       setRequests]       = useState<EditRequest[]>([]);
  const [attendanceMap,  setAttendanceMap]  = useState<Map<string, AttendanceRecord>>(new Map());
  const [employeeMap,    setEmployeeMap]    = useState<Map<string, UserProfile>>(new Map());
  const [branches,       setBranches]       = useState<Branch[]>([]);
  const [filter,         setFilter]         = useState<FilterStatus>('pending');
  const [filterBranchId, setFilterBranchId] = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [pending,        setPending]        = useState<Set<string>>(new Set());

  useEffect(() => {
    employeeApi.list({ pageSize: 500 })
      .then(r => {
        const map = new Map<string, UserProfile>();
        r.items.forEach(e => map.set(e.id, e));
        setEmployeeMap(map);
      })
      .catch(() => {});
    if (isSuperAdmin) {
      branchApi.list().then(setBranches).catch(() => {});
    }
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reqs = await editRequestApi.list({
        status:   filter,
        ...(filterBranchId ? { branchId: filterBranchId } : {}),
      });
      setRequests(reqs);

      // Eagerly load all distinct attendance records
      const uniqueAttendanceIds = [...new Set(reqs.map(r => r.attendanceId))];
      const entries = await Promise.all(
        uniqueAttendanceIds.map(id =>
          getAttendance(id).then(att => [id, att] as [string, AttendanceRecord]).catch(() => null)
        )
      );
      const map = new Map<string, AttendanceRecord>();
      entries.forEach(e => { if (e) map.set(e[0], e[1]); });
      setAttendanceMap(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }, [filter, filterBranchId, t]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(id: string) {
    setPending(s => new Set(s).add(id));
    try {
      const updated = await editRequestApi.approve(id);
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setPending(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function handleReject(id: string, reason: string) {
    setPending(s => new Set(s).add(id));
    try {
      const updated = await editRequestApi.reject(id, reason);
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setPending(s => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  const TABS: { key: FilterStatus; label: string }[] = [
    { key: 'pending',  label: `${t('editRequest.status.pending')} (${requests.filter(r => r.status === 'pending').length})` },
    { key: 'approved', label: t('editRequest.status.approved') },
    { key: 'rejected', label: t('editRequest.status.rejected') },
  ];

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('editRequest.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">คำขอแก้ไขเวลาจากผู้จัดการ รอการอนุมัติจาก HR</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {t('common.refresh')}
        </button>
      </div>

      {/* Branch filter -- only shown when super_admin has multiple branches */}
      {isSuperAdmin && branches.length > 0 && (
        <div className="mb-3">
          <select
            value={filterBranchId}
            onChange={(e) => setFilterBranchId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="">— ทุกสาขา —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.nameTh}</option>
            ))}
          </select>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors
              ${filter === tab.key ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <PageSpinner />
      ) : requests.length === 0 ? (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm">
          <p className="text-sm text-gray-400">{t('editRequest.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              attendance={attendanceMap.get(req.attendanceId) ?? null}
              employeeMap={employeeMap}
              requestorMap={employeeMap}
              onApprove={handleApprove}
              onReject={handleReject}
              actionPending={pending.has(req.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

