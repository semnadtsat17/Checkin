import { useEffect, useState } from 'react';
import type { AttendanceRecord } from '@hospital-hr/shared';
import { getMyRecords } from '../../api/attendance';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTh(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

const STATUS_STYLE: Record<string, string> = {
  present:          'bg-green-100 text-green-700',
  late:             'bg-yellow-100 text-yellow-700',
  early_leave:      'bg-orange-100 text-orange-700',
  absent:           'bg-red-100 text-red-600',
  on_leave:         'bg-blue-100 text-blue-700',
  holiday:          'bg-gray-100 text-gray-500',
  pending_approval: 'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { t } = useTranslation();

  const [month,   setMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const { from, to } = toMonthRange(month);
    getMyRecords(from, to)
      .then(res => setRecords([...res].sort((a, b) => b.date.localeCompare(a.date))))
      .catch(e => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false));
  }, [month, t]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">{t('attendance.history')}</h1>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500"
          />
        </div>

        {/* Records */}
        {loading ? (
          <PageSpinner />
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t('common.noData')}</p>
        ) : (
          <div className="space-y-2">
            {records.map(rec => (
              <div key={rec.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDateTh(rec.date)}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
                      <span>
                        เข้า: <strong className="text-gray-700">
                          {rec.checkInTime ? formatHHMM(rec.checkInTime) : '—'}
                        </strong>
                      </span>
                      <span>
                        ออก: <strong className="text-gray-700">
                          {rec.checkOutTime ? formatHHMM(rec.checkOutTime) : '—'}
                        </strong>
                      </span>
                    </div>
                    {rec.note && (
                      <p className="mt-1 text-xs text-gray-400">{rec.note}</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {t(`attendance.status.${rec.status}` as any)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
