import { useCallback, useEffect, useState } from 'react';
import type { WorkSchedulePattern, WorkSchedulePatternType, UserRole } from '@hospital-hr/shared';
import { ROLE_LEVEL, ROLE_ORDER } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { useAuth } from '../../context/AuthContext';
import { workSchedulePatternApi, type CreateWorkSchedulePatternDto, type ShiftDto, type WeeklyScheduleDayDto } from '../../api/subRoles';
import { Modal } from '../../components/ui/Modal';
import { Spinner, PageSpinner } from '../../components/Spinner';
import { TimePicker } from '../../components/ui/TimePicker';
import { getAllowedEndSlots, isForbiddenShiftState, isValidShiftTime } from '../../modules/schedule/shiftTimeConstraints';

// ─── Shift row in form ────────────────────────────────────────────────────────

function ShiftRow({
  shift, index, onChange, onRemove,
}: {
  shift:    ShiftDto;
  index:    number;
  onChange: (i: number, k: keyof ShiftDto, v: string | boolean | number) => void;
  onRemove: (i: number) => void;
}) {
  const inputCls = 'rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-primary-500';
  const endSlots = getAllowedEndSlots(shift.startTime, shift.isOvernight);
  // Prevent the overnight checkbox when start='00:00' (forbidden state)
  const overnightDisabled = shift.startTime === '00:00';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3">
      <input value={shift.code}    onChange={e => onChange(index, 'code',    e.target.value)} placeholder="รหัส" className={`${inputCls} w-16`} />
      <input value={shift.nameTh}  onChange={e => onChange(index, 'nameTh',  e.target.value)} placeholder="ชื่อกะ" className={`${inputCls} flex-1 min-w-24`} />
      <TimePicker value={shift.startTime} onChange={(v) => onChange(index, 'startTime', v)} className={inputCls} />
      <span className="text-gray-400 text-xs">–</span>
      <TimePicker value={shift.endTime} onChange={(v) => onChange(index, 'endTime', v)} className={inputCls} slots={endSlots} />
      <input
        type="number" min="0" value={shift.breakMinutes}
        onChange={e => onChange(index, 'breakMinutes', Number(e.target.value))}
        placeholder="พัก(นาที)" className={`${inputCls} w-24`}
      />
      <label className={`flex items-center gap-1 text-xs ${overnightDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'}`}>
        <input
          type="checkbox" checked={shift.isOvernight}
          onChange={e => onChange(index, 'isOvernight', e.target.checked)}
          disabled={overnightDisabled}
          className="rounded"
          title={overnightDisabled ? 'ไม่สามารถข้ามคืนได้เมื่อเวลาเริ่มต้นคือ 00:00' : undefined}
        />
        ข้ามคืน
      </label>
      <button
        type="button" onClick={() => onRemove(index)}
        className="ml-auto text-red-400 hover:text-red-600 text-xs"
      >
        ลบ
      </button>
    </div>
  );
}

// ─── Weekly schedule editor ───────────────────────────────────────────────────

const WEEK_DAYS = [
  { dow: 1, labelTh: 'จันทร์',     labelEn: 'Mon' },
  { dow: 2, labelTh: 'อังคาร',    labelEn: 'Tue' },
  { dow: 3, labelTh: 'พุธ',       labelEn: 'Wed' },
  { dow: 4, labelTh: 'พฤหัสบดี',  labelEn: 'Thu' },
  { dow: 5, labelTh: 'ศุกร์',     labelEn: 'Fri' },
  { dow: 6, labelTh: 'เสาร์',     labelEn: 'Sat' },
  { dow: 0, labelTh: 'อาทิตย์',   labelEn: 'Sun' },
];

