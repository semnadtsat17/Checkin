/**
 * HRSettings.tsx
 *
 * HR Settings page — configure organisation-wide attendance behaviour.
 *
 * Sections:
 *   1.  Mode (SIMPLE / FULL) + requireManagerApproval
 *   2.  Snap Time Engine (continuousGapMinutes, retroApprovalMode)
 *   3.  Late Rule (checkInWindowMinutes, lateRule, absentAfterMinutes)
 *   4.  Early Leave Rule (graceMinutes)
 *   5.  OT Rule (enabled, startAfterMinutes, requireApproval)
 *   6.  Location Rule (enabled, radiusMeters)
 *   7.  Photo Rule (requireCheckInPhoto, requireCheckOutPhoto)
 *   8.  HR Report (imageMode)
 *
 * Note: Work schedule start/end times are NOT configured here — each department
 * uses its own WorkSchedulePattern. Late/absent thresholds are applied relative
 * to each employee's own scheduled shift time.
 *
 * UX:
 *   - Loads initial data from GET /api/org-settings
 *   - Save button disabled when no changes have been made
 *   - Only changed sections are sent in PATCH
 *   - Success banner auto-dismisses after 3 seconds
 */
import { useEffect, useRef, useState } from 'react';
import { PageSpinner } from '../../components/Spinner';
import { SettingCard, SettingRow } from '../../components/ui/SettingCard';
import { Toggle } from '../../components/ui/Toggle';
import { useAuth } from '../../context/AuthContext';
import {
  getAttendanceSettings,
  patchAttendanceSettings,
  diffSettings,
  SETTINGS_DEFAULTS,
  type AttendanceSettings,
} from '../../api/hrSettings';

// ─── Small local primitives ───────────────────────────────────────────────────

