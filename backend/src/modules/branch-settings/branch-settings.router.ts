/**
 * branch-settings.router.ts
 *
 * Per-branch attendance configuration (replaces global org_settings).
 *
 * GET  /branch-settings/:branchId  — HR of that branch or super_admin/admin
 * PATCH /branch-settings/:branchId — HR of that branch or super_admin/admin
 *
 * All fields are optional on PATCH; only supplied fields are updated.
 * Idempotent: no write if payload matches stored values.
 */
import { Router, Request } from 'express';
import { hasHrAccess } from '../../core/permissions';
import { authenticate } from '../../shared/middleware/auth';
import { AppError } from '../../shared/middleware/errorHandler';
import {
  getEffectiveBranchSettings,
  upsertBranchSettings,
  BRANCH_SETTINGS_DEFAULTS,
} from './branchSettings.runtime';
import type { BranchSettings } from '@hospital-hr/shared';

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

function assertHrOrAbove(req: Request) {
  const user = req.user as { userId: string; role: string; branchId?: string } | undefined;
  if (!user) throw new AppError(401, 'Unauthenticated');
  if (!hasHrAccess(user.role as any)) throw new AppError(403, 'HR access required');
  return user;
}

// ─── GET ─────────────────────────────────────────────────────────────────────

router.get('/:branchId', authenticate, (req, res, next) => {
  try {
    assertHrOrAbove(req);
    const settings = getEffectiveBranchSettings(req.params.branchId);
    res.json({ success: true, data: settings });
  } catch (e) { next(e); }
});

// ─── PATCH ────────────────────────────────────────────────────────────────────

type PatchBody = Partial<Omit<BranchSettings, 'id' | 'branchId' | 'createdAt' | 'updatedAt'>>;

function clampInt(v: unknown, min = 0): number {
  return Math.max(min, Math.floor(Number(v)));
}

