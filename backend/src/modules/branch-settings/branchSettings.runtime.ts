/**
 * branchSettings.runtime.ts
 *
 * Per-branch settings cache.  Loaded from disk once; kept live by the
 * BRANCH_SETTINGS_UPDATED event emitted after every PATCH.
 *
 * Callers always pass branchId so the right settings are returned.
 * Falls back to built-in defaults when no record exists for a branch.
 */
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { BranchSettings } from '@hospital-hr/shared';

export const BRANCH_SETTINGS_UPDATED = 'BRANCH_SETTINGS_UPDATED';

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const BRANCH_SETTINGS_DEFAULTS: Omit<BranchSettings, 'id' | 'branchId' | 'createdAt' | 'updatedAt'> = {
  attendanceMode:              'NORMAL',
  requireManagerApproval:      true,
  continuousGapMinutes:        0,
  retroApprovalMode:           'MANAGER_THEN_HR',
  checkInWindowMinutes:        30,
  lateGraceMinutes:            15,
  absentAfterMinutes:          0,
  earlyLeaveGraceMinutes:      5,
  checkoutLateThresholdMinutes: 0,
  consecutiveShiftGapMinutes:  60,
  maxInProgressHours:          24,
  locationEnabled:             false,
  requireCheckInPhoto:         true,
  requireCheckOutPhoto:        false,
  otEnabled:                   false,
  otStartAfterMinutes:         30,
  otRequireApproval:           true,
  hrReportImageMode:           'ON_DEMAND',
};

// ─── Store ────────────────────────────────────────────────────────────────────

const store = new JsonRepository<BranchSettings>('branch_settings');

// ─── In-memory cache  (branchId → record) ────────────────────────────────────

const _cache = new Map<string, BranchSettings>();

function _loadAll(): void {
  _cache.clear();
  store.findAll().forEach(s => _cache.set(s.branchId, s));
}

_loadAll();

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Returns the stored record for this branch, or undefined if none exists yet. */
export function getBranchSettingsRecord(branchId: string): BranchSettings | undefined {
  return _cache.get(branchId);
}

/**
 * Returns effective settings for a branch — stored values merged with
 * defaults so callers never need null-guards.
 */
export function getEffectiveBranchSettings(branchId: string): BranchSettings & typeof BRANCH_SETTINGS_DEFAULTS {
  const stored = _cache.get(branchId);
  if (!stored) {
    return {
      ...BRANCH_SETTINGS_DEFAULTS,
      id:        '',
      branchId,
      createdAt: '',
      updatedAt: '',
    };
  }
  return { ...BRANCH_SETTINGS_DEFAULTS, ...stored };
}

/** Create or replace settings for a branch. */
export function upsertBranchSettings(
  branchId: string,
  patch: Partial<Omit<BranchSettings, 'id' | 'branchId' | 'createdAt' | 'updatedAt'>>,
): BranchSettings {
  const existing = _cache.get(branchId);

  let updated: BranchSettings;
  if (existing) {
    updated = store.updateById(existing.id, patch) ?? existing;
  } else {
    updated = store.create({
      branchId,
      ...BRANCH_SETTINGS_DEFAULTS,
      ...patch,
    } as Omit<BranchSettings, 'id' | 'createdAt' | 'updatedAt'>);
  }

  _cache.set(branchId, updated);
  return updated;
}

/** Called by the router after a write so other modules can react. */
export function invalidateBranchCache(branchId: string): void {
  const fresh = store.findOne(s => s.branchId === branchId);
  if (fresh) _cache.set(branchId, fresh);
  else _cache.delete(branchId);
}
