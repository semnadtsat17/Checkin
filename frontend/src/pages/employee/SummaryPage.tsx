import { useEffect, useState } from 'react';
import type { MonthlySummary } from '../../api/attendance';
import { getMySummary } from '../../api/attendance';
import { useTranslation } from '../../i18n/useTranslation';
import { PageSpinner } from '../../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'text-gray-900',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const { t } = useTranslation();

  const [month,   setMonth]   = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setSummary(null);
    getMySummary(month)
      .then(setSummary)
      .catch(e => setError(e instanceof Error ? e.message : t('error.generic')))
      .finally(() => setLoading(false));
  }, [month, t]);

  // Progress bar: worked vs target
  const pct = summary && summary.monthlyTarget > 0
    ? clamp(Math.round((summary.workedHours / summary.monthlyTarget) * 100), 0, 100)
    : 0;

  const overtimePositive = summary ? summary.overtime >= 0 : false;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">{t('attendance.summary.title')}</h1>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary-500"
          />
        </div>

        {loading && <PageSpinner />}

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        {summary && (
          <>
            {/* Hours progress card */}
            <div className="rounded-2xl bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-gray-500">{t('attendance.summary.workedHours')}</p>
                  <p className="text-3xl font-bold text-gray-900 tabular-nums">
                    {summary.workedHours.toFixed(1)}
                    <span className="text-base font-normal text-gray-400 ml-1">ชม.</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{t('attendance.summary.monthlyTarget')}</p>
                  <p className="text-lg font-semibold text-gray-500 tabular-nums">
                    {summary.monthlyTarget}
                    <span className="text-sm font-normal ml-1">ชม.</span>
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-primary-500' : 'bg-yellow-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-right text-xs text-gray-400">{pct}%</p>

              {/* OT pill */}
              <div className="flex justify-center">
                <span className={`rounded-full px-4 py-1 text-sm font-semibold ${
                  overtimePositive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {t('attendance.summary.overtime')}:{' '}
                  {overtimePositive ? '+' : ''}{summary.overtime.toFixed(1)} ชม.
                </span>
              </div>
            </div>

            {/* Day stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label={t('attendance.summary.presentDays')}
                value={summary.presentDays}
                color="text-green-600"
              />
              <StatCard
                label={t('attendance.summary.lateDays')}
                value={summary.lateDays}
                color={summary.lateDays > 0 ? 'text-yellow-500' : 'text-gray-900'}
              />
              <StatCard
                label={t('attendance.summary.absentDays')}
                value={summary.absentDays}
                color={summary.absentDays > 0 ? 'text-red-500' : 'text-gray-900'}
              />
              <StatCard
                label={t('attendance.summary.leaveDays')}
                value={summary.leaveDays}
                color="text-blue-600"
              />
              <StatCard
                label={t('attendance.summary.earlyLeaveDays')}
                value={summary.earlyLeaveDays}
                color={summary.earlyLeaveDays > 0 ? 'text-orange-500' : 'text-gray-900'}
              />
              <StatCard
                label={t('attendance.summary.pendingDays')}
                value={summary.pendingDays}
                color={summary.pendingDays > 0 ? 'text-purple-500' : 'text-gray-900'}
              />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
