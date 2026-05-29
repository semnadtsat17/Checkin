/**
 * orgSettings.runtime.ts
 *
 * In-memory cache for all organisation-wide attendance settings.
 * Loaded once at module init from the JSON store, then kept live by
 * subscribing to the ORG_SETTINGS_UPDATED event emitted by the PATCH handler.
 */
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { orgSettingsEvents, ORG_SETTINGS_UPDATED } from './org-settings.router';

// ─── Stored-record shape ──────────────────────────────────────────────────────

interface OrgSettingsRecord {
  id:                      string;
  attendanceMode:          'WORKFORCE' | 'SIMPLE';
  requireManagerApproval:  boolean;
  continuousGapMinutes?:   number;
  retroApprovalMode?:      'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
  workSchedule?:           { startTime: string; endTime: string; flexible: boolean };
  lateRule?:               { graceMinutes: number };
  earlyLeaveRule?:         { graceMinutes: number };
  checkInWindowMinutes?:   number;
  absentAfterMinutes?:     number;
  photoRule?:              { requireCheckInPhoto: boolean; requireCheckOutPhoto: boolean };
  locationRule?:           { enabled: boolean; radiusMeters: number };
  createdAt:               string;
  updatedAt:               string;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

let _cachedMode:                    'WORKFORCE' | 'SIMPLE' = 'WORKFORCE';
let _cachedRequireManagerApproval:  boolean = true;
let _cachedContinuousGapMinutes:    number  = 0;
let _cachedRetroApprovalMode:       'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY' = 'MANAGER_THEN_HR';

// Attendance condition settings
let _cachedWorkSchedule:            { startTime: string; endTime: string; flexible: boolean } =
  { startTime: '08:30', endTime: '17:30', flexible: false };
let _cachedLateGraceMinutes:        number  = 15;
let _cachedEarlyLeaveGraceMinutes:  number  = 5;
let _cachedCheckInWindowMinutes:    number  = 30;   // 0 = no early-check-in restriction
let _cachedAbsentAfterMinutes:      number  = 0;    // 0 = feature disabled
let _cachedRequireCheckInPhoto:     boolean = true;
let _cachedRequireCheckOutPhoto:    boolean = false;
let _cachedLocationEnabled:         boolean = false;
let _cachedLocationRadiusMeters:    number  = 100;

// ─── Initialisation ───────────────────────────────────────────────────────────

const _store = new JsonRepository<OrgSettingsRecord>('org_settings');

function _loadFromDisk(): void {
  const record = _store.findOne(() => true);
  if (!record) return;

  _cachedMode                   = record.attendanceMode;
  _cachedRequireManagerApproval = record.requireManagerApproval ?? true;
  _cachedContinuousGapMinutes   = record.continuousGapMinutes   ?? 0;
  _cachedRetroApprovalMode      = record.retroApprovalMode      ?? 'MANAGER_THEN_HR';

  if (record.workSchedule) {
    _cachedWorkSchedule           = record.workSchedule;
  }
  if (record.lateRule) {
    _cachedLateGraceMinutes       = record.lateRule.graceMinutes;
  }
  if (record.earlyLeaveRule) {
    _cachedEarlyLeaveGraceMinutes = record.earlyLeaveRule.graceMinutes;
  }
  if (record.checkInWindowMinutes !== undefined) {
    _cachedCheckInWindowMinutes   = record.checkInWindowMinutes;
  }
  if (record.absentAfterMinutes !== undefined) {
    _cachedAbsentAfterMinutes     = record.absentAfterMinutes;
  }
  if (record.photoRule) {
    _cachedRequireCheckInPhoto    = record.photoRule.requireCheckInPhoto;
    _cachedRequireCheckOutPhoto   = record.photoRule.requireCheckOutPhoto;
  }
  if (record.locationRule) {
    _cachedLocationEnabled        = record.locationRule.enabled;
    _cachedLocationRadiusMeters   = record.locationRule.radiusMeters;
  }
}

_loadFromDisk();

// ─── Live update via EventEmitter ─────────────────────────────────────────────

orgSettingsEvents.on(ORG_SETTINGS_UPDATED, (payload: {
  attendanceMode:         'WORKFORCE' | 'SIMPLE';
  requireManagerApproval: boolean;
  continuousGapMinutes?:  number;
  retroApprovalMode?:     'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';
  workSchedule?:          { startTime: string; endTime: string; flexible: boolean };
  lateRule?:              { graceMinutes: number };
  earlyLeaveRule?:        { graceMinutes: number };
  checkInWindowMinutes?:  number;
  absentAfterMinutes?:    number;
  photoRule?:             { requireCheckInPhoto: boolean; requireCheckOutPhoto: boolean };
  locationRule?:          { enabled: boolean; radiusMeters: number };
}) => {
  if (payload.attendanceMode)              _cachedMode                   = payload.attendanceMode;
  if (payload.requireManagerApproval !== undefined) _cachedRequireManagerApproval = payload.requireManagerApproval;
  if (payload.continuousGapMinutes  !== undefined)  _cachedContinuousGapMinutes   = payload.continuousGapMinutes;
  if (payload.retroApprovalMode)           _cachedRetroApprovalMode      = payload.retroApprovalMode;
  if (payload.workSchedule)               _cachedWorkSchedule           = payload.workSchedule;
  if (payload.lateRule)                   _cachedLateGraceMinutes       = payload.lateRule.graceMinutes;
  if (payload.earlyLeaveRule)             _cachedEarlyLeaveGraceMinutes = payload.earlyLeaveRule.graceMinutes;
  if (payload.checkInWindowMinutes !== undefined) _cachedCheckInWindowMinutes  = payload.checkInWindowMinutes;
  if (payload.absentAfterMinutes   !== undefined) _cachedAbsentAfterMinutes    = payload.absentAfterMinutes;
  if (payload.photoRule) {
    _cachedRequireCheckInPhoto  = payload.photoRule.requireCheckInPhoto;
    _cachedRequireCheckOutPhoto = payload.photoRule.requireCheckOutPhoto;
  }
  if (payload.locationRule) {
    _cachedLocationEnabled      = payload.locationRule.enabled;
    _cachedLocationRadiusMeters = payload.locationRule.radiusMeters;
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

export function getOrgMode(): 'NORMAL' | 'SIMPLE' {
  return _cachedMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL';
}

export function isSimpleMode(): boolean {
  return _cachedMode === 'SIMPLE';
}

export function getRequireManagerApproval(): boolean {
  return _cachedRequireManagerApproval;
}

export function getContinuousGapMinutes(): number {
  return _cachedContinuousGapMinutes;
}

export function getRetroApprovalMode(): 'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY' {
  return _cachedRetroApprovalMode;
}

/** Default work schedule (used when no individual shift is assigned). */
export function getWorkSchedule(): { startTime: string; endTime: string; flexible: boolean } {
  return _cachedWorkSchedule;
}

/** Minutes after shift start before check-in is considered late. */
export function getLateGraceMinutes(): number {
  return _cachedLateGraceMinutes;
}

/** Minutes before shift end before check-out is considered early leave. */
export function getEarlyLeaveGraceMinutes(): number {
  return _cachedEarlyLeaveGraceMinutes;
}

/**
 * How many minutes before shift start an employee may check in.
 * 0 = no restriction (can check in any time before shift).
 */
export function getCheckInWindowMinutes(): number {
  return _cachedCheckInWindowMinutes;
}

/**
 * Minutes after shift start after which check-in is blocked.
 * 0 = feature disabled (no upper check-in limit).
 */
export function getAbsentAfterMinutes(): number {
  return _cachedAbsentAfterMinutes;
}

/** True when a check-in photo is required. */
export function getRequireCheckInPhoto(): boolean {
  return _cachedRequireCheckInPhoto;
}

/** True when a check-out photo is required. */
export function getRequireCheckOutPhoto(): boolean {
  return _cachedRequireCheckOutPhoto;
}

/** True when org-wide GPS location enforcement is enabled. */
export function getLocationEnabled(): boolean {
  return _cachedLocationEnabled;
}

/** Org-wide GPS fence radius in metres (used when locationEnabled = true). */
export function getLocationRadiusMeters(): number {
  return _cachedLocationRadiusMeters;
}
