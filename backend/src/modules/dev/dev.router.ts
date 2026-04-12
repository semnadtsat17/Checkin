/**
 * dev.router.ts
 *
 * Developer-only tooling routes.
 * Mounted at /api/dev ONLY when NODE_ENV !== 'production' (see server.ts).
 * Every route is additionally protected by devOnlyGuard as a second barrier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/dev/reset-attendance-mode
 *
 * Bypasses the MODE_CHANGE_LOCKED guardrail that prevents mid-month mode
 * switches in production.  Intended for:
 *   • Local development environment resets
 *   • Staging environment test setup
 *   • Automated integration test fixtures
 *
 * NEVER expose this router in production.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️  RISK SUMMARY (returned in every response):
 *   • deleteCurrentMonthData=true performs an IRREVERSIBLE hard-delete on
 *     attendance records, OT entries, and pending approvals.
 *   • deleteCurrentMonthData=false switches mode with mixed-mode records
 *     still present, which produces incoherent monthly summaries.
 *   • Both paths emit ORG_SETTINGS_UPDATED, so the runtime cache updates
 *     instantly — all subsequent check-ins immediately use the new engine.
 */
import { Router } from 'express';
import type { AttendanceRecord, ExtraWork } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { devOnlyGuard }   from './devOnly.guard';
import {
  orgSettingsEvents,
  ORG_SETTINGS_UPDATED,
} from '../org-settings/org-settings.router';

// ─── Local type aliases (mirrors org-settings.router.ts internals) ────────────

interface OrgSettingsRecord {
  id:                     string;
  attendanceMode:         'WORKFORCE' | 'SIMPLE';
  requireManagerApproval: boolean;
  createdAt:              string;
  updatedAt:              string;
}

