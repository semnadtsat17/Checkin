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

// ─── Initialisation ───────────────────────────────────────────────────────────

const _store = new JsonRepository<OrgSettingsRecord>('org_settings');

/** Read the stored value once at module load (synchronous JSON read). */
function _loadFromDisk(): void {
  const record = _store.findOne(() => true);
  if (record) _cachedMode = record.attendanceMode;
}

_loadFromDisk();

// ─── Live update via EventEmitter ─────────────────────────────────────────────

/**
 * The PATCH /org-settings handler emits this event AFTER the write succeeds.
 * Updating here means the very next check-in sees the new mode — no restart.
 */
orgSettingsEvents.on(
  ORG_SETTINGS_UPDATED,
  (payload: { attendanceMode: 'WORKFORCE' | 'SIMPLE' }) => {
    if (payload?.attendanceMode) {
      _cachedMode = payload.attendanceMode;
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
