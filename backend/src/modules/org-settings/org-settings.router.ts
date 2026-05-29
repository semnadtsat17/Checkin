/**
 * org-settings.router.ts
 *
 * Organisation-wide attendance configuration.
 * GET  /org-settings  — any authenticated user
 * PATCH /org-settings — hr and above
 *
 * Stored fields (OrgSettingsRecord):
 *   attendanceMode, requireManagerApproval, continuousGapMinutes, retroApprovalMode
 *   workSchedule, lateRule, earlyLeaveRule, checkInWindowMinutes, absentAfterMinutes
 *   photoRule, locationRule
 *
 * Safety guardrails on PATCH:
 *  1. Idempotent   — no write if payload matches stored values
 *  2. Mode lock    — 409 if switching modes with current-month attendance records
 *  3. Auto-resolve — pending_approval → present when disabling manager approval
 *  4. Audit log    — every actual write appended to org_settings_audit.json
 *  5. Event        — ORG_SETTINGS_UPDATED emitted after successful write
 */
import { EventEmitter } from 'events';
import { Router } from 'express';
import type { AttendanceRecord } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import { logSettingsUpdate } from '../audit/audit.service';

// ─── Storage shapes ───────────────────────────────────────────────────────────

interface WorkSchedule {
  startTime: string;   // HH:mm
  endTime:   string;   // HH:mm
  flexible:  boolean;
}

interface LateRule        { graceMinutes: number }
interface EarlyLeaveRule  { graceMinutes: number }
interface PhotoRule       { requireCheckInPhoto: boolean; requireCheckOutPhoto: boolean }
interface LocationRule    { enabled: boolean; radiusMeters: number }

interface OrgSettingsRecord {
  id:                      string;
  attendanceMode:          'WORKFORCE' | 'SIMPLE';
  requireManagerApproval:  boolean;
  continuousGapMinutes:    number;
  retroApprovalMode:       'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
  // Attendance condition settings
  workSchedule?:           WorkSchedule;
  lateRule?:               LateRule;
  earlyLeaveRule?:         EarlyLeaveRule;
  checkInWindowMinutes?:   number;   // minutes before shift start allowed; 0 = no restriction
  absentAfterMinutes?:     number;   // minutes after shift start → block check-in; 0 = disabled
  photoRule?:              PhotoRule;
  locationRule?:           LocationRule;
  createdAt:               string;
  updatedAt:               string;
}