interface DevAuditRecord {
  id:          string;
  action:      'DEV_MODE_OVERRIDE';
  performedBy: string;            // userId from JWT
  targetMode:  string;
  previousMode: string;
  deletedAttendanceCount:  number;
  deletedExtraWorkCount:   number;
  bypassedLock:            boolean;  // true when deleteCurrentMonthData=false
  timestamp:   string;
  createdAt:   string;
  updatedAt:   string;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

const orgStore        = new JsonRepository<OrgSettingsRecord>('org_settings');
const attendanceStore = new JsonRepository<AttendanceRecord>('attendance');
const extraWorkStore  = new JsonRepository<ExtraWork>('extra_work');
const devAuditStore   = new JsonRepository<DevAuditRecord>('dev_audit');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the current-month prefix, e.g. "2026-04". */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Get the singleton org-settings record, seeding defaults if absent. */
function getOrgSettings(): OrgSettingsRecord {
  const existing = orgStore.findOne(() => true);
  if (existing) return existing;
  return orgStore.create({
    attendanceMode:         'WORKFORCE',
    requireManagerApproval: true,
  } as Omit<OrgSettingsRecord, 'id' | 'createdAt' | 'updatedAt'>);
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

// All dev routes share the guard — production requests are rejected here.
router.use(devOnlyGuard);

/**
 * POST /api/dev/reset-attendance-mode
 *
 * Body:
 *   targetMode            'FULL' | 'SIMPLE'
 *   deleteCurrentMonthData  boolean
 *
 * Behaviour:
 *   deleteCurrentMonthData=true  → hard-delete current-month attendance + OT,
 *                                   then switch mode cleanly (no mixed data).
 *   deleteCurrentMonthData=false → bypass MODE_CHANGE_LOCKED, switch mode
 *                                   with existing records still present.
 *                                   Monthly summaries will be incoherent.
 */
router.post('/reset-attendance-mode', (req, res) => {
  const { targetMode, deleteCurrentMonthData } = req.body as {
    targetMode:             'FULL' | 'SIMPLE';
    deleteCurrentMonthData: boolean;
  };

  // ── Input validation ────────────────────────────────────────────────────────
  if (targetMode !== 'FULL' && targetMode !== 'SIMPLE') {
    return res.status(400).json({
      success: false,
      error:   'VALIDATION_ERROR',
      message: 'targetMode must be "FULL" or "SIMPLE".',
    });
  }
  if (typeof deleteCurrentMonthData !== 'boolean') {
    return res.status(400).json({
      success: false,
      error:   'VALIDATION_ERROR',
      message: 'deleteCurrentMonthData must be a boolean.',
    });
  }

  const month               = currentMonth();
  const desiredMode         = targetMode === 'SIMPLE' ? 'SIMPLE' : 'WORKFORCE';
  const record              = getOrgSettings();
  const previousMode        = record.attendanceMode;
  const actorUserId         = (req as any).user?.userId ?? 'DEV_ANONYMOUS';

  let deletedAttendanceCount = 0;
  let deletedExtraWorkCount  = 0;

  // ── Path A: delete current-month data, then switch cleanly ─────────────────
  if (deleteCurrentMonthData) {
    // Hard-delete all attendance records for the current calendar month.
    // pending_approval records are included — they are attendance records too.
    attendanceStore.transaction((items) => {
      const kept = items.filter((r) => !r.date.startsWith(month));
      deletedAttendanceCount = items.length - kept.length;
      return kept;
    });

    // Hard-delete OT / extra-work entries for the current month.
    extraWorkStore.transaction((items) => {
      const kept = items.filter((r) => !(r as any).date?.startsWith(month));
      deletedExtraWorkCount = items.length - kept.length;
      return kept;
    });
  }

  // ── Path B (unsafe): bypass lock, switch with data still present ────────────
  // No deletions — mode switches regardless of existing records.
  // Monthly summaries will be incoherent; caller is warned in the response.

  // ── Mode update ─────────────────────────────────────────────────────────────
  const updated = orgStore.updateById(record.id, {
    attendanceMode: desiredMode,
  }) ?? record;

  // ── Audit ────────────────────────────────────────────────────────────────────
  devAuditStore.create({
    action:                  'DEV_MODE_OVERRIDE',
    performedBy:             actorUserId,
    targetMode,
    previousMode,
    deletedAttendanceCount,
    deletedExtraWorkCount,
    bypassedLock:            !deleteCurrentMonthData,
    timestamp:               new Date().toISOString(),
  } as Omit<DevAuditRecord, 'id' | 'createdAt' | 'updatedAt'>);

  // ── Runtime cache invalidation ───────────────────────────────────────────────
  // Emit the same event as the production PATCH handler so orgSettings.runtime.ts
  // updates its in-memory cache instantly.  All subsequent check-ins use the
  // new engine without a server restart.
  orgSettingsEvents.emit(ORG_SETTINGS_UPDATED, {
    attendanceMode:         updated.attendanceMode,
    requireManagerApproval: updated.requireManagerApproval,
    autoResolvedCount:      0,
  });

  // ── Response ─────────────────────────────────────────────────────────────────
  const warnings: string[] = [
    '⚠️  DEV ONLY — this endpoint does not exist in production.',
  ];

  if (deleteCurrentMonthData) {
    warnings.push(
      `Permanently deleted ${deletedAttendanceCount} attendance record(s) and ` +
      `${deletedExtraWorkCount} OT record(s) for ${month}. This is irreversible.`,
    );
  } else {
    warnings.push(
      'MODE_CHANGE_LOCKED bypassed. Mixed-mode records still exist — ' +
      `monthly summaries for ${month} will be incoherent. ` +
      'Run with deleteCurrentMonthData=true or wait for the month to roll over.',
    );
  }

  return res.json({
    success:  true,
    newMode:  targetMode,
    month,
    deletedAttendanceCount,
    deletedExtraWorkCount,
    bypassedLock:            !deleteCurrentMonthData,
    auditAction:             'DEV_MODE_OVERRIDE',
    warnings,
  });
});

export default router;
