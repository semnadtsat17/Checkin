/**
 * org-settings.router.ts
 *
 * Exposes organization-level feature flags to the frontend.
 * GET  /org-settings  — any authenticated user (used by frontend on load)
 * PATCH /org-settings — super_admin only
 *
 * Safety guardrails on PATCH:
 *  1. Idempotent — no write (and no audit entry) if payload matches stored values
 *  2. Mode transition lock — 409 MODE_CHANGE_LOCKED if current-month attendance records exist
 *  3. Approval auto-resolve — pending_approval → present (SYSTEM_AUTO) when disabling manager approval
 *  4. Audit log — every actual write appended to org_settings_audit.json
 *  5. EventEmitter — ORG_SETTINGS_UPDATED emitted after successful write
 */
import { EventEmitter } from 'events';
import { Router } from 'express';
import type { AttendanceRecord } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';

// ─── Storage shapes ───────────────────────────────────────────────────────────

interface OrgSettingsRecord {
  id:                      string;
  attendanceMode:          'WORKFORCE' | 'SIMPLE';
  requireManagerApproval:  boolean;
  createdAt:               string;
  updatedAt:               string;
}

interface OrgSettingsAuditRecord {
  id:              string;
  changedByUserId: string;
  previousValue:   Pick<OrgSettingsRecord, 'attendanceMode' | 'requireManagerApproval'>;
  newValue:        Pick<OrgSettingsRecord, 'attendanceMode' | 'requireManagerApproval'>;
  timestamp:       string;
  createdAt:       string;
  updatedAt:       string;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

const store          = new JsonRepository<OrgSettingsRecord>('org_settings');
const auditStore     = new JsonRepository<OrgSettingsAuditRecord>('org_settings_audit');
const attendanceStore = new JsonRepository<AttendanceRecord>('attendance');

// ─── In-process event bus ────────────────────────────────────────────────────

export const orgSettingsEvents = new EventEmitter();
export const ORG_SETTINGS_UPDATED = 'ORG_SETTINGS_UPDATED';

// ─── Defaults — must match existing backend behavior exactly ─────────────────
//
// attendanceMode: WORKFORCE  → no behavior change until HR explicitly switches
// requireManagerApproval: true  → existing pending_approval flow unchanged

const SEED_DEFAULTS = {
  attendanceMode:         'WORKFORCE' as const,
  requireManagerApproval: true,
};

/** Get the singleton record, auto-creating with safe defaults if missing. */
function getOrCreate(): OrgSettingsRecord {
  const existing = store.findOne(() => true);
  if (existing) return existing;
  return store.create(SEED_DEFAULTS);
}

// ─── Response shape (frontend contract) ──────────────────────────────────────

function toClientShape(record: OrgSettingsRecord, isSuperAdmin: boolean) {
  return {
    mode:                   record.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'FULL',
    requireManagerApproval: record.requireManagerApproval ?? true,
    superAdminEnabled:      isSuperAdmin,
    hrReportImageMode:      'ON_DEMAND' as const,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * GET /org-settings
 * Returns feature-flag config for the authenticated user.
 * superAdminEnabled is per-user (derived from role), not a stored flag.
 */
router.get('/', authenticate, (req, res) => {
  const record = getOrCreate();
  res.json({
    success: true,
    data:    toClientShape(record, req.user?.role === 'super_admin'),
  });
});

/**
 * PATCH /org-settings
 * Super admin can flip mode and requireManagerApproval.
 *
 * Guardrails (in order):
 *  1. Idempotent check   — bail out early with 200 if nothing would change
 *  2. Mode lock check    — 409 if switching modes with current-month records
 *  3. Write              — persist only changed fields
 *  4. Approval cleanup   — auto-resolve pending_approval when disabling approval
 *  5. Audit              — append entry to org_settings_audit.json
 *  6. Event              — emit ORG_SETTINGS_UPDATED with new config
 */
router.patch('/', authenticate, requireRole('super_admin'), (req, res) => {
  const record = getOrCreate();

  const { mode, requireManagerApproval } = req.body as {
    mode?:                   'FULL' | 'SIMPLE';
    requireManagerApproval?: boolean;
  };

  // Build the desired new state from the payload
  const desiredMode: 'WORKFORCE' | 'SIMPLE' =
    mode !== undefined
      ? mode === 'SIMPLE' ? 'SIMPLE' : 'WORKFORCE'
      : record.attendanceMode;

  const desiredApproval: boolean =
    requireManagerApproval !== undefined
      ? Boolean(requireManagerApproval)
      : record.requireManagerApproval;

  // ── Guardrail 1: Idempotent ──────────────────────────────────────────────
  // If every requested field already matches the stored value, skip the write.
  const modeChanging     = desiredMode     !== record.attendanceMode;
  const approvalChanging = desiredApproval !== record.requireManagerApproval;

  if (!modeChanging && !approvalChanging) {
    return res.json({ success: true, data: toClientShape(record, true) });
  }

  // ── Guardrail 2: Mode transition lock ────────────────────────────────────
  // Block switching attendanceMode if ANY attendance record exists in the
  // current calendar month. A partial month of mixed-mode records would
  // produce incoherent summary reports.
  if (modeChanging) {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const hasCurrentMonthRecords = attendanceStore.exists(
      (r) => r.date.startsWith(currentMonth),
    );
    if (hasCurrentMonthRecords) {
      return res.status(409).json({
        success: false,
        error:   'MODE_CHANGE_LOCKED',
        message: `Cannot switch attendance mode while records exist for ${currentMonth}. Try again after the month rolls over, or delete the current-month records first.`,
      });
    }
  }

  // ── Guardrail 3: Write ────────────────────────────────────────────────────
  const previousValue = {
    attendanceMode:         record.attendanceMode,
    requireManagerApproval: record.requireManagerApproval,
  };

  const patch: Partial<OrgSettingsRecord> = {};
  if (modeChanging)     patch.attendanceMode         = desiredMode;
  if (approvalChanging) patch.requireManagerApproval = desiredApproval;

  const updated = store.updateById(record.id, patch) ?? record;

  // ── Guardrail 4: Auto-resolve pending_approval records ───────────────────
  // When requireManagerApproval is switched OFF, every record currently
  // sitting at pending_approval is no longer actionable by managers.
  // Promote them to 'present' so they appear in reports and don't pile up.
  let autoResolvedCount = 0;
  if (approvalChanging && !desiredApproval) {
    attendanceStore.transaction((items) =>
      items.map((r) => {
        if (r.status !== 'pending_approval') return r;
        autoResolvedCount++;
        return {
          ...r,
          status:    'present' as const,
          approvedBy: 'SYSTEM_AUTO',
          updatedAt:  new Date().toISOString(),
        };
      }),
    );
  }

  // ── Guardrail 5: Audit log ────────────────────────────────────────────────
  auditStore.create({
    changedByUserId: req.user!.userId,
    previousValue,
    newValue: {
      attendanceMode:         updated.attendanceMode,
      requireManagerApproval: updated.requireManagerApproval,
    },
    timestamp: new Date().toISOString(),
  } as Omit<OrgSettingsAuditRecord, 'id' | 'createdAt' | 'updatedAt'>);

  // ── Guardrail 6: In-process event ─────────────────────────────────────────
  orgSettingsEvents.emit(ORG_SETTINGS_UPDATED, {
    attendanceMode:         updated.attendanceMode,
    requireManagerApproval: updated.requireManagerApproval,
    autoResolvedCount,
  });

  return res.json({
    success: true,
    data:    toClientShape(updated, true),   // caller is always super_admin here
    ...(autoResolvedCount > 0 && { autoResolvedCount }),
  });
});

export default router;
