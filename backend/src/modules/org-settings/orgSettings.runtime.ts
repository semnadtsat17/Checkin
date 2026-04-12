/**
 * orgSettings.runtime.ts
 *
 * In-memory cache for the organisation-wide attendance mode.
 * Loaded once at module init from the JSON store, then kept live by
 * subscribing to the ORG_SETTINGS_UPDATED event emitted by the PATCH handler.
 *
 * WHY a separate cache instead of reading org_settings.json per request:
 *   • Check-in and check-out are hot paths called on every clock-in.
 *   • The mode rarely changes (O(1/month)), so a file read per request
 *     is pure waste.
 *   • The EventEmitter update is synchronous — the cache is updated
 *     atomically before the PATCH response returns to the client.
 *
 * No imports from attendance or schedule modules — zero circular risk.
 */
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { orgSettingsEvents, ORG_SETTINGS_UPDATED } from './org-settings.router';

// ─── Minimal stored-record shape (mirrors org-settings.router.ts) ─────────────

interface OrgSettingsRecord {
  id:                     string;
  attendanceMode:         'WORKFORCE' | 'SIMPLE';
  requireManagerApproval: boolean;
  continuousGapMinutes?:  number;
  retroApprovalMode?:     'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
  createdAt:              string;
  updatedAt:              string;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

/**
 * Single source of truth for the current attendance mode.
 * Default: 'WORKFORCE' — matches the seed default in org-settings.router.ts
 * so behaviour is unchanged on a cold deploy with no org_settings.json.
 */
let _cachedMode: 'WORKFORCE' | 'SIMPLE' = 'WORKFORCE';

/**
 * Maximum gap (minutes) between adjacent work segments that the Snap Time Engine
 * will still merge into a single window.  0 = only touching segments merge.
 * Default: 0 — matches the seed default.
 */
let _cachedContinuousGapMinutes: number = 0;

/**
 * Approval chain for RETROACTIVE_CHECKIN requests.
 * Default: 'MANAGER_THEN_HR' — matches the seed default.
 */
let _cachedRetroApprovalMode: 'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY' = 'MANAGER_THEN_HR';

// ─── Initialisation ───────────────────────────────────────────────────────────

const _store = new JsonRepository<OrgSettingsRecord>('org_settings');

/** Read the stored values once at module load (synchronous JSON read). */
function _loadFromDisk(): void {
  const record = _store.findOne(() => true);
  if (!record) return;
  _cachedMode                = record.attendanceMode;
  _cachedContinuousGapMinutes = record.continuousGapMinutes ?? 0;
  _cachedRetroApprovalMode   = record.retroApprovalMode    ?? 'MANAGER_THEN_HR';
}

_loadFromDisk();

// ─── Live update via EventEmitter ─────────────────────────────────────────────

/**
 * The PATCH /org-settings handler emits this event AFTER the write succeeds.
 * Updating here means the very next check-in sees the new settings — no restart.
 */
orgSettingsEvents.on(
  ORG_SETTINGS_UPDATED,
  (payload: {
    attendanceMode:         'WORKFORCE' | 'SIMPLE';
    requireManagerApproval: boolean;
    continuousGapMinutes?:  number;
    retroApprovalMode?:     'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
    autoResolvedCount?:     number;
  }) => {
    if (payload?.attendanceMode) {
      _cachedMode = payload.attendanceMode;
    }
    if (payload?.continuousGapMinutes !== undefined) {
      _cachedContinuousGapMinutes = payload.continuousGapMinutes;
    }
    if (payload?.retroApprovalMode) {
      _cachedRetroApprovalMode = payload.retroApprovalMode;
    }
  },
);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the current organisation attendance mode.
 * 'WORKFORCE' is normalised to 'NORMAL' so callers never see the internal
 * stored name.
 */
export function getOrgMode(): 'NORMAL' | 'SIMPLE' {
  return _cachedMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL';
}

/** Convenience predicate — true when the org is running in SIMPLE mode. */
export function isSimpleMode(): boolean {
  return _cachedMode === 'SIMPLE';
}

/**
 * Returns the maximum gap (minutes) that the Snap Time Engine uses when
 * deciding whether to merge adjacent work segments.  0 = touching-only merge.
 */
export function getContinuousGapMinutes(): number {
  return _cachedContinuousGapMinutes;
}

/**
 * Returns the approval chain mode for RETROACTIVE_CHECKIN requests.
 *   HR_ONLY          — HR approves directly; no manager step.
 *   MANAGER_THEN_HR  — Manager approves first, then HR (default).
 *   MANAGER_ONLY     — Manager approves; no HR step required.
 */
export function getRetroApprovalMode(): 'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY' {
  return _cachedRetroApprovalMode;
}
