/**
 * leaveAttendanceSync.subscriber.ts
 *
 * Retroactive attendance sync on HR leave approval.
 *
 * When HR gives final approval, every attendance record that falls inside the
 * leave date range and has an eligible status is automatically updated to
 * 'on_leave'.  The attendance engines are never called — this is a direct
 * store mutation that corrects past data, not a forward-looking status
 * computation.
 *
 * Registration: imported once as a side-effect in src/index.ts.
 * The leaveEvents.on() call at module level is the entire registration.
 *
 * ─── ELIGIBLE STATUS TRANSITIONS ─────────────────────────────────────────────
 *
 *   pending_approval  → on_leave   (employee worked without shift; leave explains it)
 *   absent            → on_leave   (system marked absent; leave retroactively covers it)
 *   late              → on_leave   (partial presence; leave overrides)
 *
 *   present           → untouched  (employee was genuinely present — no retroactive override)
 *   on_leave          → untouched  (idempotency guard — already correct)
 *   early_leave       → untouched  (partial presence decision stands)
 *   holiday           → untouched  (public holiday takes precedence)
 *   on_leave          → untouched  (already synced)
 *
 * ─── SAFETY GUARANTEES ────────────────────────────────────────────────────────
 *
 *   • Subscriber never throws — safeExecute() catches and logs all errors.
 *   • Idempotency — records already 'on_leave' are skipped unconditionally.
 *   • Only reacts to stage === 'hr' — manager approval is ignored.
 *   • attendanceStore.transaction() is the single read-modify-write; no
 *     partial writes possible if the transform throws mid-loop.
 *   • affectedCount is incremented only before the write, so the audit
 *     entry reflects actual changes, not iterations.
 *
 * ─── DEPENDENCY FIREWALL ──────────────────────────────────────────────────────
 *   ✗  attendance engines       — not imported; engines own status computation
 *   ✗  leave.service            — not imported; we use the event payload only
 *   ✗  schedule.service
 *   ✗  extra-work.service
 */
import type { AttendanceRecord } from '@hospital-hr/shared';
import { JsonRepository } from '../../../shared/repository/JsonRepository';
import {
  leaveEvents,
  LEAVE_APPROVED,
  type LeaveApprovedPayload,
} from '../leave.events';

// ─── Stores ───────────────────────────────────────────────────────────────────
// Direct repository access — bypasses attendanceService to avoid any circular
// dependency.  This subscriber is a data-correction layer, not a domain actor.

const attendanceStore = new JsonRepository<AttendanceRecord>('attendance');

// ─── Projection audit ─────────────────────────────────────────────────────────
// Separate from leave_audit.json (which tracks leave state changes).
// This file records every retroactive sync operation for debugging / payroll.

interface ProjectionAuditRecord {
  id:                      string;
  type:                    'leave_projection';
  leaveId:                 string;
  userId:                  string;
  dateRange:               string;   // "YYYY-MM-DD → YYYY-MM-DD"
  affectedAttendanceCount: number;
  timestamp:               string;
  createdAt:               string;
  updatedAt:               string;
}

const projectionAuditStore = new JsonRepository<ProjectionAuditRecord>('leave_projection_audit');

// ─── Eligible statuses ────────────────────────────────────────────────────────

/** Only these statuses may be retroactively converted to 'on_leave'. */
const ELIGIBLE_STATUSES = new Set<AttendanceRecord['status']>([
  'pending_approval',
  'absent',
  'late',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate every YYYY-MM-DD string between startDate and endDate (inclusive).
 * Uses local-midnight Date to avoid UTC offset shifting the calendar date.
 */
function buildDateSet(startDate: string, endDate: string): Set<string> {
  const dates = new Set<string>();
  const current = new Date(`${startDate}T00:00:00`);
  const end     = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    const y  = current.getFullYear();
    const m  = String(current.getMonth() + 1).padStart(2, '0');
    const d  = String(current.getDate()).padStart(2, '0');
    dates.add(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Execute fn() safely — catches any thrown error, logs it, and returns.
 * The subscriber is not allowed to propagate exceptions to the EventEmitter
 * caller (leave.service.approveByHR), as that would fail the HTTP response.
 */
function safeExecute(fn: () => void, context: string): void {
  try {
    fn();
  } catch (err) {
    console.error(`[LeaveAttendanceSync] Unhandled error in ${context}:`, err);
  }
}

// ─── Subscription ─────────────────────────────────────────────────────────────

leaveEvents.on(LEAVE_APPROVED, (payload: LeaveApprovedPayload) => {
  // ── Guard: only final HR approval triggers retroactive sync ──────────────────
  if (payload.stage !== 'hr') return;

  const { leaveRequest } = payload;
  const { id: leaveId, userId, startDate, endDate } = leaveRequest;

  safeExecute(() => {
    const dateSet  = buildDateSet(startDate, endDate);
    const syncedAt = new Date().toISOString();
    let   affectedAttendanceCount = 0;

    // ── Phase 2: Transactional update ────────────────────────────────────────
    // attendanceStore.transaction() does a single read → transform → write.
    // The transform must be pure (no I/O).  The write only happens when the
    // transform returns without throwing.
    attendanceStore.transaction((items) =>
      items.map((record) => {
        // ── Phase 3: Idempotency guard ──────────────────────────────────────
        // Records already on_leave are skipped completely — running this
        // subscriber twice for the same leave produces the same result.
        if (record.status === 'on_leave') return record;

        // Filter: only this employee's records
        if (record.userId !== userId) return record;

        // Filter: only dates within the leave range
        if (!dateSet.has(record.date)) return record;

        // Filter: only eligible statuses (present, early_leave, holiday untouched)
        if (!ELIGIBLE_STATUSES.has(record.status)) return record;

        // Apply retroactive correction
        affectedAttendanceCount++;
        return {
          ...record,
          status:     'on_leave' as const,
          approvedBy: 'SYSTEM_LEAVE_SYNC',
          updatedAt:  syncedAt,
        };
      }),
    );

    // ── Phase 4: Projection audit entry ──────────────────────────────────────
    projectionAuditStore.create({
      type:                    'leave_projection',
      leaveId,
      userId,
      dateRange:               `${startDate} → ${endDate}`,
      affectedAttendanceCount,
      timestamp:               syncedAt,
    } as Omit<ProjectionAuditRecord, 'id' | 'createdAt' | 'updatedAt'>);

    console.info('[LeaveAttendanceSync] Sync complete', {
      leaveId,
      userId,
      dateRange:               `${startDate} → ${endDate}`,
      affectedAttendanceCount,
    });

  }, `LEAVE_APPROVED[leaveId=${leaveId}, userId=${userId}]`);
});
