/**
 * hrSettings.ts
 *
 * API layer for the full AttendanceSettings shape.
 *
 * The backend GET /org-settings currently returns a subset of these fields.
 * This module merges the response with safe defaults so the HR Settings page
 * always has a complete, typed object to work with — and remains forward-
 * compatible when the backend is extended to persist the remaining fields.
 *
 * PATCH sends only the fields that actually changed (partial update).
 */
import { apiFetch } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttendanceSettings {
  mode: 'SIMPLE' | 'FULL';

  requireManagerApproval: boolean;

  /**
   * Maximum gap (minutes) between adjacent work segments that the Snap Time
   * Engine will still merge into one window.  0 = touching-only merge.
   */
  continuousGapMinutes: number;

  /**
   * Approval chain for RETROACTIVE_CHECKIN requests.
   *   HR_ONLY         — HR approves directly; no manager step.
   *   MANAGER_THEN_HR — Manager approves first, then HR (default).
   *   MANAGER_ONLY    — Manager approves; no HR step required.
   */
  retroApprovalMode: 'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';

  workSchedule: {
    startTime: string;   // HH:mm
    endTime:   string;   // HH:mm
    flexible:  boolean;
  };

  lateRule: {
    graceMinutes: number;
  };

  earlyLeaveRule: {
    graceMinutes: number;
  };

  otRule: {
    enabled:           boolean;
    startAfterMinutes: number;
    requireApproval:   boolean;
  };

  locationRule: {
    enabled:      boolean;
    radiusMeters: number;
  };

  photoRule: {
    requireCheckInPhoto:  boolean;
    requireCheckOutPhoto: boolean;
  };

  hrReport: {
    imageMode: 'ALWAYS' | 'ON_DEMAND' | 'OFF';
  };
}

/** Partial at every depth — mirrors the PATCH contract. */
export type AttendanceSettingsPatch = Partial<{
  mode:                   AttendanceSettings['mode'];
  requireManagerApproval: boolean;
  continuousGapMinutes:   number;
  retroApprovalMode:      AttendanceSettings['retroApprovalMode'];
  workSchedule:           Partial<AttendanceSettings['workSchedule']>;
  lateRule:               Partial<AttendanceSettings['lateRule']>;
  earlyLeaveRule:         Partial<AttendanceSettings['earlyLeaveRule']>;
  otRule:                 Partial<AttendanceSettings['otRule']>;
  locationRule:           Partial<AttendanceSettings['locationRule']>;
  photoRule:              Partial<AttendanceSettings['photoRule']>;
  hrReport:               Partial<AttendanceSettings['hrReport']>;
}>;

// ─── Safe defaults ────────────────────────────────────────────────────────────
// Applied for any fields not yet stored by the backend.
// Values match the business-logic constants used in Phase 1–3 utilities.

export const SETTINGS_DEFAULTS: AttendanceSettings = {
  mode:                   'FULL',
  requireManagerApproval: true,
  continuousGapMinutes:   0,
  retroApprovalMode:      'MANAGER_THEN_HR',

  workSchedule: {
    startTime: '08:30',
    endTime:   '17:30',
    flexible:  false,
  },

  lateRule:      { graceMinutes: 15 },
  earlyLeaveRule: { graceMinutes: 5 },

  otRule: {
    enabled:           false,
    startAfterMinutes: 30,
    requireApproval:   true,
  },

  locationRule: {
    enabled:      false,
    radiusMeters: 100,
  },

  photoRule: {
    requireCheckInPhoto:  false,
    requireCheckOutPhoto: false,
  },

  hrReport: { imageMode: 'ON_DEMAND' },
};

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Fetches org settings and merges with SETTINGS_DEFAULTS.
 * The merge is shallow-per-section: the backend response wins for any field it
 * returns; defaults fill in the rest. This keeps the page fully functional even
 * before the backend is extended to persist every field.
 */
export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const raw = await apiFetch<Partial<AttendanceSettings>>('/api/org-settings');

  return {
    ...SETTINGS_DEFAULTS,
    ...raw,
    workSchedule: { ...SETTINGS_DEFAULTS.workSchedule, ...raw.workSchedule },
    lateRule:      { ...SETTINGS_DEFAULTS.lateRule,      ...raw.lateRule      },
    earlyLeaveRule: { ...SETTINGS_DEFAULTS.earlyLeaveRule, ...raw.earlyLeaveRule },
    otRule:        { ...SETTINGS_DEFAULTS.otRule,        ...raw.otRule        },
    locationRule:  { ...SETTINGS_DEFAULTS.locationRule,  ...raw.locationRule  },
    photoRule:     { ...SETTINGS_DEFAULTS.photoRule,     ...raw.photoRule     },
    hrReport:      { ...SETTINGS_DEFAULTS.hrReport,      ...raw.hrReport      },
  };
}

/**
 * Sends a partial update.  Only the changed top-level sections are included.
 */
export async function patchAttendanceSettings(
  patch: AttendanceSettingsPatch,
): Promise<AttendanceSettings> {
  const raw = await apiFetch<Partial<AttendanceSettings>>('/api/org-settings', {
    method: 'PATCH',
    body:   JSON.stringify(patch),
  });

  return {
    ...SETTINGS_DEFAULTS,
    ...raw,
    workSchedule:  { ...SETTINGS_DEFAULTS.workSchedule,  ...raw.workSchedule  },
    lateRule:       { ...SETTINGS_DEFAULTS.lateRule,       ...raw.lateRule       },
    earlyLeaveRule: { ...SETTINGS_DEFAULTS.earlyLeaveRule, ...raw.earlyLeaveRule },
    otRule:         { ...SETTINGS_DEFAULTS.otRule,         ...raw.otRule         },
    locationRule:   { ...SETTINGS_DEFAULTS.locationRule,   ...raw.locationRule   },
    photoRule:      { ...SETTINGS_DEFAULTS.photoRule,      ...raw.photoRule      },
    hrReport:       { ...SETTINGS_DEFAULTS.hrReport,       ...raw.hrReport       },
  };
}

// ─── Diff helper ──────────────────────────────────────────────────────────────

/**
 * Compares two settings objects and returns a patch containing only the
 * top-level sections (or primitives) that have actually changed.
 * Uses JSON.stringify for deep equality — adequate for this data shape.
 */
export function diffSettings(
  original: AttendanceSettings,
  current:  AttendanceSettings,
): AttendanceSettingsPatch {
  const patch: AttendanceSettingsPatch = {};

  const keys = Object.keys(original) as (keyof AttendanceSettings)[];
  for (const key of keys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(current[key])) {
      // Type assertion is safe: key is a keyof AttendanceSettings
      (patch as Record<string, unknown>)[key] = current[key];
    }
  }

  return patch;
}