function WeeklyScheduleEditor({
  value,
  onChange,
}: {
  value:    WeeklyScheduleDayDto[];
  onChange: (days: WeeklyScheduleDayDto[]) => void;
}) {
  const inputCls = 'rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-primary-500';

  const byDow = new Map(value.map((d) => [d.dayOfWeek, d]));

  function toggleDay(dow: number, checked: boolean) {
    if (checked) {
      onChange([...value, { dayOfWeek: dow, startTime: '08:00', endTime: '17:00' }]);
    } else {
      onChange(value.filter((d) => d.dayOfWeek !== dow));
    }
  }

  function updateTime(dow: number, field: 'startTime' | 'endTime', time: string) {
    onChange(value.map((d) => d.dayOfWeek === dow ? { ...d, [field]: time } : d));
  }

  return (
    <div className="space-y-2">
      {WEEK_DAYS.map(({ dow, labelTh }) => {
        const entry = byDow.get(dow);
        const checked = !!entry;
        return (
          <div key={dow} className={[
            'flex items-center gap-3 rounded-lg px-3 py-2',
            checked ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-gray-50',
          ].join(' ')}>
            <label className="flex cursor-pointer items-center gap-2 w-24 shrink-0">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggleDay(dow, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <span className={`text-sm font-medium ${checked ? 'text-gray-900' : 'text-gray-400'}`}>
                {labelTh}
              </span>
            </label>
            {checked && entry ? (
              <div className="flex items-center gap-2">
                <TimePicker value={entry.startTime} onChange={(v) => updateTime(dow, 'startTime', v)} className={inputCls} />
                <span className="text-gray-400 text-xs">–</span>
                <TimePicker value={entry.endTime}   onChange={(v) => updateTime(dow, 'endTime',   v)} className={inputCls} />
              </div>
            ) : (
              <span className="text-xs text-gray-300">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-role form ────────────────────────────────────────────────────────────

const emptyShift = (): ShiftDto => ({
  code: '', nameTh: '', startTime: '08:00', endTime: '16:00',
  isOvernight: false, breakMinutes: 60,
});

function WorkSchedulePatternForm({
  initial, onSave, onCancel,
}: {
  initial:  WorkSchedulePattern | null;
  onSave:   (dto: CreateWorkSchedulePatternDto) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [nameTh,         setNameTh]         = useState(initial?.nameTh   ?? '');
  const [nameEn,         setNameEn]         = useState(initial?.nameEn   ?? '');
  const [forRole,        setForRole]        = useState<UserRole>(initial?.forRole ?? 'employee');
  const [hours,          setHours]          = useState(String(initial?.monthlyWorkingHours ?? 160));
  const [patternType,    setPatternType]    = useState<WorkSchedulePatternType>(initial?.type ?? 'SHIFT_TIME');
  const [shifts,         setShifts]         = useState<ShiftDto[]>(
    initial?.shifts.map(s => ({
      code:         s.code,
      nameTh:       s.nameTh,
      nameEn:       s.nameEn,
      startTime:    s.startTime,
      endTime:      s.endTime,
      isOvernight:  s.isOvernight,
      breakMinutes: s.breakMinutes,
    })) ?? [emptyShift()]
  );
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleDayDto[]>(
    initial?.weeklySchedule ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function updateShift(i: number, k: keyof ShiftDto, v: string | boolean | number) {
    setShifts(prev => prev.map((s, idx) => {
      if (idx !== i) return s;
      let updated: ShiftDto = { ...s, [k]: v };

      // Guard: prevent forbidden state (startTime='00:00' AND isOvernight=true)
      if (isForbiddenShiftState(updated.startTime, updated.isOvernight)) {
        updated = { ...updated, isOvernight: false };
      }

      // Guard: clear endTime when startTime or isOvernight change makes it invalid
      if ((k === 'startTime' || k === 'isOvernight') &&
          !isValidShiftTime(updated.startTime, updated.endTime, updated.isOvernight)) {
        updated = { ...updated, endTime: '' };
      }

      return updated;
    }));
  }

  function addShift() { setShifts(prev => [...prev, emptyShift()]); }
  function removeShift(i: number) { setShifts(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameTh.trim()) { setError('กรุณากรอกชื่อ'); return; }
    const h = parseFloat(hours);
    if (isNaN(h) || h <= 0) { setError('ชั่วโมงต้องเป็นตัวเลขบวก'); return; }
    if (patternType === 'WEEKLY_WORKING_TIME' && weeklySchedule.length === 0) {
      setError('กรุณาเลือกอย่างน้อย 1 วันทำงาน'); return;
    }
    setSaving(true);
    try {
      const dto: CreateWorkSchedulePatternDto = {
        nameTh: nameTh.trim(),
        nameEn: nameEn.trim() || undefined,
        forRole,
        type: patternType,
        monthlyWorkingHours: h,
        ...(patternType === 'SHIFT_TIME'
          ? { shifts }
          : { weeklySchedule }),
      };
      await onSave(dto);
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
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('workPattern.nameTh')} *</label>
        <input value={nameTh} onChange={e => setNameTh(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('workPattern.nameEn')}</label>
        <input value={nameEn} onChange={e => setNameEn(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('workPattern.forRole')} *</label>
          <select value={forRole} onChange={e => setForRole(e.target.value as UserRole)} className={inputCls}>
            {ROLE_ORDER.map(r => (
              <option key={r} value={r}>{t(`roles.${r}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('workPattern.monthlyHours')} *</label>
          <input type="number" value={hours} onChange={e => setHours(e.target.value)} min="1" className={inputCls} />
        </div>
      </div>

      {/* Pattern Type */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">{t('workPattern.type')} *</label>
        <div className="flex gap-6">
          {(['SHIFT_TIME', 'WEEKLY_WORKING_TIME'] as WorkSchedulePatternType[]).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="patternType"
                value={type}
                checked={patternType === type}
                onChange={() => setPatternType(type)}
                className="h-4 w-4 border-gray-300 text-primary-600"
              />
              <span className="text-sm text-gray-700">
                {type === 'SHIFT_TIME' ? t('workPattern.typeShiftTime') : t('workPattern.typeWeekly')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Conditional editor */}
      {patternType === 'SHIFT_TIME' ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">{t('workPattern.shiftList')}</label>
            <button type="button" onClick={addShift} className="text-xs text-primary-600 hover:underline">
              + {t('workPattern.addShift')}
            </button>
          </div>
          <div className="space-y-2">
            {shifts.map((s, i) => (
              <ShiftRow key={i} shift={s} index={i} onChange={updateShift} onRemove={removeShift} />
            ))}
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">{t('workPattern.weeklyTitle')}</label>
          <WeeklyScheduleEditor value={weeklySchedule} onChange={setWeeklySchedule} />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {saving ? <><Spinner size="sm" color="white" className="mr-1.5 inline-block" />{t('common.loading')}</> : t('common.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubRolesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isHR = user ? ROLE_LEVEL[user.role] >= 4 : false;

  const [items,   setItems]   = useState<WorkSchedulePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<WorkSchedulePattern | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workSchedulePatternApi.list();
      setItems(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(dto: CreateWorkSchedulePatternDto) {
    if (editing) await workSchedulePatternApi.update(editing.id, dto);
    else         await workSchedulePatternApi.create(dto);
    setShowForm(false);
    load();
  }

  async function handleToggleActive(sr: WorkSchedulePattern) {
    await workSchedulePatternApi.update(sr.id, { isActive: !sr.isActive });
    load();
  }

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('workPattern.title')}</h1>
          <p className="mt-0.5 text-sm text-gray-400">{items.length} {t('common.total')}</p>
        </div>
        {isHR && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <span>+</span> {t('workPattern.add')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
        {loading ? (
          <PageSpinner />
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{t('common.noData')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t('workPattern.title')}</th>
                <th className="px-4 py-3 text-left">{t('workPattern.type')}</th>
                <th className="px-4 py-3 text-left">{t('employee.role')}</th>
                <th className="px-4 py-3 text-right">{t('workPattern.monthlyHours')}</th>
                <th className="px-4 py-3 text-left">{t('common.status')}</th>
                {isHR && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(sr => (
                <tr key={sr.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{sr.nameTh}</td>
                  <td className="px-4 py-3">
                    <span className={[
                      'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                      (sr.type ?? 'SHIFT_TIME') === 'WEEKLY_WORKING_TIME'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700',
                    ].join(' ')}>
                      {(sr.type ?? 'SHIFT_TIME') === 'WEEKLY_WORKING_TIME'
                        ? t('workPattern.typeWeekly')
                        : t('workPattern.typeShiftTime')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {t(`roles.${sr.forRole}` as Parameters<typeof t>[0])}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{sr.monthlyWorkingHours}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${sr.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {sr.isActive ? t('employee.active') : t('employee.inactive')}
                    </span>
                  </td>
                  {isHR && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditing(sr); setShowForm(true); }}
                        className="mr-2 text-primary-600 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleToggleActive(sr)}
                        className="text-gray-500 hover:underline"
                      >
                        {sr.isActive ? t('employee.inactive') : t('employee.active')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? t('workPattern.edit') : t('workPattern.add')} wide>
        <WorkSchedulePatternForm initial={editing} onSave={handleSave} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}
