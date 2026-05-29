import { useCallback, useEffect, useState } from 'react';
import type { Branch } from '@hospital-hr/shared';
import { useAuth } from '../../context/AuthContext';
import { branchApi, type CreateBranchDto, type UpdateBranchDto, type SetGpsDto } from '../../api/branches';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/Spinner';

// ─── Input primitive ─────────────────────────────────────────────────────────

function Field({
  label, value, onChange, required, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      />
    </div>
  );
}

// ─── Branch form modal ────────────────────────────────────────────────────────

function BranchFormModal({
  initial, onSave, onClose,
}: {
  initial: Branch | null;
  onSave:  (dto: CreateBranchDto | UpdateBranchDto) => Promise<void>;
  onClose: () => void;
}) {
  const [nameTh,   setNameTh]   = useState(initial?.nameTh  ?? '');
  const [nameEn,   setNameEn]   = useState(initial?.nameEn  ?? '');
  const [province, setProvince] = useState(initial?.province ?? '');
  const [address,  setAddress]  = useState(initial?.address  ?? '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameTh.trim()) { setError('กรุณากรอกชื่อสาขา (ภาษาไทย)'); return; }
    if (!nameEn.trim()) { setError('กรุณากรอกชื่อสาขา (ภาษาอังกฤษ)'); return; }
    setSaving(true);
    try {
      await onSave({
        nameTh:   nameTh.trim(),
        nameEn:   nameEn.trim(),
        province: province.trim() || undefined,
        address:  address.trim()  || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={initial ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
        <Field label="ชื่อสาขา (ไทย)"    value={nameTh}   onChange={setNameTh}   required />
        <Field label="ชื่อสาขา (อังกฤษ)" value={nameEn}   onChange={setNameEn}   required />
        <Field label="จังหวัด"             value={province} onChange={setProvince} placeholder="เช่น กรุงเทพมหานคร" />
        <Field label="ที่อยู่"              value={address}  onChange={setAddress}  placeholder="ที่อยู่โดยย่อ" />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── GPS modal ────────────────────────────────────────────────────────────────

function GpsModal({
  branch, onSave, onClear, onClose,
}: {
  branch:  Branch;
  onSave:  (dto: SetGpsDto) => Promise<void>;
  onClear: () => Promise<void>;
  onClose: () => void;
}) {
  const hasGps = branch.latitude !== undefined && branch.longitude !== undefined;
  const [lat,    setLat]    = useState(hasGps ? String(branch.latitude)    : '');
  const [lng,    setLng]    = useState(hasGps ? String(branch.longitude)   : '');
  const [radius, setRadius] = useState(hasGps ? String(branch.radiusMeters ?? 100) : '100');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const latitude     = parseFloat(lat);
    const longitude    = parseFloat(lng);
    const radiusMeters = parseInt(radius, 10);
    if (isNaN(latitude) || isNaN(longitude)) { setError('กรุณากรอกพิกัดที่ถูกต้อง'); return; }
    if (isNaN(radiusMeters) || radiusMeters < 1) { setError('รัศมีต้องมากกว่า 0 เมตร'); return; }
    setSaving(true);
    try {
      await onSave({ latitude, longitude, radiusMeters });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!window.confirm('ลบ GPS fence ออกจากสาขานี้?')) return;
    setSaving(true);
    try { await onClear(); } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setSaving(false); }
  }

  return (
    <Modal open title={`ตั้งค่า GPS — ${branch.nameTh}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

        <p className="text-sm text-gray-500">
          พนักงานต้องอยู่ในรัศมีที่กำหนดเพื่อเช็คอิน/เช็คเอาท์ได้
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"  type="number" value={lat}    onChange={setLat}    placeholder="13.7563" required />
          <Field label="Longitude" type="number" value={lng}    onChange={setLng}    placeholder="100.5018" required />
        </div>
        <Field label="รัศมี (เมตร)" type="number" value={radius} onChange={setRadius} placeholder="100" required />

        <div className="flex items-center justify-between pt-2">
          {hasGps ? (
            <button type="button" onClick={handleClear} disabled={saving}
              className="text-sm text-red-600 hover:underline disabled:opacity-50">
              ลบ GPS fence
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'กำลังบันทึก…' : 'บันทึก GPS'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ─── GPS badge ────────────────────────────────────────────────────────────────

function GpsBadge({ branch }: { branch: Branch }) {
  if (branch.latitude === undefined || branch.longitude === undefined) {
    return <span className="text-xs text-gray-400">ไม่มี GPS</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-200">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {branch.radiusMeters} ม.
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [formOpen,   setFormOpen]   = useState(false);
  const [gpsOpen,    setGpsOpen]    = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [gpsTarget,  setGpsTarget]  = useState<Branch | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await branchApi.list();
      setBranches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(dto: CreateBranchDto | UpdateBranchDto) {
    if (editTarget) {
      await branchApi.update(editTarget.id, dto as UpdateBranchDto);
    } else {
      await branchApi.create(dto as CreateBranchDto);
    }
    setFormOpen(false);
    setEditTarget(null);
    await load();
  }

  async function handleGpsSave(dto: SetGpsDto) {
    await branchApi.setGps(gpsTarget!.id, dto);
    setGpsOpen(false);
    setGpsTarget(null);
    await load();
  }

  async function handleGpsClear() {
    await branchApi.clearGps(gpsTarget!.id);
    setGpsOpen(false);
    setGpsTarget(null);
    await load();
  }

  async function handleToggleActive(branch: Branch) {
    if (!window.confirm(branch.isActive
      ? `ปิดใช้งานสาขา "${branch.nameTh}"?`
      : `เปิดใช้งานสาขา "${branch.nameTh}"?`)) return;
    await branchApi.update(branch.id, { isActive: !branch.isActive });
    await load();
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">สาขา</h1>
          <p className="text-sm text-gray-500">จัดการสาขาและตั้งค่า GPS fence</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            + เพิ่มสาขา
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className={`rounded-2xl bg-white p-5 shadow-sm ring-1 transition ${
              branch.isActive ? 'ring-gray-200' : 'opacity-60 ring-gray-100'
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate font-semibold text-gray-900">{branch.nameTh}</h2>
                <p className="truncate text-sm text-gray-500">{branch.nameEn}</p>
                {branch.province && (
                  <p className="text-xs text-gray-400">{branch.province}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                branch.isActive
                  ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {branch.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
              </span>
            </div>

            {branch.address && (
              <p className="mb-3 text-xs text-gray-500 line-clamp-2">{branch.address}</p>
            )}

            <div className="mb-4">
              <GpsBadge branch={branch} />
            </div>

            {isSuperAdmin && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setEditTarget(branch); setFormOpen(true); }}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  แก้ไข
                </button>
                <button
                  onClick={() => { setGpsTarget(branch); setGpsOpen(true); }}
                  className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  ตั้ง GPS
                </button>
                <button
                  onClick={() => handleToggleActive(branch)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    branch.isActive
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {branch.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 ring-1 ring-gray-200">
          <p className="text-gray-400">ยังไม่มีข้อมูลสาขา</p>
        </div>
      )}

      {formOpen && (
        <BranchFormModal
          initial={editTarget}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
        />
      )}

      {gpsOpen && gpsTarget && (
        <GpsModal
          branch={gpsTarget}
          onSave={handleGpsSave}
          onClear={handleGpsClear}
          onClose={() => { setGpsOpen(false); setGpsTarget(null); }}
        />
      )}
    </div>
  );
}
