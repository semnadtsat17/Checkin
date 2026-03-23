import { useCallback, useEffect, useState } from 'react';
import type { User, UserRole, Branch, Department } from '@hospital-hr/shared';
import { ROLE_LEVEL, ROLE_ORDER } from '@hospital-hr/shared';
import { useTranslation } from '../../i18n/useTranslation';
import { useAuth } from '../../context/AuthContext';
import { employeeApi, type CreateEmployeeDto } from '../../api/employees';
import { branchApi } from '../../api/branches';
import { deptApi } from '../../api/departments';
import { Modal } from '../../components/ui/Modal';
import { Spinner, PageSpinner } from '../../components/Spinner';

// ─── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const colors: Record<UserRole, string> = {
    super_admin: 'bg-purple-100 text-purple-700',
    hr:          'bg-blue-100 text-blue-700',
    manager:     'bg-indigo-100 text-indigo-700',
    employee:    'bg-green-100 text-green-700',
    part_time:   'bg-orange-100 text-orange-700',
  };
  const { t } = useTranslation();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[role]}`}>
      {t(`roles.${role}` as Parameters<typeof t>[0])}
    </span>
  );
}

// ─── Employee form ────────────────────────────────────────────────────────────

function EmployeeForm({
  initial, branches, departments, onSave, onCancel,
}: {
  initial:     User | null;
  branches:    Branch[];
  departments: Department[];
  onSave:      (dto: CreateEmployeeDto) => Promise<void>;
  onCancel:    () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CreateEmployeeDto>({
    firstNameTh:  initial?.firstNameTh  ?? '',
    lastNameTh:   initial?.lastNameTh   ?? '',
    firstName:    initial?.firstName    ?? '',
    lastName:     initial?.lastName     ?? '',
    email:        initial?.email        ?? '',
    phone:        initial?.phone        ?? '',
    role:         initial?.role         ?? 'employee',
    departmentId: initial?.departmentId ?? '',
    branchId:     initial?.branchId     ?? '',
    startDate:    initial?.startDate    ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function set<K extends keyof CreateEmployeeDto>(k: K, v: CreateEmployeeDto[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstNameTh.trim()) { setError('กรุณากรอกชื่อ');        return; }
    if (!form.lastNameTh.trim())  { setError('กรุณากรอกนามสกุล');     return; }
    if (!form.email.trim())       { setError('กรุณากรอกอีเมล');       return; }
    if (!form.departmentId)       { setError('กรุณาเลือกแผนก');       return; }
    if (!form.branchId)           { setError('กรุณาเลือกสาขา');       return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        firstNameTh: form.firstNameTh.trim(),
        lastNameTh:  form.lastNameTh.trim(),
        email:       form.email.trim(),
        phone:       form.phone?.trim() || undefined,
        firstName:   form.firstName?.trim() || undefined,
        lastName:    form.lastName?.trim()  || undefined,
        startDate:   form.startDate || undefined,
      });
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.firstNameTh')} *</label>
          <input value={form.firstNameTh} onChange={e => set('firstNameTh', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.lastNameTh')} *</label>
          <input value={form.lastNameTh} onChange={e => set('lastNameTh', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.email')} *</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.phone')}</label>
        <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.role')} *</label>
        <select value={form.role} onChange={e => set('role', e.target.value as UserRole)} className={inputCls}>
          {ROLE_ORDER.map(r => (
            <option key={r} value={r}>{t(`roles.${r}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.department')} *</label>
        <select
          value={form.departmentId}
          onChange={e => set('departmentId', e.target.value)}
          className={inputCls}
        >
          <option value="">—</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.nameTh}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.branch')} *</label>
        <select value={form.branchId} onChange={e => set('branchId', e.target.value)} className={inputCls}>
          <option value="">—</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.nameTh}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{t('employee.hireDate')}</label>
        <input type="date" value={form.startDate ?? ''} onChange={e => set('startDate', e.target.value)} className={inputCls} />
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

// ─── TransferDepartmentModal ──────────────────────────────────────────────────
// Shown whenever HR changes an employee's department in the edit form.
// HR must choose the effective date before the transfer is committed.