interface OrgSettingsAuditRecord {
  id:              string;
  changedByUserId: string;
  changedFields:   string[];
  previousValue:   Record<string, unknown>;
  newValue:        Record<string, unknown>;
  timestamp:       string;
  createdAt:       string;
  updatedAt:       string;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

const store           = new JsonRepository<OrgSettingsRecord>('org_settings');
const auditStore      = new JsonRepository<OrgSettingsAuditRecord>('org_settings_audit');
const attendanceStore = new JsonRepository<AttendanceRecord>('attendance');

// ─── In-process event bus ────────────────────────────────────────────────────

export const orgSettingsEvents = new EventEmitter();
export const ORG_SETTINGS_UPDATED = 'ORG_SETTINGS_UPDATED';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS = {
  attendanceMode:         'WORKFORCE' as const,
  requireManagerApproval: true,
  continuousGapMinutes:   0,
  retroApprovalMode:      'MANAGER_THEN_HR' as const,
  workSchedule:           { startTime: '08:30', endTime: '17:30', flexible: false },
  lateRule:               { graceMinutes: 15 },
  earlyLeaveRule:         { graceMinutes: 5 },
  checkInWindowMinutes:   30,
  absentAfterMinutes:     0,
  photoRule:              { requireCheckInPhoto: true, requireCheckOutPhoto: false },
  locationRule:           { enabled: false, radiusMeters: 100 },
};

function getOrCreate(): OrgSettingsRecord {
  const existing = store.findOne(() => true);
  if (existing) return existing;
  return store.create({
    attendanceMode:         DEFAULTS.attendanceMode,
    requireManagerApproval: DEFAULTS.requireManagerApproval,
    continuousGapMinutes:   DEFAULTS.continuousGapMinutes,
    retroApprovalMode:      DEFAULTS.retroApprovalMode,
  } as Omit<OrgSettingsRecord, 'id' | 'createdAt' | 'updatedAt'>);
}

// ─── Response shape ───────────────────────────────────────────────────────────

function toClientShape(record: OrgSettingsRecord, isSuperAdmin: boolean) {
  return {
    mode:                   record.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'FULL',
    requireManagerApproval: record.requireManagerApproval ?? DEFAULTS.requireManagerApproval,
    continuousGapMinutes:   record.continuousGapMinutes   ?? DEFAULTS.continuousGapMinutes,
    retroApprovalMode:      record.retroApprovalMode      ?? DEFAULTS.retroApprovalMode,
    superAdminEnabled:      isSuperAdmin,
    workSchedule:           record.workSchedule           ?? DEFAULTS.workSchedule,
    lateRule:               record.lateRule               ?? DEFAULTS.lateRule,
    earlyLeaveRule:         record.earlyLeaveRule         ?? DEFAULTS.earlyLeaveRule,
    checkInWindowMinutes:   record.checkInWindowMinutes   ?? DEFAULTS.checkInWindowMinutes,
    absentAfterMinutes:     record.absentAfterMinutes     ?? DEFAULTS.absentAfterMinutes,
    photoRule:              record.photoRule              ?? DEFAULTS.photoRule,
    locationRule:           record.locationRule           ?? DEFAULTS.locationRule,
    hrReport:               { imageMode: 'ON_DEMAND' as const },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clampInt(v: number, min = 0): number {
  return Math.max(min, Math.floor(Number(v)));
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();

router.get('/', authenticate, (req, res) => {
  const record = getOrCreate();
  res.json({ success: true, data: toClientShape(record, req.user?.role === 'super_admin') });
});

router.patch('/', authenticate, requireRole(['admin', 'hr_branch']), (req, res) => {
  const record = getOrCreate();

  const body = req.body as {
    mode?:                   'FULL' | 'SIMPLE';
    requireManagerApproval?: boolean;
    continuousGapMinutes?:   number;
    retroApprovalMode?:      'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
    workSchedule?:           Partial<WorkSchedule>;
    lateRule?:               Partial<LateRule>;
    earlyLeaveRule?:         Partial<EarlyLeaveRule>;
    checkInWindowMinutes?:   number;
    absentAfterMinutes?:     number;
    photoRule?:              Partial<PhotoRule>;
    locationRule?:           Partial<LocationRule>;
  };

  // ── Build desired values ──────────────────────────────────────────────────

  const storedWorkSchedule  = record.workSchedule  ?? DEFAULTS.workSchedule;
  const storedLateRule      = record.lateRule      ?? DEFAULTS.lateRule;
  const storedEarlyRule     = record.earlyLeaveRule ?? DEFAULTS.earlyLeaveRule;
  const storedPhotoRule     = record.photoRule     ?? DEFAULTS.photoRule;
  const storedLocationRule  = record.locationRule  ?? DEFAULTS.locationRule;

  const desiredMode: 'WORKFORCE' | 'SIMPLE' =
    body.mode !== undefined
      ? body.mode === 'SIMPLE' ? 'SIMPLE' : 'WORKFORCE'
      : record.attendanceMode;

  const desiredApproval = body.requireManagerApproval !== undefined
    ? Boolean(body.requireManagerApproval)
    : record.requireManagerApproval;

  const desiredGap = body.continuousGapMinutes !== undefined
    ? clampInt(body.continuousGapMinutes)
    : (record.continuousGapMinutes ?? 0);

  const desiredRetroMode: 'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY' =
    body.retroApprovalMode !== undefined
      ? body.retroApprovalMode
      : (record.retroApprovalMode ?? 'MANAGER_THEN_HR');

  const desiredWorkSchedule: WorkSchedule = body.workSchedule
    ? { ...storedWorkSchedule, ...body.workSchedule }
    : storedWorkSchedule;

  const desiredLateRule: LateRule = body.lateRule
    ? { graceMinutes: clampInt(body.lateRule.graceMinutes ?? storedLateRule.graceMinutes) }
    : storedLateRule;

  const desiredEarlyRule: EarlyLeaveRule = body.earlyLeaveRule
    ? { graceMinutes: clampInt(body.earlyLeaveRule.graceMinutes ?? storedEarlyRule.graceMinutes) }
    : storedEarlyRule;

  const desiredCheckInWindow = body.checkInWindowMinutes !== undefined
    ? clampInt(body.checkInWindowMinutes)
    : (record.checkInWindowMinutes ?? DEFAULTS.checkInWindowMinutes);

  const desiredAbsentAfter = body.absentAfterMinutes !== undefined
    ? clampInt(body.absentAfterMinutes)
    : (record.absentAfterMinutes ?? DEFAULTS.absentAfterMinutes);

  const desiredPhotoRule: PhotoRule = body.photoRule
    ? { ...storedPhotoRule, ...body.photoRule }
    : storedPhotoRule;

  const desiredLocationRule: LocationRule = body.locationRule
    ? {
        enabled:      body.locationRule.enabled      ?? storedLocationRule.enabled,
        radiusMeters: body.locationRule.radiusMeters !== undefined
          ? Math.max(1, Number(body.locationRule.radiusMeters))
          : storedLocationRule.radiusMeters,
      }
    : storedLocationRule;

  // ── Idempotent check ─────────────────────────────────────────────────────

  const changes: Record<string, boolean> = {
    mode:                desiredMode          !== record.attendanceMode,
    requireMgr:          desiredApproval      !== record.requireManagerApproval,
    gap:                 desiredGap           !== (record.continuousGapMinutes ?? 0),
    retro:               desiredRetroMode     !== (record.retroApprovalMode ?? 'MANAGER_THEN_HR'),
    workSchedule:        !deepEq(desiredWorkSchedule,  storedWorkSchedule),
    lateRule:            !deepEq(desiredLateRule,       storedLateRule),
    earlyLeaveRule:      !deepEq(desiredEarlyRule,      storedEarlyRule),
    checkInWindow:       desiredCheckInWindow !== (record.checkInWindowMinutes ?? DEFAULTS.checkInWindowMinutes),
    absentAfter:         desiredAbsentAfter   !== (record.absentAfterMinutes   ?? DEFAULTS.absentAfterMinutes),
    photoRule:           !deepEq(desiredPhotoRule,      storedPhotoRule),
    locationRule:        !deepEq(desiredLocationRule,   storedLocationRule),
  };

  const anyChange = Object.values(changes).some(Boolean);
  if (!anyChange) {
    return res.json({ success: true, data: toClientShape(record, req.user?.role === 'super_admin') });
  }

  // ── Mode lock ─────────────────────────────────────────────────────────────

  if (changes.mode) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (attendanceStore.exists((r) => r.date.startsWith(currentMonth))) {
      return res.status(409).json({
        success: false,
        error:   'MODE_CHANGE_LOCKED',
        message: `Cannot switch attendance mode while records exist for ${currentMonth}.`,
      });
    }
  }

  // ── Build previous/new for audit ─────────────────────────────────────────

  const previousValue: Record<string, unknown> = {};
  const newValue:      Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (changes.mode)           { previousValue.attendanceMode         = record.attendanceMode;          newValue.attendanceMode         = desiredMode;          changedFields.push('attendanceMode'); }
  if (changes.requireMgr)     { previousValue.requireManagerApproval = record.requireManagerApproval;  newValue.requireManagerApproval = desiredApproval;       changedFields.push('requireManagerApproval'); }
  if (changes.gap)            { previousValue.continuousGapMinutes   = record.continuousGapMinutes;    newValue.continuousGapMinutes   = desiredGap;            changedFields.push('continuousGapMinutes'); }
  if (changes.retro)          { previousValue.retroApprovalMode      = record.retroApprovalMode;       newValue.retroApprovalMode      = desiredRetroMode;      changedFields.push('retroApprovalMode'); }
  if (changes.workSchedule)   { previousValue.workSchedule           = storedWorkSchedule;             newValue.workSchedule           = desiredWorkSchedule;   changedFields.push('workSchedule'); }
  if (changes.lateRule)       { previousValue.lateRule               = storedLateRule;                 newValue.lateRule               = desiredLateRule;       changedFields.push('lateRule'); }
  if (changes.earlyLeaveRule) { previousValue.earlyLeaveRule         = storedEarlyRule;                newValue.earlyLeaveRule         = desiredEarlyRule;      changedFields.push('earlyLeaveRule'); }
  if (changes.checkInWindow)  { previousValue.checkInWindowMinutes   = record.checkInWindowMinutes;    newValue.checkInWindowMinutes   = desiredCheckInWindow;  changedFields.push('checkInWindowMinutes'); }
  if (changes.absentAfter)    { previousValue.absentAfterMinutes     = record.absentAfterMinutes;      newValue.absentAfterMinutes     = desiredAbsentAfter;    changedFields.push('absentAfterMinutes'); }
  if (changes.photoRule)      { previousValue.photoRule              = storedPhotoRule;                newValue.photoRule              = desiredPhotoRule;      changedFields.push('photoRule'); }
  if (changes.locationRule)   { previousValue.locationRule           = storedLocationRule;             newValue.locationRule           = desiredLocationRule;   changedFields.push('locationRule'); }

  // ── Write ─────────────────────────────────────────────────────────────────

  const patch: Partial<OrgSettingsRecord> = {};
  if (changes.mode)           patch.attendanceMode         = desiredMode;
  if (changes.requireMgr)     patch.requireManagerApproval = desiredApproval;
  if (changes.gap)            patch.continuousGapMinutes   = desiredGap;
  if (changes.retro)          patch.retroApprovalMode      = desiredRetroMode;
  if (changes.workSchedule)   patch.workSchedule           = desiredWorkSchedule;
  if (changes.lateRule)       patch.lateRule               = desiredLateRule;
  if (changes.earlyLeaveRule) patch.earlyLeaveRule         = desiredEarlyRule;
  if (changes.checkInWindow)  patch.checkInWindowMinutes   = desiredCheckInWindow;
  if (changes.absentAfter)    patch.absentAfterMinutes     = desiredAbsentAfter;
  if (changes.photoRule)      patch.photoRule              = desiredPhotoRule;
  if (changes.locationRule)   patch.locationRule           = desiredLocationRule;

  const updated = store.updateById(record.id, patch) ?? record;

  // ── Auto-resolve pending_approval when disabling manager approval ─────────

  let autoResolvedCount = 0;
  if (changes.requireMgr && !desiredApproval) {
    attendanceStore.transaction((items) =>
      items.map((r) => {
        if (r.status !== 'pending_approval') return r;
        autoResolvedCount++;
        return { ...r, status: 'present' as const, approvedBy: 'SYSTEM_AUTO', updatedAt: new Date().toISOString() };
      }),
    );
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  auditStore.create({
    changedByUserId: req.user!.userId,
    changedFields,
    previousValue,
    newValue,
    timestamp: new Date().toISOString(),
  } as Omit<OrgSettingsAuditRecord, 'id' | 'createdAt' | 'updatedAt'>);

  logSettingsUpdate(
    req.user!.userId,
    changedFields,
    previousValue,
    newValue,
  );

  // ── Event ─────────────────────────────────────────────────────────────────

  orgSettingsEvents.emit(ORG_SETTINGS_UPDATED, {
    attendanceMode:         updated.attendanceMode,
    requireManagerApproval: updated.requireManagerApproval,
    continuousGapMinutes:   updated.continuousGapMinutes   ?? 0,
    retroApprovalMode:      updated.retroApprovalMode      ?? 'MANAGER_THEN_HR',
    workSchedule:           updated.workSchedule           ?? DEFAULTS.workSchedule,
    lateRule:               updated.lateRule               ?? DEFAULTS.lateRule,
    earlyLeaveRule:         updated.earlyLeaveRule         ?? DEFAULTS.earlyLeaveRule,
    checkInWindowMinutes:   updated.checkInWindowMinutes   ?? DEFAULTS.checkInWindowMinutes,
    absentAfterMinutes:     updated.absentAfterMinutes     ?? DEFAULTS.absentAfterMinutes,
    photoRule:              updated.photoRule              ?? DEFAULTS.photoRule,
    locationRule:           updated.locationRule           ?? DEFAULTS.locationRule,
    autoResolvedCount,
  });

  return res.json({
    success: true,
    data:    toClientShape(updated, req.user?.role === 'super_admin'),
    ...(autoResolvedCount > 0 && { autoResolvedCount }),
  });
});

export default router;