/** Inline number input styled consistently with the rest of the admin UI. */
function NumberInput({
  value,
  onChange,
  min = 0,
  suffix,
  disabled,
}: {
  value:     number;
  onChange:  (v: number) => void;
  min?:      number;
  suffix?:   string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed) && parsed >= min) onChange(parsed);
        }}
        className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm
          tabular-nums text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-1
          focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export default function HRSettings() {
  const { user } = useAuth();
  const branchId = user?.branchId ?? '';

  const [original, setOriginal] = useState<AttendanceSettings>(SETTINGS_DEFAULTS);
  const [current,  setCurrent]  = useState<AttendanceSettings>(SETTINGS_DEFAULTS);
  const [loading,  setLoading]  = useState(true);
  const [status,   setStatus]   = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!branchId) return;
    getAttendanceSettings(branchId)
      .then((s) => {
        setOriginal(s);
        setCurrent(s);
      })
      .catch(() => {
        // Safe defaults remain in state; user can still edit and save
      })
      .finally(() => setLoading(false));
  }, [branchId]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns true when current state differs from what was last saved. */
  const isDirty =
    JSON.stringify(current) !== JSON.stringify(original);

  /** Update a top-level section by key, merging the partial payload. */
  function update<K extends keyof AttendanceSettings>(
    key: K,
    value: AttendanceSettings[K] extends object
      ? Partial<AttendanceSettings[K]>
      : AttendanceSettings[K],
  ) {
    setCurrent((prev) => {
      const prevValue = prev[key];
      return {
        ...prev,
        [key]:
          typeof prevValue === 'object' && prevValue !== null
            ? { ...(prevValue as object), ...(value as object) }
            : value,
      };
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!isDirty || status === 'saving') return;

    const patch = diffSettings(original, current);
    if (Object.keys(patch).length === 0) return;

    setStatus('saving');
    setErrorMsg('');

    try {
      const saved = await patchAttendanceSettings(branchId, patch);
      setOriginal(saved);
      setCurrent(saved);
      setStatus('success');

      // Auto-dismiss success banner after 3 s
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setStatus('error');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner />;

  const saving = status === 'saving';

  return (
    <div className="p-6 max-w-2xl space-y-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ตั้งค่าระบบ HR</h1>
          <p className="mt-1 text-sm text-gray-400">
            กำหนดกฎการลงเวลา เวลาทำงาน และฟีเจอร์ต่าง ๆ สำหรับองค์กร
          </p>
        </div>

        <button
          type="button"
          disabled={!isDirty || saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm
            font-medium text-white shadow-sm transition-colors hover:bg-primary-700
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>

      {/* ── Status banners ── */}
      {status === 'success' && (
        <div className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700
          ring-1 ring-green-200">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          บันทึกการตั้งค่าเรียบร้อยแล้ว
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600
          ring-1 ring-red-200">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMsg}
        </div>
      )}

      {/* ── 1. Mode ── */}
      <SettingCard
        title="โหมดการลงเวลา"
        description="กำหนดระดับการควบคุมการลงเวลาขององค์กร"
      >
        <SettingRow
          label="โหมด SIMPLE"
          hint={
            current.mode === 'SIMPLE'
              ? 'เปิดใช้งาน — ลงเวลาเข้า/ออกเท่านั้น ไม่มีกำหนดเวลา หรือ OT'
              : 'ปิดใช้งาน — FULL mode: มีกำหนดเวลา, OT และการอนุมัติ'
          }
        >
          <Toggle
            checked={current.mode === 'SIMPLE'}
            onChange={(on) => update('mode', on ? 'SIMPLE' : 'NORMAL')}
            disabled={saving}
            label="สลับโหมด SIMPLE / NORMAL"
          />
        </SettingRow>

        <SettingRow
          label="ต้องการการอนุมัติจากผู้จัดการ"
          hint="เมื่อเปิด การลงเวลาที่ไม่มีตารางงานจะส่งไปที่คิวผู้จัดการ"
        >
          <Toggle
            checked={current.requireManagerApproval}
            onChange={(on) => update('requireManagerApproval', on as AttendanceSettings['requireManagerApproval'])}
            disabled={saving}
            label="ต้องการการอนุมัติจากผู้จัดการ"
          />
        </SettingRow>
      </SettingCard>

      {/* ── 2. Snap Time Engine ── */}
      <SettingCard
        title="Snap Time Engine"
        description="กำหนดพฤติกรรมการรวมช่วงเวลาทำงาน และรูปแบบการอนุมัติการแก้ไขย้อนหลัง"
      >
        <SettingRow
          label="ช่องว่างสูงสุดที่รวมได้ (นาที)"
          hint={
            current.continuousGapMinutes === 0
              ? 'รวมเฉพาะช่วงเวลาที่ติดกันเท่านั้น (ช่องว่าง = 0)'
              : `ช่วงเวลาที่ห่างกันไม่เกิน ${current.continuousGapMinutes} นาทีจะถูกรวมเป็น Snap Window เดียว`
          }
        >
          <NumberInput
            value={current.continuousGapMinutes}
            onChange={(v) => update('continuousGapMinutes', v as AttendanceSettings['continuousGapMinutes'])}
            min={0}
            suffix="นาที"
            disabled={saving}
          />
        </SettingRow>

        <SettingRow
          label="รูปแบบการอนุมัติการแก้ไขย้อนหลัง"
          hint={
            current.retroApprovalMode === 'HR_ONLY'
              ? 'HR_ONLY — HR อนุมัติโดยตรง ไม่ผ่านผู้จัดการ'
              : current.retroApprovalMode === 'MANAGER_ONLY'
              ? 'MANAGER_ONLY — ผู้จัดการอนุมัติ ไม่ต้องผ่าน HR'
              : 'MANAGER_THEN_HR — ผู้จัดการอนุมัติก่อน จากนั้น HR (ค่าเริ่มต้น)'
          }
        >
          <select
            value={current.retroApprovalMode}
            disabled={saving}
            onChange={(e) =>
              update('retroApprovalMode', e.target.value as AttendanceSettings['retroApprovalMode'])
            }
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm
              text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-1
              focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="MANAGER_THEN_HR">MANAGER_THEN_HR (ค่าเริ่มต้น)</option>
            <option value="HR_ONLY">HR_ONLY</option>
            <option value="MANAGER_ONLY">MANAGER_ONLY</option>
          </select>
        </SettingRow>
      </SettingCard>

      {/* ── 3. Late / Absent Rule ── */}
      <SettingCard
        title="กฎการมาสาย"
        description="เงื่อนไขทั้งหมดคำนวณจากเวลาเริ่มงานของตารางงานแต่ละคน ไม่ใช่เวลากลางขององค์กร"
      >
        <SettingRow
          label="เช็คอินก่อนเวลางานได้ (นาที)"
          hint={
            current.checkInWindowMinutes === 0
              ? 'ไม่มีข้อจำกัด — เช็คอินได้ทุกเวลาก่อนกะงาน'
              : `เช็คอินได้ตั้งแต่ ${current.checkInWindowMinutes} นาทีก่อนเวลาเริ่มงาน (0 = ไม่จำกัด)`
          }
        >
          <NumberInput
            value={current.checkInWindowMinutes}
            onChange={(v) => update('checkInWindowMinutes', v as AttendanceSettings['checkInWindowMinutes'])}
            min={0}
            suffix="นาที"
            disabled={saving}
          />
        </SettingRow>

        <SettingRow
          label="ช้ากว่าเวลาเริ่มงาน ___ นาที = สาย"
          hint={`ลงเวลาหลังเวลาเริ่มงานเกิน ${current.lateRule.graceMinutes} นาที จะถูกบันทึกเป็นสาย`}
        >
          <NumberInput
            value={current.lateRule.graceMinutes}
            onChange={(v) => update('lateRule', { graceMinutes: v })}
            suffix="นาที"
            disabled={saving}
          />
        </SettingRow>

        <SettingRow
          label="ช้ากว่าเวลาเริ่มงาน ___ นาที = ขาด"
          hint={
            current.absentAfterMinutes === 0
              ? 'ปิดใช้งาน — ไม่มีการบล็อกเช็คอิน (0 = ปิด)'
              : `ลงเวลาหลังเวลาเริ่มงานเกิน ${current.absentAfterMinutes} นาที จะถูกบล็อกไม่ให้เช็คอิน`
          }
        >
          <NumberInput
            value={current.absentAfterMinutes}
            onChange={(v) => update('absentAfterMinutes', v as AttendanceSettings['absentAfterMinutes'])}
            min={0}
            suffix="นาที"
            disabled={saving}
          />
        </SettingRow>
      </SettingCard>

      {/* ── 4. Early Leave Rule ── */}
      <SettingCard
        title="กฎการออกก่อนเวลา"
        description="คำนวณจากเวลาเลิกงานของตารางงานแต่ละคน"
      >
        <SettingRow
          label="ออกก่อนเวลาเลิกงาน ___ นาที = ออกก่อนเวลา"
          hint={`ออกก่อนเวลาเลิกงานเกิน ${current.earlyLeaveRule.graceMinutes} นาที จะถูกบันทึกเป็นออกก่อนเวลา`}
        >
          <NumberInput
            value={current.earlyLeaveRule.graceMinutes}
            onChange={(v) => update('earlyLeaveRule', { graceMinutes: v })}
            suffix="นาที"
            disabled={saving}
          />
        </SettingRow>
      </SettingCard>

      {/* ── 7. OT Rule ── */}
      <SettingCard
        title="กฎ OT (ล่วงเวลา)"
        description="กำหนดเงื่อนไขการนับชั่วโมง OT"
      >
        <SettingRow
          label="เปิดใช้งาน OT"
          hint="เมื่อปิด ระบบจะไม่คำนวณ OT ใด ๆ"
        >
          <Toggle
            checked={current.otRule.enabled}
            onChange={(on) => update('otRule', { enabled: on })}
            disabled={saving}
            label="เปิดใช้งาน OT"
          />
        </SettingRow>

        <SettingRow
          label="เริ่มนับ OT หลังจาก (นาที)"
          hint={`OT เริ่มนับหลังเลิกงาน ${current.otRule.startAfterMinutes} นาที`}
        >
          <NumberInput
            value={current.otRule.startAfterMinutes}
            onChange={(v) => update('otRule', { startAfterMinutes: v })}
            suffix="นาที"
            disabled={saving || !current.otRule.enabled}
          />
        </SettingRow>

        <SettingRow
          label="OT ต้องการการอนุมัติ"
          hint="เมื่อเปิด คำขอ OT จะถูกส่งให้ผู้จัดการอนุมัติก่อน"
        >
          <Toggle
            checked={current.otRule.requireApproval}
            onChange={(on) => update('otRule', { requireApproval: on })}
            disabled={saving || !current.otRule.enabled}
            label="OT ต้องการการอนุมัติ"
          />
        </SettingRow>
      </SettingCard>

      {/* ── 8. Location Rule ── */}
      <SettingCard
        title="กฎตำแหน่งที่ตั้ง"
        description="บังคับให้ลงเวลาภายในรัศมีที่กำหนดจากที่ทำงาน"
      >
        <SettingRow
          label="เปิดใช้งานการตรวจสอบตำแหน่ง"
          hint="ต้องการ GPS ที่เปิดใช้งานบนอุปกรณ์ของพนักงาน"
        >
          <Toggle
            checked={current.locationRule.enabled}
            onChange={(on) => update('locationRule', { enabled: on })}
            disabled={saving}
            label="เปิดใช้งานการตรวจสอบตำแหน่ง"
          />
        </SettingRow>

        {/* GPS radius is configured per-branch on the Branches page */}
      </SettingCard>

      {/* ── 9. Photo Rule ── */}
      <SettingCard
        title="กฎรูปภาพ"
        description="กำหนดว่าต้องแนบรูปถ่ายเมื่อลงเวลาเข้า/ออกหรือไม่"
      >
        <SettingRow
          label="ต้องถ่ายรูปตอนลงเวลาเข้า"
          hint="พนักงานต้องอัปโหลดรูปตอนเช็คอิน"
        >
          <Toggle
            checked={current.photoRule.requireCheckInPhoto}
            onChange={(on) => update('photoRule', { requireCheckInPhoto: on })}
            disabled={saving}
            label="ต้องถ่ายรูปตอนลงเวลาเข้า"
          />
        </SettingRow>

        <SettingRow
          label="ต้องถ่ายรูปตอนลงเวลาออก"
          hint="พนักงานต้องอัปโหลดรูปตอนเช็คเอาท์"
        >
          <Toggle
            checked={current.photoRule.requireCheckOutPhoto}
            onChange={(on) => update('photoRule', { requireCheckOutPhoto: on })}
            disabled={saving}
            label="ต้องถ่ายรูปตอนลงเวลาออก"
          />
        </SettingRow>
      </SettingCard>

      {/* ── 10. HR Report ── */}
      <SettingCard
        title="รายงาน HR"
        description="ควบคุมวิธีการโหลดรูปภาพในรายงาน"
      >
        <SettingRow
          label="โหมดรูปภาพในรายงาน"
          hint={
            current.hrReport.imageMode === 'ALWAYS'
              ? 'ALWAYS — โหลดรูปทุกครั้งในรายงาน (ช้ากว่า)'
              : current.hrReport.imageMode === 'ON_DEMAND'
              ? 'ON_DEMAND — โหลดรูปเมื่อต้องการเท่านั้น'
              : 'OFF — ไม่แสดงรูปในรายงาน'
          }
        >
          <select
            value={current.hrReport.imageMode}
            disabled={saving}
            onChange={(e) =>
              update('hrReport', {
                imageMode: e.target.value as AttendanceSettings['hrReport']['imageMode'],
              })
            }
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm
              text-gray-900 focus:border-primary-400 focus:outline-none focus:ring-1
              focus:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="ALWAYS">ALWAYS</option>
            <option value="ON_DEMAND">ON_DEMAND</option>
            <option value="OFF">OFF</option>
          </select>
        </SettingRow>
      </SettingCard>

      {/* ── Bottom save button (convenience duplicate for long pages) ── */}
      <div className="flex justify-end pb-4">
        <button
          type="button"
          disabled={!isDirty || saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 text-sm
            font-medium text-white shadow-sm transition-colors hover:bg-primary-700
            focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
      </div>

    </div>
  );
}
