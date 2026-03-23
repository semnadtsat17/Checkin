import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ScheduleApproval, User, WorkSchedulePattern, Department } from '@hospital-hr/shared';
import { scheduleApprovalApi } from '../../api/scheduleApprovals';
import { scheduleApi, type ScheduleDayRecord } from '../../api/schedules';
import { employeeApi } from '../../api/employees';
import { workSchedulePatternApi } from '../../api/subRoles';
import { deptApi } from '../../api/departments';
import { PageSpinner } from '../../components/Spinner';
import { toLocalIso } from '../../utils/date/getWeekStart';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getMonthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`
  );
}

const TH_DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScheduleApprovalPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();

  const [approval,   setApproval]   = useState<ScheduleApproval | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [employees,  setEmployees]  = useState<User[]>([]);
  const [schedules,  setSchedules]  = useState<ScheduleDayRecord[]>([]);
  const [subRoles,   setSubRoles]   = useState<WorkSchedulePattern[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState('');

  const [rejectMode,   setRejectMode]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [acting,       setActing]       = useState(false);
  const [actionMsg,    setActionMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  // ── Load everything in one shot ───────────────────────────────────────────

  useEffect(() => {
    if (!scheduleId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const ap = await scheduleApprovalApi.getOne(scheduleId!);
        if (cancelled) return;
        setApproval(ap);

        const monthDays = getMonthDays(ap.month);
        const [emps, days, patterns, depts] = await Promise.all([
          employeeApi.list({ departmentId: ap.departmentId, isActive: true, pageSize: 200 }),
          scheduleApi.listDays({
            departmentId: ap.departmentId,
            from: monthDays[0],
            to:   monthDays[monthDays.length - 1],
          }),
          workSchedulePatternApi.list(),
          deptApi.list({ pageSize: 200 }),
        ]);

        if (cancelled) return;
        setEmployees(emps.items);
        setSchedules(days);
        setSubRoles(patterns);
        setDepartment(depts.items.find((d) => d.id === ap.departmentId) ?? null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [scheduleId]);

  // ── Approve / Reject ─────────────────────────────────────────────────────

  async function handleApprove() {
    if (!scheduleId) return;
    setActing(true);
    setActionMsg(null);
    try {
      await scheduleApprovalApi.approve(scheduleId);
      setActionMsg({ ok: true, text: 'อนุมัติตารางงานเรียบร้อย' });
      setTimeout(() => navigate('/schedules'), 1500);
    } catch (err) {
      setActionMsg({ ok: false, text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!scheduleId || !rejectReason.trim()) return;
    setActing(true);
    setActionMsg(null);
    try {
      await scheduleApprovalApi.reject(scheduleId, rejectReason.trim());
      setActionMsg({ ok: true, text: 'ปฏิเสธตารางงานเรียบร้อย' });
      setTimeout(() => navigate('/schedules'), 1500);
    } catch (err) {
      setActionMsg({ ok: false, text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setActing(false);
    }
  }

  // ── Early returns ─────────────────────────────────────────────────────────

  if (loading) return <PageSpinner />;

  if (loadError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          onClick={() => navigate('/schedules')}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← กลับ
        </button>
      </div>
    );
  }

  if (!approval) return null;

  // ── Derived ───────────────────────────────────────────────────────────────

  const monthDays = getMonthDays(approval.month);
  const today     = toLocalIso(new Date());
  const isPending = approval.status === 'pending_hr_approval';

  const flatSchedule: Record<string, Record<string, ScheduleDayRecord>> = {};
  for (const r of schedules) {
    if (!flatSchedule[r.userId]) flatSchedule[r.userId] = {};
    flatSchedule[r.userId][r.date] = r;
  }

  const subRoleById = Object.fromEntries(subRoles.map((sr) => [sr.id, sr]));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 max-w-full">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/schedules')}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← กลับ
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              ตรวจสอบตารางเวร — {department?.nameTh ?? approval.departmentId}
            </h1>
            <p className="mt-0.5 text-sm text-gray-400">
              เดือน {approval.month} · ส่งเมื่อ{' '}
              {new Date(approval.submittedAt).toLocaleDateString('th-TH')}
            </p>
          </div>
        </div>

        {/* Action area */}
        {actionMsg ? (
          <span className={`text-sm font-medium ${actionMsg.ok ? 'text-green-700' : 'text-red-600'}`}>
            {actionMsg.text}
          </span>
        ) : isPending ? (
          <div className="flex items-center gap-2">
            {rejectMode ? (
              <>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="เหตุผลที่ปฏิเสธ…"
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm outline-none focus:border-red-500"
                />
                <button
                  onClick={handleReject}
                  disabled={acting || !rejectReason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {acting ? 'กำลังส่ง…' : 'ยืนยันปฏิเสธ'}
                </button>
                <button
                  onClick={() => setRejectMode(false)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {acting ? 'กำลังส่ง…' : 'อนุมัติ'}
                </button>
                <button
                  onClick={() => setRejectMode(true)}
                  disabled={acting}
                  className="rounded-lg border border-red-300 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  ปฏิเสธ
                </button>
              </>
            )}
          </div>
        ) : (
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            approval.status === 'published'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-600'
          }`}>
            {approval.status === 'published' ? 'เผยแพร่แล้ว' : 'ถูกปฏิเสธ'}
          </span>
        )}
      </div>

      {/* Reject reason banner (shown after rejection) */}
      {approval.status === 'rejected' && (approval as any).rejectReason && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          เหตุผล: {(approval as any).rejectReason}
        </div>
      )}

      {/* Schedule grid — read-only */}
      {employees.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">ไม่มีพนักงานในแผนกนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-gray-100">
          <table
            className="border-collapse text-sm"
            style={{ minWidth: `${140 + monthDays.length * 52}px` }}
          >
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-gray-100 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500">
                  พนักงาน
                </th>
                {monthDays.map((date) => {
                  const d   = new Date(date + 'T00:00:00');
                  const dow = d.getDay();
                  return (
                    <th
                      key={date}
                      className={`min-w-[48px] border-b border-r border-gray-100 px-1 py-2 text-center text-xs last:border-r-0 ${
                        dow === 0 || dow === 6 ? 'bg-red-50 text-red-400' : 'text-gray-500'
                      }`}
                    >
                      <div className="font-semibold leading-tight">{d.getDate()}</div>
                      <div className="font-normal opacity-60">{TH_DOW_SHORT[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-gray-100 last:border-b-0">
                  {/* Sticky name column */}
                  <td className="sticky left-0 z-10 border-r border-gray-100 bg-white px-4 py-2">
                    <div className="text-xs font-semibold leading-tight text-gray-900">
                      {emp.firstNameTh} {emp.lastNameTh}
                    </div>
                    {emp.workSchedulePatternId && subRoleById[emp.workSchedulePatternId] && (
                      <div className="mt-0.5 text-xs text-gray-400">
                        {subRoleById[emp.workSchedulePatternId].nameTh}
                      </div>
                    )}
                  </td>

                  {/* Day cells — read-only */}
                  {monthDays.map((date) => {
                    const d        = new Date(date + 'T00:00:00');
                    const dow      = d.getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isPast   = date < today;
                    const rec      = flatSchedule[emp.id]?.[date];

                    let badge: React.ReactNode = <span className="text-xs text-gray-200">—</span>;
                    if (rec) {
                      if (rec.isDayOff) {
                        badge = (
                          <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                            หยุด
                          </span>
                        );
                      } else {
                        const codes = rec.shiftCodes.length > 0 ? rec.shiftCodes : (rec.shiftCode ? [rec.shiftCode] : []);
                        if (codes.length > 0) {
                          badge = (
                            <span className="rounded px-1.5 py-0.5 text-xs font-bold leading-tight bg-primary-100 text-primary-700">
                              {codes.join('')}
                            </span>
                          );
                        }
                      }
                    }

                    return (
                      <td
                        key={date}
                        className={`border-r border-gray-100 px-1 py-1.5 text-center last:border-r-0 ${
                          isWeekend ? 'bg-red-50/40' : isPast ? 'bg-gray-50/60' : ''
                        }`}
                      >
                        {badge}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {employees.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-primary-100 text-xs font-bold text-primary-700">D</span>
            กะทำงาน
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-5 w-8 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">หยุด</span>
            วันหยุด
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-4 w-8 rounded bg-red-50 border border-red-100" />
            วันหยุดสุดสัปดาห์
          </span>
        </div>
      )}
    </div>
  );
}