function toLocalDateStr(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dd}`;
}

function TransferDepartmentModal({
  employee,
  fromDept,
  toDept,
  onConfirm,
  onCancel,
}: {
  employee:  User;
  fromDept:  Department | undefined;
  toDept:    Department | undefined;
  onConfirm: (effectiveDate: string) => Promise<void>;
  onCancel:  () => void;
}) {
  const today    = toLocalDateStr(new Date());
  const tomorrow = toLocalDateStr(new Date(Date.now() + 86_400_000));

  const [acting, setActing] = useState(false);
  const [error,  setError]  = useState('');

  async function choose(effectiveDate: string) {
    setActing(true);
    setError('');
    try {
      await onConfirm(effectiveDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      setActing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Warning banner */}
      <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <p className="text-sm font-semibold text-amber-800">คำเตือน: การเปลี่ยนแผนก</p>
        <p className="mt-1 text-sm text-amber-700">
          ตารางงานทั้งหมดหลังวันที่โอนย้ายจะถูกแทนที่ตามรูปแบบของแผนกใหม่
        </p>
      </div>

      {/* Transfer summary */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 text-gray-500">พนักงาน</span>
          <span className="font-semibold text-gray-900">
            {employee.firstNameTh} {employee.lastNameTh}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 text-gray-500">จาก</span>
          <span className="text-gray-700">{fromDept?.nameTh ?? '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 text-gray-500">ไป</span>
          <span className="font-semibold text-primary-700">{toDept?.nameTh ?? '—'}</span>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => choose(today)}
          disabled={acting}
          className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {acting ? 'กำลังดำเนินการ…' : `โอนย้ายทันที (วันนี้ ${today})`}
        </button>
        <button
          onClick={() => choose(tomorrow)}
          disabled={acting}
          className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {`โอนย้ายพรุ่งนี้ (${tomorrow})`}
        </button>
        <button
          onClick={onCancel}
          disabled={acting}
          className="w-full rounded-xl px-4 py-3 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

// ─── Manage Departments Modal (HR → assigns departments to a manager) ──────────

function ManageDepartmentsModal({
  manager,
  allDepartments,
  onSave,
  onClose,
}: {
  manager:        User;
  allDepartments: Department[];
  onSave:         (departmentIds: string[]) => Promise<void>;
  onClose:        () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(manager.managerDepartments ?? []);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        เลือกแผนกที่ <span className="font-semibold text-gray-800">{manager.firstNameTh} {manager.lastNameTh}</span> สามารถจัดตารางเวรได้
      </p>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
        {allDepartments.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">{t('common.noData')}</p>
        ) : (
          allDepartments.map((dept) => {
            const checked = selected.includes(dept.id);
            return (
              <label
                key={dept.id}
                className={[
                  'flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 transition-colors',
                  checked ? 'bg-primary-50' : 'hover:bg-gray-50',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(dept.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                />
                <span className="text-sm font-medium text-gray-800">{dept.nameTh}</span>
                {dept.nameEn && (
                  <span className="text-xs text-gray-400">{dept.nameEn}</span>
                )}
              </label>
            );
          })
        )}
      </div>

      <p className="text-xs text-gray-400">เลือกแล้ว {selected.length} แผนก</p>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {t('common.cancel')}
        </button>
        <button onClick={handleSave} disabled={saving}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isHR = user ? ROLE_LEVEL[user.role] >= 4 : false;

  const [items,   setItems]   = useState<User[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [search,  setSearch]  = useState('');
  const [role,    setRole]    = useState<UserRole | ''>('');
  const [loading, setLoading] = useState(true);

  const [branches,       setBranches]       = useState<Branch[]>([]);
  const [departments,    setDepartments]    = useState<Department[]>([]);
  const [showForm,       setShowForm]       = useState(false);
  const [editing,        setEditing]        = useState<User | null>(null);
  const [tempPassword,   setTempPassword]   = useState<string | null>(null);
  const [managingDepts,  setManagingDepts]  = useState<User | null>(null);

  // Department-transfer confirmation modal state
  const [pendingTransfer, setPendingTransfer] = useState<{
    employee:     User;
    dto:          CreateEmployeeDto;
    newDeptId:    string;
  } | null>(null);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeeApi.list({
        search:  search || undefined,
        role:    role   || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search, role, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isHR) return;
    Promise.all([
      branchApi.list(),
      deptApi.list({ pageSize: 100 }),
    ]).then(([b, d]) => {
      setBranches(b);
      setDepartments(d.items);
    }).catch(() => {});
  }, [isHR]);

  async function handleSave(dto: CreateEmployeeDto) {
    if (editing) {
      // If the department changed, close the edit form and open the transfer modal
      // so HR can choose the effective date before committing the change.
      if (dto.departmentId && dto.departmentId !== editing.departmentId) {
        setShowForm(false);
        setPendingTransfer({ employee: editing, dto, newDeptId: dto.departmentId });
        return;
      }
      // No department change — plain update
      await employeeApi.update(editing.id, dto);
      if (dto.role !== editing.role) {
        await employeeApi.assignRole(editing.id, { role: dto.role });
      }
      setShowForm(false);
    } else {
      const result = await employeeApi.create(dto);
      setShowForm(false);
      setTempPassword(result.temporaryPassword);
    }
    load();
  }

  async function handleTransferConfirm(effectiveDate: string) {
    if (!pendingTransfer) return;
    const { employee, dto, newDeptId } = pendingTransfer;

    // 1. Update all non-department, non-role fields first
    const { departmentId: _skip, role, ...updateFields } = dto;
    await employeeApi.update(employee.id, updateFields);

    // 2. Update role if it also changed
    if (role !== employee.role) {
      await employeeApi.assignRole(employee.id, { role });
    }

    // 3. Transfer department + schedule migration
    await employeeApi.transferDepartment(employee.id, {
      newDepartmentId: newDeptId,
      effectiveDate,
    });

    // Notify other tabs (e.g. an open MySchedulePage) that schedules changed.
    localStorage.setItem('schedule-invalidate', String(Date.now()));

    setPendingTransfer(null);
    load();
  }

  async function handleResetPassword(emp: User) {
    try {
      const result = await employeeApi.resetPassword(emp.id);
      setTempPassword(result.temporaryPassword);
    } catch (err) {
      alert(err instanceof Error ? err.message : t('error.generic'));
    }
  }

  async function handleToggleActive(emp: User) {
    await employeeApi.update(emp.id, { isActive: !emp.isActive });
    load();
  }

  async function handleSaveManagerDepts(departmentIds: string[]) {
    if (!managingDepts) return;
    await employeeApi.updateManagerDepartments(managingDepts.id, departmentIds);
    setManagingDepts(null);
    load();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t('employee.title')}</h1>
          <p className="mt-0.5 text-sm text-gray-400">{total} {t('common.total')}</p>
        </div>
        {isHR && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <span>+</span> {t('employee.add')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={`${t('common.search')}...`}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <select
          value={role}
          onChange={e => { setRole(e.target.value as UserRole | ''); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        >
          <option value="">{t('common.all')} ({t('employee.role')})</option>
          {ROLE_ORDER.map(r => (
            <option key={r} value={r}>{t(`roles.${r}` as Parameters<typeof t>[0])}</option>
          ))}
        </select>
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
                <th className="px-4 py-3 text-left">{t('employee.code')}</th>
                <th className="px-4 py-3 text-left">{t('employee.fullName')}</th>
                <th className="px-4 py-3 text-left">{t('employee.email')}</th>
                <th className="px-4 py-3 text-left">{t('employee.role')}</th>
                <th className="px-4 py-3 text-left">{t('common.status')}</th>
                {isHR && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{emp.employeeCode}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {emp.firstNameTh} {emp.lastNameTh}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={emp.role} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${emp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {emp.isActive ? t('employee.active') : t('employee.inactive')}
                    </span>
                  </td>
                  {isHR && (
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => { setEditing(emp); setShowForm(true); }}
                        className="text-primary-600 hover:underline text-sm"
                      >
                        {t('common.edit')}
                      </button>
                      {emp.role === 'manager' && (
                        <button
                          onClick={() => setManagingDepts(emp)}
                          className="text-indigo-600 hover:underline text-sm"
                        >
                          กำหนดแผนก
                        </button>
                      )}
                      <button
                        onClick={() => handleResetPassword(emp)}
                        className="text-amber-600 hover:underline text-sm"
                      >
                        {t('employee.resetPassword')}
                      </button>
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className="text-gray-500 hover:underline text-sm"
                      >
                        {emp.isActive ? t('employee.inactive') : t('employee.active')}
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

      {/* Employee form modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? t('employee.edit') : t('employee.add')}
        wide
      >
        <EmployeeForm
          initial={editing}
          branches={branches}
          departments={departments}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Manage departments modal */}
      <Modal
        open={!!managingDepts}
        onClose={() => setManagingDepts(null)}
        title="กำหนดแผนกที่จัดการ"
        wide
      >
        {managingDepts && (
          <ManageDepartmentsModal
            manager={managingDepts}
            allDepartments={departments}
            onSave={handleSaveManagerDepts}
            onClose={() => setManagingDepts(null)}
          />
        )}
      </Modal>

      {/* Department transfer confirmation modal */}
      <Modal
        open={!!pendingTransfer}
        onClose={() => setPendingTransfer(null)}
        title="ยืนยันการเปลี่ยนแผนก"
      >
        {pendingTransfer && (
          <TransferDepartmentModal
            employee={pendingTransfer.employee}
            fromDept={departments.find((d) => d.id === pendingTransfer.employee.departmentId)}
            toDept={departments.find((d) => d.id === pendingTransfer.newDeptId)}
            onConfirm={handleTransferConfirm}
            onCancel={() => setPendingTransfer(null)}
          />
        )}
      </Modal>

      {/* Temp password modal */}
      <Modal
        open={!!tempPassword}
        onClose={() => setTempPassword(null)}
        title={t('auth.tempPasswordGenerated')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('auth.tempPasswordNote')}</p>
          <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <span className="font-mono text-lg font-bold tracking-widest text-amber-800">
              {tempPassword}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(tempPassword ?? '')}
              className="ml-3 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-700 hover:bg-amber-200"
            >
              Copy
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setTempPassword(null)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
