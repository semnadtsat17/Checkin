import { useEffect, useState } from 'react';
import type { OvertimeRequest } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { overtimeApi, type CreateOvertimeDto } from '../../api/overtime';
import { Modal } from '../../components/ui/Modal';
import { Spinner, PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function statusBadge(status: OvertimeRequest['status']): { label: string; cls: string } {
  switch (status) {
    case 'pending':  return { label: 'รออนุมัติ', cls: 'bg-yellow-100 text-yellow-700' };
    case 'approved': return { label: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700' };
    case 'rejected': return { label: 'ไม่อนุมัติ', cls: 'bg-red-100 text-red-700' };
  }
}

// ─── Request form ──────────────────────────────────────────────────────────────

function OvertimeForm({
  onSave,
  onCancel,
}: {
  onSave:   (dto: CreateOvertimeDto) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [date,      setDate]      = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime,   setEndTime]   = useState('');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date)      { setError('กรุณาเลือกวันที่');     return; }
    if (!startTime) { setError('กรุณากรอกเวลาเริ่ม'); return; }
    if (!endTime)   { setError('กรุณากรอกเวลาสิ้นสุด'); return; }
    if (!reason.trim()) { setError('กรุณากรอกเหตุผล'); return; }
    setSaving(true);
    try {
      await onSave({ date, startTime, endTime, reason: reason.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">วันที่ทำงานล่วงเวลา *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เวลาเริ่ม *</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เวลาสิ้นสุด *</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผล *</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="ระบุเหตุผลที่ต้องทำงานล่วงเวลา"
          className={inputCls}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {saving ? <><Spinner size="sm" color="white" className="mr-1.5 inline-block" />{t('common.loading')}</> : 'ส่งคำขอ'}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OvertimePage() {
  const { t } = useTranslation();
  const [items,    setItems]    = useState<OvertimeRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error,    setError]    = useState('');

  function load() {
    setLoading(true);
    overtimeApi.my()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave(dto: CreateOvertimeDto) {
    await overtimeApi.create(dto);
    setShowForm(false);
    load();
  }

  async function handleCancel(id: string) {
    if (!window.confirm('ยกเลิกคำขอล่วงเวลานี้?')) return;
    setCancelling(id);
    setError('');
    try {
      await overtimeApi.cancel(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">คำขอทำงานล่วงเวลา</h1>
          <p className="text-sm text-gray-400">{items.length} รายการ</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + ยื่นคำขอ
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* List */}
      {loading ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 shadow-sm ring-1 ring-gray-100">
          <p className="text-sm text-gray-400">ยังไม่มีคำขอล่วงเวลา</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const badge = statusBadge(item.status);
            const hrs = Math.floor(item.durationMinutes / 60);
            const mins = item.durationMinutes % 60;
            return (
              <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{fmtDate(item.date)}</p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {item.startTime} – {item.endTime}
                      <span className="ml-2 text-gray-400">
                        ({hrs > 0 ? `${hrs} ชม.` : ''}{mins > 0 ? ` ${mins} นาที` : ''})
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{item.reason}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                {item.status === 'pending' && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleCancel(item.id)}
                      disabled={cancelling === item.id}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      {cancelling === item.id
                        ? <Spinner size="sm" className="inline-block" />
                        : 'ยกเลิกคำขอ'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="ยื่นคำขอทำงานล่วงเวลา">
        <OvertimeForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}
