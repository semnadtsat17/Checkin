import { useEffect, useState } from 'react';
import { leaveApi, type LeaveRequest, type LeaveType, type LeaveDurationType } from '../../api/leave';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';
import { Modal } from '../../components/ui/Modal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const LEAVE_TYPES: LeaveType[]         = ['SICK', 'VACATION', 'PERSONAL', 'OTHER'];
const DURATION_TYPES: LeaveDurationType[] = ['FULL_DAY', 'HALF_DAY'];

// ─── New-leave form state ─────────────────────────────────────────────────────

interface FormState {
  leaveType:    LeaveType;
  startDate:    string;
  endDate:      string;
  durationType: LeaveDurationType;
  reason:       string;
}

function defaultForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return { leaveType: 'SICK', startDate: today, endDate: today, durationType: 'FULL_DAY', reason: '' };
}

// ─── Status filter tab ────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'pending' | 'manager_approved' | 'hr_approved' | 'rejected';

const STATUS_TABS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'ALL',              labelKey: 'common.all' },
  { value: 'pending',          labelKey: 'leave.status.pending' },
  { value: 'manager_approved', labelKey: 'leave.status.manager_approved' },
  { value: 'hr_approved',      labelKey: 'leave.status.hr_approved' },
  { value: 'rejected',         labelKey: 'leave.status.rejected' },
];

// ─── Leave card ───────────────────────────────────────────────────────────────

function LeaveCard({ item }: { item: LeaveRequest }) {
  const { t } = useTranslation();
  const days = daysBetween(item.startDate, item.endDate);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">
              {t(`leave.types.${item.leaveType}` as any)}
            </span>
            <span className="text-xs text-gray-400">
              {t(`leave.durationTypes.${item.durationType}` as any)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {formatDate(item.startDate)}
            {item.startDate !== item.endDate && ` – ${formatDate(item.endDate)}`}
            {' '}
            <span className="text-gray-400">({days} วัน)</span>
          </p>
          {item.reason && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{item.reason}</p>
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
  );
}

// ─── New-leave modal ──────────────────────────────────────────────────────────

function LeaveForm({
  open,
  onClose,
  onCreated,
}: {
  open:      boolean;
  onClose:   () => void;
  onCreated: (item: LeaveRequest) => void;
}) {
  const { t } = useTranslation();
  const [form,    setForm]    = useState<FormState>(defaultForm);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reason.trim()) { setError('กรุณาระบุเหตุผล'); return; }
    if (form.endDate < form.startDate) { setError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม'); return; }

    setSaving(true);
    setError('');
    try {
      const created = await leaveApi.create(form);
      onCreated(created);
      setForm(defaultForm());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500';

  return (
    <Modal open={open} onClose={onClose} title={t('leave.request')}>
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">

        {/* Leave type */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('leave.type')}</label>
          <select
            value={form.leaveType}
            onChange={e => set('leaveType', e.target.value as LeaveType)}
            className={inputCls}
          >
            {LEAVE_TYPES.map(lt => (
              <option key={lt} value={lt}>{t(`leave.types.${lt}` as any)}</option>
            ))}
          </select>
        </div>

        {/* Duration type */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('leave.durationType')}</label>
          <div className="flex gap-2">
            {DURATION_TYPES.map(dt => (
              <button
                key={dt}
                type="button"
                onClick={() => set('durationType', dt)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors
                  ${form.durationType === dt
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {t(`leave.durationTypes.${dt}` as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('leave.startDate')}</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => {
                set('startDate', e.target.value);
                if (e.target.value > form.endDate) set('endDate', e.target.value);
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('leave.endDate')}</label>
            <input
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={e => set('endDate', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Days preview */}
        {form.startDate && form.endDate && form.endDate >= form.startDate && (
          <p className="text-xs text-gray-500 text-right">
            รวม {daysBetween(form.startDate, form.endDate)} วัน
          </p>
        )}

        {/* Reason */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('leave.reason')}</label>
          <textarea
            rows={3}
            value={form.reason}
            onChange={e => set('reason', e.target.value)}
            placeholder="ระบุเหตุผลการลา..."
            className={`${inputCls} resize-none`}
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? t('common.loading') : t('common.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { t } = useTranslation();

  const [items,        setItems]        = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [formOpen,     setFormOpen]     = useState(false);
  const [toast,        setToast]        = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    leaveApi.list()
      .then(data => setItems([...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(e => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = statusFilter === 'ALL'
    ? items
    : items.filter(i => i.status === statusFilter);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">{t('leave.title')}</h1>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 active:bg-primary-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('leave.request')}
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
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
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        {/* List */}
        {loading ? (
          <PageSpinner />
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{t('leave.noRequests')}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => <LeaveCard key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {/* New-leave modal */}
      <LeaveForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={item => {
          setItems(prev => [item, ...prev]);
          showToast(t('leave.requestSuccess'));
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-2xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
