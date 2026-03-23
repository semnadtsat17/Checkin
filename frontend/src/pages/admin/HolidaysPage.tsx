import { useEffect, useMemo, useState } from 'react';
import type { HolidayType, HolidayDate } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { holidaysApi, type CreateTypeDto, type CreateDateDto } from '../../api/holidays';
import { formatHolidayDate, buildHolidayDate } from '../../utils/dateFormat';
import { useCurrentYear } from '../../hooks/useCurrentYear';
import { invalidateScheduleCache, } from '../../modules/schedule/scheduleInvalidator';
import { clearAllScheduleCache } from '../../modules/schedule/useResolvedSchedule';
import { Modal } from '../../components/ui/Modal';
import { Spinner, PageSpinner } from '../../components/Spinner';

/**
 * Bust schedule cache on all three layers so the employee /my-schedule view
 * always sees holiday changes immediately — no page reload required.
 *
 *  1. clearAllScheduleCache()    — drops the 5-min TTL cache for every month
 *     (works even when no useResolvedSchedule hook is currently mounted)
 *  2. invalidateScheduleCache()  — fires the pub-sub so any MOUNTED hook
 *     refetches immediately (e.g. employee has /my-schedule open in same tab)
 *  3. localStorage write          — fires StorageEvent in OTHER browser tabs
 *     (MySchedulePage listens on 'schedule-invalidate')
 */
function signalHolidayChange(): void {
  clearAllScheduleCache();
  invalidateScheduleCache();
  localStorage.setItem('schedule-invalidate', String(Date.now()));
}

// ─── Type form ────────────────────────────────────────────────────────────────

function TypeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: HolidayType | null;
  onSave:  (dto: CreateTypeDto) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name,   setName]   = useState(initial?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('กรุณากรอกชื่อประเภทวันหยุด'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('holiday.fields.name')} *
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {saving
            ? <><Spinner size="sm" color="white" className="mr-1.5 inline-block" />{t('common.loading')}</>
            : t('common.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Date form ────────────────────────────────────────────────────────────────

function DateForm({
  onSave,
  onCancel,
}: {
  onSave:   (dto: CreateDateDto) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name,    setName]    = useState('');
  const [date,    setDate]    = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('กรุณากรอกชื่อวันหยุด'); return; }
    if (!/^\d{2}-\d{2}$/.test(date)) { setError('รูปแบบวัน: MM-DD เช่น 04-13'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), date, enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อวันหยุด *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="เช่น วันสงกรานต์"
          autoFocus
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {t('holiday.fields.date')} *
        </label>
        <input
          value={date}
          onChange={e => setDate(e.target.value)}
          placeholder="04-13"
          maxLength={5}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="enabled"
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="enabled" className="text-sm text-gray-700">
          {t('holiday.fields.enabled')}
        </label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {saving
            ? <><Spinner size="sm" color="white" className="mr-1.5 inline-block" />{t('common.loading')}</>
            : t('common.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const UPCOMING_WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function isUpcomingHoliday(mmdd: string): boolean {
  const today        = new Date();
  const thisYearDate = buildHolidayDate(mmdd);
  const diff         = thisYearDate.getTime() - today.getTime();
  return diff >= 0 && diff <= UPCOMING_WINDOW_MS;
}

export default function HolidaysPage() {
  const { t, locale } = useTranslation();
  const currentYear    = useCurrentYear();

  // Types
  const [types,       setTypes]       = useState<HolidayType[]>([]);
  const [typesLoading,setTypesLoading]= useState(true);
  const [selectedType,setSelectedType]= useState<HolidayType | null>(null);

  // Type modal
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType,   setEditingType]   = useState<HolidayType | null>(null);

  // Dates
  const [dates,        setDates]        = useState<HolidayDate[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);

  // Sorted chronologically by MM-DD position in the year (memoized)
  const sortedDates = useMemo(
    () => [...dates].sort((a, b) => buildHolidayDate(a.date).getTime() - buildHolidayDate(b.date).getTime()),
    [dates],
  );

  // Date modal
  const [showDateModal, setShowDateModal] = useState(false);

  // Inline action state
  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // ── Load types ───────────────────────────────────────────────────────────────

  function loadTypes() {
    setTypesLoading(true);
    holidaysApi.listTypes()
      .then(setTypes)
      .catch(() => {})
      .finally(() => setTypesLoading(false));
  }

  useEffect(() => { loadTypes(); }, []);

  // ── Load dates when type selected ────────────────────────────────────────────

  useEffect(() => {
    if (!selectedType) { setDates([]); return; }
    setDatesLoading(true);
    holidaysApi.listDates(selectedType.id)
      .then(setDates)
      .catch(() => {})
      .finally(() => setDatesLoading(false));
  }, [selectedType]);

  // ── Type CRUD ────────────────────────────────────────────────────────────────

  async function handleSaveType(dto: { name: string }) {
    if (editingType) {
      await holidaysApi.updateType(editingType.id, dto);
    } else {
      await holidaysApi.createType(dto);
    }
    setShowTypeModal(false);
    loadTypes();
  }

  async function handleDeleteType(type: HolidayType) {
    if (!window.confirm(t('holiday.deleteTypeConfirm'))) return;
    setActionError('');
    try {
      await holidaysApi.deleteType(type.id);
      if (selectedType?.id === type.id) setSelectedType(null);
      loadTypes();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.generic'));
    }
  }

  // ── Date CRUD ────────────────────────────────────────────────────────────────

  async function handleSaveDate(dto: CreateDateDto) {
    if (!selectedType) return;
    await holidaysApi.createDate(selectedType.id, dto);
    setShowDateModal(false);
    const fresh = await holidaysApi.listDates(selectedType.id);
    setDates(fresh);
    signalHolidayChange();
  }

  async function handleToggleDate(hd: HolidayDate) {
    setTogglingId(hd.id);
    try {
      const updated = await holidaysApi.updateDate(hd.id, { enabled: !hd.enabled });
      setDates(prev => prev.map(d => d.id === updated.id ? updated : d));
      signalHolidayChange();
    } catch { /* ignore */ }
    finally { setTogglingId(null); }
  }

  async function handleDeleteDate(hd: HolidayDate) {
    if (!window.confirm(t('holiday.deleteDateConfirm'))) return;
    setDeletingId(hd.id);
    try {
      await holidaysApi.deleteDate(hd.id);
      setDates(prev => prev.filter(d => d.id !== hd.id));
      signalHolidayChange();
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  async function handleLoadPresets() {
    if (!selectedType) return;
    setPresetsLoading(true);
    setActionError('');
    try {
      await holidaysApi.loadPresets(selectedType.id);
      const fresh = await holidaysApi.listDates(selectedType.id);
      setDates(fresh);
      signalHolidayChange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setPresetsLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('holiday.title')}</h1>
        <p className="mt-0.5 text-sm text-gray-400">{types.length} ประเภทวันหยุด</p>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {actionError}
        </div>
      )}

      <div className="flex gap-6">

        {/* ── Left: Type list ──────────────────────────────────────────────── */}
        <div className="w-72 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">ประเภทวันหยุด</span>
            <button
              onClick={() => { setEditingType(null); setShowTypeModal(true); }}
              className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              <span>+</span> สร้าง
            </button>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
            {typesLoading ? (
              <PageSpinner />
            ) : types.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">{t('holiday.noTypes')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {types.map(type => (
                  <li
                    key={type.id}
                    onClick={() => setSelectedType(type)}
                    className={`group flex cursor-pointer items-center justify-between px-4 py-3 transition-colors
                      ${selectedType?.id === type.id
                        ? 'bg-primary-50'
                        : 'hover:bg-gray-50'}`}
                  >
                    <span className={`text-sm font-medium truncate
                      ${selectedType?.id === type.id ? 'text-primary-700' : 'text-gray-800'}`}>
                      {type.name}
                    </span>
                    <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                         onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setEditingType(type); setShowTypeModal(true); }}
                        className="rounded px-1.5 py-0.5 text-xs text-primary-600 hover:bg-primary-50"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDeleteType(type)}
                        className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right: Dates panel ───────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedType ? (
            <div className="flex h-48 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
              <p className="text-sm text-gray-400">{t('holiday.selectType')}</p>
            </div>
          ) : (
            <>
              {/* Dates header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {selectedType.name} — {dates.length} วัน
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleLoadPresets}
                    disabled={presetsLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {presetsLoading
                      ? <Spinner size="sm" className="inline-block" />
                      : null}
                    {t('holiday.loadThaiPresets')}
                  </button>
                  <button
                    onClick={() => setShowDateModal(true)}
                    className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    <span>+</span> {t('holiday.addDate')}
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
                {datesLoading ? (
                  <PageSpinner />
                ) : dates.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">{t('holiday.empty')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-3 text-left">{t('holiday.fields.date')}</th>
                        <th className="px-4 py-3 text-left">ชื่อวันหยุด</th>
                        <th className="px-4 py-3 text-center">{t('holiday.fields.enabled')}</th>
                        <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedDates.map(hd => {
                        const upcoming = isUpcomingHoliday(hd.date);
                        return (
                          <tr
                            key={hd.id}
                            className={[
                              'hover:bg-gray-50 transition-colors',
                              upcoming ? 'bg-amber-50 border-l-4 border-amber-400' : '',
                            ].join(' ')}
                          >
                            <td
                              className="px-4 py-3 text-gray-700"
                              title={`Recurring yearly: ${hd.date}`}
                            >
                              {formatHolidayDate(hd.date, locale, currentYear)}
                            </td>
                            <td className="px-4 py-3 text-gray-800">
                              <span>{hd.name}</span>
                              {upcoming && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  {t('holiday.upcoming')}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleToggleDate(hd)}
                                disabled={togglingId === hd.id}
                                className={`inline-flex h-5 w-9 items-center rounded-full transition-colors
                                  ${hd.enabled ? 'bg-primary-600' : 'bg-gray-300'}
                                  ${togglingId === hd.id ? 'opacity-50' : ''}`}
                                aria-label={hd.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                              >
                                <span className={`ml-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform
                                  ${hd.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleDeleteDate(hd)}
                                disabled={deletingId === hd.id}
                                className="text-xs text-red-500 hover:underline disabled:opacity-50"
                              >
                                {deletingId === hd.id
                                  ? <Spinner size="sm" className="inline-block" />
                                  : t('common.delete')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Type modal */}
      <Modal
        open={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        title={editingType ? t('holiday.editType') : t('holiday.createType')}
      >
        <TypeForm
          initial={editingType}
          onSave={handleSaveType}
          onCancel={() => setShowTypeModal(false)}
        />
      </Modal>

      {/* Date modal */}
      <Modal
        open={showDateModal}
        onClose={() => setShowDateModal(false)}
        title={t('holiday.addDate')}
      >
        <DateForm
          onSave={handleSaveDate}
          onCancel={() => setShowDateModal(false)}
        />
      </Modal>
    </div>
  );
}
