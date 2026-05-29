/**
 * attendance.absentJob.ts
 *
 * Background job: auto-marks employees as absent when:
 *   - They have a scheduled shift today
 *   - No check-in record exists for that shift
 *   - Current time > shift start + branch.absentAfterMinutes
 *   - absentAfterMinutes > 0 (0 = feature disabled)
 *
 * Runs every 2 minutes. Safe to call multiple times — idempotent per shift.
 */
import { JsonRepository }       from '../../shared/repository/JsonRepository';
import type { IRepository }     from '../../shared/repository/IRepository';
import type { AttendanceRecord, Branch } from '@hospital-hr/shared';
import type { UserRecord }      from '../employees/employee.service';
import { getEffectiveBranchSettings } from '../branch-settings/branchSettings.runtime';
import { resolveWorkingTime }   from '../schedules/schedule.resolver';

const attendanceStore: IRepository<AttendanceRecord> = new JsonRepository<AttendanceRecord>('attendance');
const employeeStore:   IRepository<UserRecord>       = new JsonRepository<UserRecord>('employees');
const branchStore:     IRepository<Branch>           = new JsonRepository<Branch>('branches');

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function runInProgressAutoClose(): Promise<void> {
  const now = new Date();

  const stale = attendanceStore.findAll(
    (r) => r.status === 'in_progress' && !!r.checkInTime,
  );

  for (const record of stale) {
    const settings  = getEffectiveBranchSettings(record.branchId);
    const maxMs     = settings.maxInProgressHours * 60 * 60 * 1000;
    const checkInAt = new Date(record.checkInTime!);

    if (now.getTime() - checkInAt.getTime() < maxMs) continue;

    // Auto-close: move to pending_approval for HR review
    attendanceStore.updateById(record.id, {
      checkOutTime:  now.toISOString(),
      status:        'pending_approval',
      outOfScheduleReason: 'ระบบปิดการเช็คอินอัตโนมัติ (เกินเวลาสูงสุด)',
    });

    console.info('[AbsentJob] Auto-closed in_progress', { id: record.id, userId: record.userId });
  }
}

async function runAbsentCheck(): Promise<void> {
  const today   = todayStr();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  const activeBranches = branchStore.findAll((b) => b.isActive);

  for (const branch of activeBranches) {
    const settings = getEffectiveBranchSettings(branch.id);
    if (settings.absentAfterMinutes <= 0) continue;

    const employees = employeeStore.findAll(
      (u) => u.isActive && u.branchId === branch.id,
    );

    for (const emp of employees) {
      try {
        const resolved = await resolveWorkingTime(emp.id, today);
        if (!resolved || resolved.source === 'holiday') continue;

        const shiftStartMins = toMinutes(resolved.startTime);
        const cutoff         = shiftStartMins + settings.absentAfterMinutes;
        if (nowMins < cutoff) continue;

        // Check if a record already exists for this shift (any status)
        const existing = attendanceStore.findOne(
          (r) => r.userId === emp.id && r.date === today && !r.shiftCode,
        );
        if (existing) continue;

        // Auto-create absent record
        attendanceStore.create({
          userId:   emp.id,
          branchId: branch.id,
          date:     today,
          status:   'absent',
        } as Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>);

        console.info('[AbsentJob] Marked absent', { userId: emp.id, branchId: branch.id, date: today });
      } catch {
        // Skip individual resolution failures silently
      }
    }
  }
}

/** Start both background jobs. Run every 2 minutes. */
export function startAbsentJob(): void {
  setTimeout(() => {
    runInProgressAutoClose().catch(() => {});
    runAbsentCheck().catch(() => {});

    setInterval(() => {
      runInProgressAutoClose().catch(() => {});
      runAbsentCheck().catch(() => {});
    }, 2 * 60 * 1000);
  }, 60_000);

  console.info('[AbsentJob] Scheduled — runs every 2 minutes');
}
