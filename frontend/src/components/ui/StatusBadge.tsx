/**
 * StatusBadge.tsx
 *
 * Pill badge for ApprovalStatus values.
 * PENDING → yellow  |  APPROVED → green  |  REJECTED → red
 */
import type { ApprovalStatus } from '../../api/approvals';

const STYLES: Record<ApprovalStatus, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100  text-green-700',
  REJECTED: 'bg-red-100    text-red-600',
};

const LABELS: Record<ApprovalStatus, string> = {
  PENDING:  'รอการอนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ถูกปฏิเสธ',
};

interface StatusBadgeProps {
  status: ApprovalStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
