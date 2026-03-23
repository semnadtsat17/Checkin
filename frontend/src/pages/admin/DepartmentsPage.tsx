import { useCallback, useEffect, useState } from 'react';
import type { Department, Branch, WorkSchedulePattern, HolidayType } from '@hospital-hr/shared';
import { ROLE_LEVEL } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { useAuth } from '../../context/AuthContext';
import { deptApi, type CreateDeptDto } from '../../api/departments';
import { branchApi } from '../../api/branches';
import { workSchedulePatternApi } from '../../api/subRoles';
import { holidaysApi } from '../../api/holidays';
import { Modal } from '../../components/ui/Modal';
import { Spinner, PageSpinner } from '../../components/Spinner';

// ─── Form ─────────────────────────────────────────────────────────────────────

function DeptForm({
  initial, branches, workSchedulePatterns, holidayTypes, onSave, onCancel,
}: {
  initial:                Department | null;
  branches:               Branch[];
  workSchedulePatterns:   WorkSchedulePattern[];
  holidayTypes:           HolidayType[];
  onSave:                 (dto: CreateDeptDto) => Promise<void>;
  onCancel:               () => void;
}) {
  const { t } = useTranslation();
  const [nameTh,                 setNameTh]                 = useState(initial?.nameTh                ?? '');
  const [nameEn,                 setNameEn]                 = useState(initial?.nameEn                ?? '');
  const [branchId,               setBranchId]               = useState(initial?.branchId              ?? '');
  const [workSchedulePatternId,  setWorkSchedulePatternId]  = useState(initial?.workSchedulePatternId ?? '');
  const [holidayTypeId,          setHolidayTypeId]          = useState(initial?.holidayTypeId         ?? '');
  const [requireHrApproval,      setRequireHrApproval]      = useState(initial?.requireHrApproval     ?? false);
  const [saving,                 setSaving]                 = useState(false);
  const [error,                  setError]                  = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameTh.trim()) { setError('กรุณากรอกชื่อแผนก'); return; }
    if (!branchId)      { setError('กรุณาเลือกสาขา');    return; }
    setSaving(true);
    try {
      await onSave({ nameTh: nameTh.trim(), nameEn: nameEn.trim() || undefined, branchId, workSchedulePatternId: workSchedulePatternId || undefined, holidayTypeId: holidayTypeId || null, requireHrApproval });
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
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('department.nameTh')} *</label>
        <input
          value={nameTh} onChange={e => setNameTh(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('department.nameEn')}</label>
        <input
          value={nameEn} onChange={e => setNameEn(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('department.branch')} *</label>
        <select
          value={branchId} onChange={e => setBranchId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">— {t('common.all')} —</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.nameTh}</option>
          ))}
        </select>
      </div>

      {/* Work Schedule Pattern — single select */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('workPattern.title')}</label>
        <select
          value={workSchedulePatternId}
          onChange={e => setWorkSchedulePatternId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">— ไม่ระบุ —</option>
          {workSchedulePatterns.map((wsp) => (
            <option key={wsp.id} value={wsp.id}>
              {wsp.nameTh}{wsp.nameEn ? ` (${wsp.nameEn})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Holiday Type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('holiday.title')}</label>
        <select
          value={holidayTypeId}
          onChange={e => setHolidayTypeId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">{t('holiday.noPolicy')}</option>
          {holidayTypes.map(ht => (
            <option key={ht.id} value={ht.id}>{ht.name}</option>
          ))}
        </select>
      </div>

      {/* HR Approval toggle */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <input
          id="requireHrApproval"
          type="checkbox"
          checked={requireHrApproval}
          onChange={e => setRequireHrApproval(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="requireHrApproval" className="cursor-pointer text-sm text-amber-800">
          <span className="font-medium">ต้องอนุมัติจาก HR ก่อนเผยแพร่ตารางงาน</span>
          <p className="mt-0.5 text-xs text-amber-600">เมื่อเปิดใช้ งาน ตารางงานจะถูกส่งให้ HR ตรวจสอบก่อนจึงจะแสดงให้พนักงานเห็น</p>
        </label>
      </div>

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

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isHR = user ? ROLE_LEVEL[user.role] >= 4 : false;

  const [items,   setItems]   = useState<Department[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  const [branches,              setBranches]              = useState<Branch[]>([]);
  const [workSchedulePatterns,  setWorkSchedulePatterns]  = useState<WorkSchedulePattern[]>([]);
  const [holidayTypes,          setHolidayTypes]          = useState<HolidayType[]>([]);
  const [showForm,              setShowForm]              = useState(false);
  const [editing,               setEditing]               = useState<Department | null>(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deptApi.list({ search: search || undefined, page, pageSize: PAGE_SIZE });
      setItems(res.items);
      setTotal(res.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isHR) {
      branchApi.list().then(r => setBranches(r)).catch(() => {});
      workSchedulePatternApi.list().then(setWorkSchedulePatterns).catch(() => {});
      holidaysApi.listTypes().then(setHolidayTypes).catch(() => {});
    }
  }, [isHR]);

  async function handleSave(dto: CreateDeptDto) {
    if (editing) await deptApi.update(editing.id, dto);
    else         await deptApi.create(dto);
    setShowForm(false);
    load();
  }

  async function handleToggleActive(dept: Department) {
    await deptApi.update(dept.id, { isActive: !dept.isActive });
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('department.title')}</h1>
          <p className="mt-0.5 text-sm text-gray-400">{total} {t('common.total')}</p>
        </div>
        {isHR && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <span>+</span> {t('department.add')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={`${t('common.search')}...`}
          className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
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
                <th className="px-4 py-3 text-left">{t('department.nameTh')}</th>
                <th className="px-4 py-3 text-left">{t('department.nameEn')}</th>
                <th className="px-4 py-3 text-left">{t('common.status')}</th>
                <th className="px-4 py-3 text-left">HR อนุมัติ</th>
                {isHR && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(dept => (
                <tr key={dept.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{dept.nameTh}</td>
                  <td className="px-4 py-3 text-gray-500">{dept.nameEn || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {dept.isActive ? t('employee.active') : t('employee.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dept.requireHrApproval ? (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">ต้องอนุมัติ</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  {isHR && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditing(dept); setShowForm(true); }}
                        className="mr-2 text-primary-600 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleToggleActive(dept)}
                        className="text-gray-500 hover:underline"
                      >
                        {dept.isActive ? t('employee.inactive') : t('employee.active')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50">
            {t('common.previous')}
          </button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50">
            {t('common.next')}
          </button>
        </div>
      )}

      {/* Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('department.edit') : t('department.add')}
      >
        <DeptForm
          initial={editing}
          branches={branches}
          workSchedulePatterns={workSchedulePatterns}
          holidayTypes={holidayTypes}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