router.patch('/:branchId', authenticate, (req, res, next) => {
  try {
    assertHrOrAbove(req);
    const branchId = req.params.branchId;
    const body     = req.body as PatchBody;

    const current = getEffectiveBranchSettings(branchId);

    const patch: PatchBody = {};

    if (body.attendanceMode !== undefined)
      patch.attendanceMode = body.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL';

    if (body.requireManagerApproval !== undefined)
      patch.requireManagerApproval = Boolean(body.requireManagerApproval);

    if (body.continuousGapMinutes !== undefined)
      patch.continuousGapMinutes = clampInt(body.continuousGapMinutes);

    if (body.retroApprovalMode !== undefined)
      patch.retroApprovalMode = body.retroApprovalMode;

    if (body.checkInWindowMinutes !== undefined)
      patch.checkInWindowMinutes = clampInt(body.checkInWindowMinutes);

    if (body.lateGraceMinutes !== undefined)
      patch.lateGraceMinutes = clampInt(body.lateGraceMinutes);

    if (body.absentAfterMinutes !== undefined)
      patch.absentAfterMinutes = clampInt(body.absentAfterMinutes);

    if (body.earlyLeaveGraceMinutes !== undefined)
      patch.earlyLeaveGraceMinutes = clampInt(body.earlyLeaveGraceMinutes);

    if (body.checkoutLateThresholdMinutes !== undefined)
      patch.checkoutLateThresholdMinutes = clampInt(body.checkoutLateThresholdMinutes);

    if (body.consecutiveShiftGapMinutes !== undefined)
      patch.consecutiveShiftGapMinutes = clampInt(body.consecutiveShiftGapMinutes);

    if (body.maxInProgressHours !== undefined)
      patch.maxInProgressHours = Math.max(1, clampInt(body.maxInProgressHours));

    if (body.locationEnabled !== undefined)
      patch.locationEnabled = Boolean(body.locationEnabled);

    if (body.requireCheckInPhoto !== undefined)
      patch.requireCheckInPhoto = Boolean(body.requireCheckInPhoto);

    if (body.requireCheckOutPhoto !== undefined)
      patch.requireCheckOutPhoto = Boolean(body.requireCheckOutPhoto);

    if (body.otEnabled !== undefined)
      patch.otEnabled = Boolean(body.otEnabled);

    if (body.otStartAfterMinutes !== undefined)
      patch.otStartAfterMinutes = clampInt(body.otStartAfterMinutes);

    if (body.otRequireApproval !== undefined)
      patch.otRequireApproval = Boolean(body.otRequireApproval);

    if (body.hrReportImageMode !== undefined)
      patch.hrReportImageMode = body.hrReportImageMode;

    // Idempotent: skip write if nothing changed
    const noChange = (Object.keys(patch) as (keyof PatchBody)[]).every(
      k => JSON.stringify((current as any)[k]) === JSON.stringify(patch[k]),
    );
    if (noChange) {
      return res.json({ success: true, data: current });
    }

    // Merge with defaults explicitly supplied before upsert
    const defaults = BRANCH_SETTINGS_DEFAULTS;
    const merged: PatchBody = {
      attendanceMode:              patch.attendanceMode              ?? current.attendanceMode              ?? defaults.attendanceMode,
      requireManagerApproval:      patch.requireManagerApproval      ?? current.requireManagerApproval      ?? defaults.requireManagerApproval,
      continuousGapMinutes:        patch.continuousGapMinutes        ?? current.continuousGapMinutes        ?? defaults.continuousGapMinutes,
      retroApprovalMode:           patch.retroApprovalMode           ?? current.retroApprovalMode           ?? defaults.retroApprovalMode,
      checkInWindowMinutes:        patch.checkInWindowMinutes        ?? current.checkInWindowMinutes        ?? defaults.checkInWindowMinutes,
      lateGraceMinutes:            patch.lateGraceMinutes            ?? current.lateGraceMinutes            ?? defaults.lateGraceMinutes,
      absentAfterMinutes:          patch.absentAfterMinutes          ?? current.absentAfterMinutes          ?? defaults.absentAfterMinutes,
      earlyLeaveGraceMinutes:      patch.earlyLeaveGraceMinutes      ?? current.earlyLeaveGraceMinutes      ?? defaults.earlyLeaveGraceMinutes,
      checkoutLateThresholdMinutes: patch.checkoutLateThresholdMinutes ?? current.checkoutLateThresholdMinutes ?? defaults.checkoutLateThresholdMinutes,
      consecutiveShiftGapMinutes:  patch.consecutiveShiftGapMinutes  ?? current.consecutiveShiftGapMinutes  ?? defaults.consecutiveShiftGapMinutes,
      maxInProgressHours:          patch.maxInProgressHours          ?? current.maxInProgressHours          ?? defaults.maxInProgressHours,
      locationEnabled:             patch.locationEnabled             ?? current.locationEnabled             ?? defaults.locationEnabled,
      requireCheckInPhoto:         patch.requireCheckInPhoto         ?? current.requireCheckInPhoto         ?? defaults.requireCheckInPhoto,
      requireCheckOutPhoto:        patch.requireCheckOutPhoto        ?? current.requireCheckOutPhoto        ?? defaults.requireCheckOutPhoto,
      otEnabled:                   patch.otEnabled                   ?? current.otEnabled                   ?? defaults.otEnabled,
      otStartAfterMinutes:         patch.otStartAfterMinutes         ?? current.otStartAfterMinutes         ?? defaults.otStartAfterMinutes,
      otRequireApproval:           patch.otRequireApproval           ?? current.otRequireApproval           ?? defaults.otRequireApproval,
      hrReportImageMode:           patch.hrReportImageMode           ?? current.hrReportImageMode           ?? defaults.hrReportImageMode,
    };

    const updated = upsertBranchSettings(branchId, merged);
    return res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

export default router;
