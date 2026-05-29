/**
 * ApprovalDashboard.tsx
 *
 * Manager view for reviewing late-arrival and OT approval requests.
 *
 * Data flow:
 *   - On mount / tab switch: fetch records for the active status tab from
 *     GET /api/attendance-approvals?status=<tab>
 *   - PENDING tab: optimistic update โ€” remove the row immediately, PATCH in
 *     the background, re-fetch on error to restore consistency
 *   - APPROVED / REJECTED tabs: read-only history from the server
 *
 * Reject uses an inline confirm dialog (built on the existing Modal component)
 * rather than a browser confirm(), keeping the UX consistent with the rest of
 * the admin panel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@hospital-hr/shared';
import { employeeApi } from '../../api/employees';
import { getApprovals, updateApprovalStatus } from '../../api/approvals';
import type { AttendanceApproval, ApprovalStatus } from '../../api/approvals';
import { PageSpinner, Spinner } from '../../components/Spinner';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useRealtime } from '../../hooks/useRealtime';

// โ”€โ”€โ”€ Helpers โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} นาที`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

const TYPE_LABEL: Record<AttendanceApproval['type'], string> = {
  LATE: 'มาสาย',
  OT:   'ล่วงเวลา',
};

const TYPE_STYLE: Record<AttendanceApproval['type'], string> = {
  LATE: 'bg-orange-100 text-orange-700',
  OT:   'bg-blue-100   text-blue-700',
};

// โ”€โ”€โ”€ Reject confirm dialog โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function RejectDialog({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open:      boolean;
  onClose:   () => void;
  onConfirm: () => void;
  busy:      boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="ยืนยันการปฏิเสธ">
      <p className="text-sm text-gray-600">
        คุณต้องการปฏิเสธคำขออนุมัตินี้ใช่หรือไม่?
        <br />
        การดำเนินการนี้ไม่สามารถยกเลิกได้
      </p>
      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium
            text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2
            text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy && <Spinner size="sm" color="white" />}
          ปฏิเสธ
        </button>
      </div>
    </Modal>
  );
}

// โ”€โ”€โ”€ Approval row โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

function ApprovalRow({
  approval,
  employeeMap,
  busy,
  onApprove,
  onRejectClick,
}: {
  approval:      AttendanceApproval;
  employeeMap:   Map<string, UserProfile>;
  busy:          boolean;
  onApprove:     (id: string) => void;
  onRejectClick: (id: string) => void;
}) {
  const emp  = employeeMap.get(approval.employeeId);
  const name = emp
    ? `${emp.firstNameTh} ${emp.lastNameTh}`
    : approval.employeeId;
  const code = emp?.employeeCode ?? 'โ€”';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Employee */}
      <td className="px-4 py-3.5">
        <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{name}</p>
        <p className="text-xs text-gray-400">{code}</p>
      </td>

      {/* Type */}
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
          ${TYPE_STYLE[approval.type]}`}>
          {TYPE_LABEL[approval.type]}
        </span>
      </td>

      {/* Minutes */}
      <td className="px-4 py-3.5 tabular-nums text-sm text-gray-700">
        {fmtMinutes(approval.minutes)}
      </td>

      {/* Created */}
      <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">
        {fmtDateTime(approval.createdAt)}
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <StatusBadge status={approval.status} />
      </td>

      {/* Actions โ€” only rendered for PENDING rows */}
      <td className="px-4 py-3.5">
        {approval.status === 'PENDING' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(approval.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5
                text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50
                transition-colors"
            >
              {busy && <Spinner size="sm" color="white" />}
              อนุมัติ
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRejectClick(approval.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200
                bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600
                hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              ปฏิเสธ
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">
            {approval.reviewedAt ? fmtDateTime(approval.reviewedAt) : 'โ€”'}
          </span>
        )}
      </td>
    </tr>
  );
}

// โ”€โ”€โ”€ Filter tab โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

const FILTER_TABS: { value: ApprovalStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING',  label: 'รอการอนุมัติ' },
  { value: 'APPROVED', label: 'อนุมัติกลฉว'   },
  { value: 'REJECTED', label: 'ถูกปฏิเสธ'     },
];

// โ”€โ”€โ”€ Page โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

export default function ApprovalDashboard() {
  // โ”€โ”€ Per-tab record cache โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [records,     setRecords]     = useState<AttendanceApproval[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Map<string, UserProfile>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // โ”€โ”€ Per-row action state โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // โ”€โ”€ Filter โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus>('PENDING');

  // โ”€โ”€ Reject confirm dialog โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const rejectBusy = rejectTarget !== null && busyIds.has(rejectTarget);

  // โ”€โ”€ Realtime updates โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  useRealtime({
    // A new PENDING approval arrived โ€” prepend to the list when on the PENDING tab
    onApprovalCreated: (record) => {
      if (filterStatus !== 'PENDING') return;
      setRecords((prev) =>
        prev.some((r) => r.id === record.id) ? prev : [record, ...prev],
      );
    },
    // An approval was reviewed by someone else (or the same manager in another tab)
    onApprovalUpdated: (record) => {
      setRecords((prev) => {
        const filtered = prev.filter((r) => r.id !== record.id);
        // On APPROVED / REJECTED tabs: add the record if its new status matches the tab
        if (filterStatus === record.status) {
          return prev.some((r) => r.id === record.id)
            ? filtered          // already present โ’ just remove stale copy
            : [record, ...filtered];
        }
        return filtered;
      });
    },
  });

  // โ”€โ”€ Error auto-clear โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showError(msg: string) {
    setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(''), 5000);
  }

  // โ”€โ”€ Load (re-runs whenever the active tab changes) โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  const load = useCallback(async (status: ApprovalStatus) => {
    setLoading(true);
    setError('');
    try {
      const [approvals, emps] = await Promise.all([
        getApprovals(status),
        employeeMap.size > 0
          ? Promise.resolve({ items: [] as UserProfile[] })   // already loaded
          : employeeApi.list({ pageSize: 500 }).catch(() => ({ items: [] as UserProfile[] })),
      ]);
      setRecords(approvals);
      if (emps.items.length > 0) {
        const map = new Map<string, UserProfile>();
        emps.items.forEach((e) => map.set(e.id, e));
        setEmployeeMap(map);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // employeeMap excluded intentionally โ€” we only want to load it once

  useEffect(() => { load(filterStatus); }, [load, filterStatus]);

  // โ”€โ”€ Actions โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  async function handleReview(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyIds((s) => new Set(s).add(id));

    // Optimistic: remove the row from the PENDING list immediately
    const target = records.find((r) => r.id === id);
    setRecords((prev) => prev.filter((r) => r.id !== id));

    try {
      await updateApprovalStatus(id, decision);
    } catch (err) {
      // Rollback: restore the original row and show an error
      if (target) setRecords((prev) => [target, ...prev]);
      showError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
      setRejectTarget(null);
    }
  }

  function handleApprove(id: string) {
    handleReview(id, 'APPROVED');
  }

  function handleRejectConfirm() {
    if (rejectTarget) handleReview(rejectTarget, 'REJECTED');
  }

  // โ”€โ”€ Tab switch โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  function handleTabChange(status: ApprovalStatus) {
    setFilterStatus(status);
    // load() fires via the useEffect above
  }

  const displayList = records;

  // โ”€โ”€ Render โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€

  return (
    <div className="p-6 max-w-5xl space-y-6">

      {/* โ”€โ”€ Header โ”€โ”€ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">คิวอนุมัติ</h1>
          <p className="mt-1 text-sm text-gray-400">
            คำขออนุมัติการมาสายและล่วงเวลาที่รอการพิจารณา
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(filterStatus)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2
            text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading ? <Spinner size="sm" color="gray" /> : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          รีเฟรช
        </button>
      </div>

      {/* โ”€โ”€ Error banner โ”€โ”€ */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm
          text-red-600 ring-1 ring-red-200">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* โ”€โ”€ Filter tabs โ”€โ”€ */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {FILTER_TABS.map(({ value, label }) => {
          if (value === 'ALL') return null;
          const active = filterStatus === value;
          // Show count badge only for the active tab (avoids stale numbers from other tabs)
          const count = active && !loading ? displayList.length : 0;
          return (
            <button
              key={value}
              type="button"
              onClick={() => handleTabChange(value as ApprovalStatus)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
                transition-colors
                ${active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
              {count > 0 && (
                <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center
                  rounded-full px-1 text-[10px] font-bold leading-none
                  ${value === 'PENDING'  ? 'bg-yellow-100 text-yellow-700'
                  : value === 'APPROVED' ? 'bg-green-100  text-green-700'
                  :                        'bg-red-100    text-red-600'}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* โ”€โ”€ Content โ”€โ”€ */}
      {loading ? (
        <PageSpinner />
      ) : displayList.length === 0 ? (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-gray-100">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center
            rounded-full bg-gray-100">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-600">
            {filterStatus === 'PENDING'
              ? 'ไม่มีรายการรออนุมัติ'
              : filterStatus === 'APPROVED'
              ? 'ยังไม่มีรายการที่อนุมัติในเซสชันนี้'
              : 'ยังไม่มีรายการที่ปฏิเสธในเซสชันนี้'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {filterStatus === 'PENDING' ? 'พนักงานทุกคนมาตรงเวลาแล้ว 🎉' : ''}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-100 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">พนักงาน</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">ประเภท</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">ระยะเวลา</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">เวลาที่แจ้ง</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">สถานะ</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayList.map((a) => (
                  <ApprovalRow
                    key={a.id}
                    approval={a}
                    employeeMap={employeeMap}
                    busy={busyIds.has(a.id)}
                    onApprove={handleApprove}
                    onRejectClick={(id) => setRejectTarget(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="sm:hidden divide-y divide-gray-100">
            {displayList.map((a) => {
              const emp  = employeeMap.get(a.employeeId);
              const name = emp ? `${emp.firstNameTh} ${emp.lastNameTh}` : a.employeeId;
              const busy = busyIds.has(a.id);

              return (
                <div key={a.id} className="p-4 space-y-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-400">{emp?.employeeCode ?? 'โ€”'}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                    <span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs
                        font-semibold ${TYPE_STYLE[a.type]}`}>
                        {TYPE_LABEL[a.type]}
                      </span>
                    </span>
                    <span>{fmtMinutes(a.minutes)}</span>
                    <span className="text-xs text-gray-400">{fmtDateTime(a.createdAt)}</span>
                  </div>

                  {/* Actions */}
                  {a.status === 'PENDING' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleApprove(a.id)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl
                          bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700
                          disabled:opacity-50 transition-colors"
                      >
                        {busy && <Spinner size="sm" color="white" />}
              อนุมัติ
            </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejectTarget(a.id)}
                        className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2
                          text-sm font-semibold text-red-600 hover:bg-red-100
                          disabled:opacity-50 transition-colors"
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* โ”€โ”€ Reject confirm dialog โ”€โ”€ */}
      <RejectDialog
        open={rejectTarget !== null}
        onClose={() => { if (!rejectBusy) setRejectTarget(null); }}
        onConfirm={handleRejectConfirm}
        busy={rejectBusy}
      />

    </div>
  );
}

