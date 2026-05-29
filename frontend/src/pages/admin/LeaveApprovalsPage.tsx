import { useCallback, useEffect, useState } from 'react';
import { ROLE_LEVEL } from '@hospital-hr/shared';
import type { Branch, UserProfile } from '@hospital-hr/shared';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../api/leave';
import { employeeApi } from '../../api/employees';
import { branchApi } from '../../api/branches';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';
import { Modal } from '../../components/ui/Modal';

// โ”€โ”€โ”€ Helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

const STATUS_STYLE: Record<string, string> = {
  pending:          'bg-yellow-100 text-yellow-700',
  manager_approved: 'bg-blue-100   text-blue-700',
  hr_approved:      'bg-green-100  text-green-700',
  rejected:         'bg-red-100    text-red-600',
};

// โ”€โ”€โ”€ Status filter โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

type StatusFilter = 'ALL' | LeaveStatus;

const STATUS_TABS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'ALL',              labelKey: 'common.all' },
  { value: 'pending',          labelKey: 'leave.status.pending' },
  { value: 'manager_approved', labelKey: 'leave.status.manager_approved' },
  { value: 'hr_approved',      labelKey: 'leave.status.hr_approved' },
  { value: 'rejected',         labelKey: 'leave.status.rejected' },
];

// โ”€โ”€โ”€ Reject modal โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function RejectModal({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open:      boolean;
  onClose:   () => void;
  onConfirm: (reason: string) => void;
  busy:      boolean;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  function handleConfirm() {
    onConfirm(reason.trim());
    setReason('');
  }

  return (
    <Modal open={open} onClose={onClose} title={t('leave.reject')}>
      <div className="space-y-4 pt-1">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            {t('leave.rejectReason')} <span className="text-gray-400">({t('common.optional')})</span>
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="ระบุเหตุผล..."
            className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? t('common.loading') : t('leave.reject')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// โ”€โ”€โ”€ Leave card โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function LeaveCard({
  item,
  employee,
  userLevel,
  actionPending,
  onApproveManager,
  onApproveHR,
  onReject,
}: {
  item:             LeaveRequest;
  employee?:        UserProfile;
  userLevel:        number;
  actionPending:    boolean;
  onApproveManager: (id: string) => void;
  onApproveHR:      (id: string) => void;
  onReject:         (id: string) => void;
}) {
  const { t } = useTranslation();
  const days = daysBetween(item.startDate, item.endDate);
  const empName = employee
    ? `${employee.firstNameTh} ${employee.lastNameTh}`
    : item.userId;

  const canApproveManager = userLevel >= 3 && item.status === 'pending';
  const canApproveHR      = userLevel >= 4 && item.status === 'manager_approved';
  const canReject         = userLevel >= 3 && item.status !== 'hr_approved' && item.status !== 'rejected';
  const hasActions        = canApproveManager || canApproveHR || canReject;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Body */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{empName}</p>
            {employee && (
              <p className="text-xs text-gray-400 mt-0.5">{employee.employeeCode}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {t(`leave.types.${item.leaveType}` as any)}
              </span>
              <span className="text-xs text-gray-400">
                {t(`leave.durationTypes.${item.durationType}` as any)}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-700">
              {formatDate(item.startDate)}
              {item.startDate !== item.endDate && ` โ€“ ${formatDate(item.endDate)}`}
              {' '}
              <span className="text-gray-400 text-xs">({days} วัน)</span>
            </p>
            {item.reason && (
              <p className="mt-1.5 text-sm text-gray-500">{item.reason}</p>
            )}
            {item.rejectedReason && (
              <p className="mt-1 text-xs text-red-500">เหตุผลที่ปฏิเสธ: {item.rejectedReason}</p>
            )}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {t(`leave.status.${item.status}` as any)}
          </span>
        </div>
      </div>

      {/* Actions */}
      {hasActions && (
        <div className="flex border-t border-gray-100">
          {canReject && (
            <button
              onClick={() => onReject(item.id)}
              disabled={actionPending}
              className="flex-1 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors border-r border-gray-100"
            >
              {t('leave.reject')}
            </button>
          )}
          {canApproveManager && (
            <button
              onClick={() => onApproveManager(item.id)}
              disabled={actionPending}
              className="flex-1 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {t('leave.approveManager')}
            </button>
          )}
          {canApproveHR && (
            <button
              onClick={() => onApproveHR(item.id)}
              disabled={actionPending}
              className="flex-1 py-3 text-sm font-semibold text-green-600 hover:bg-green-50 active:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {t('leave.approveHR')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// โ”€โ”€โ”€ Page โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export default function LeaveApprovalsPage() {
  const { t }    = useTranslation();
  const { user } = useAuth();

  const isSuperAdmin = user?.role === 'super_admin';
  const userLevel    = user ? ROLE_LEVEL[user.role] : 0;

  const [items,        setItems]        = useState<LeaveRequest[]>([]);
  const [employeeMap,  setEmployeeMap]  = useState<Map<string, UserProfile>>(new Map());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [branches,     setBranches]     = useState<Branch[]>([]);
  const [filterBranchId, setFilterBranchId] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [pending,      setPending]      = useState<Set<string>>(new Set());
  const [toast,        setToast]        = useState('');

  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectBusy,   setRejectBusy]   = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

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
      const filters: Record<string, string> = {};
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      if (filterBranchId)         filters.branchId = filterBranchId;
      const data = await leaveApi.list(filters as any);
      setItems([...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, filterBranchId, t]);

  useEffect(() => { load(); }, [load]);

  function setBusy(id: string, on: boolean) {
    setPending(s => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }

  async function handleApproveManager(id: string) {
    setBusy(id, true);
    try {
      const updated = await leaveApi.approveByManager(id);
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      showToast(t('leave.approveManagerSuccess'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setBusy(id, false);
    }
  }

  async function handleApproveHR(id: string) {
    setBusy(id, true);
    try {
      const updated = await leaveApi.approveByHR(id);
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      showToast(t('leave.approveHRSuccess'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setBusy(id, false);
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      const updated = await leaveApi.reject(rejectTarget, reason || undefined);
      setItems(prev => prev.map(i => i.id === rejectTarget ? updated : i));
      showToast(t('leave.rejectSuccess'));
      setRejectTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setRejectBusy(false);
    }
  }

  // Apply status filter client-side (list is already filtered server-side for non-ALL)
  const displayed = statusFilter === 'ALL'
    ? items
    : items.filter(i => i.status === statusFilter);

  return (
    <div className="p-6 max-w-3xl">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('leave.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">อนุมัติและจัดการคำขอลาของพนักงาน</p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && branches.length > 0 && (
            <select
              value={filterBranchId}
              onChange={e => setFilterBranchId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            >
              <option value="">— ทุกสาขา —</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.nameTh}</option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-colors
              ${statusFilter === tab.value
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t(tab.labelKey as any)}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <PageSpinner />
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm">
          <p className="text-2xl mb-2">๐“</p>
          <p className="text-sm text-gray-500">{t('leave.noRequests')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(item => (
            <LeaveCard
              key={item.id}
              item={item}
              employee={employeeMap.get(item.userId)}
              userLevel={userLevel}
              actionPending={pending.has(item.id)}
              onApproveManager={handleApproveManager}
              onApproveHR={handleApproveHR}
              onReject={id => setRejectTarget(id)}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      <RejectModal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
        busy={rejectBusy}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-2xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

