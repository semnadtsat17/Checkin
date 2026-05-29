/**
 * hrSettings.ts
 *
 * API layer for per-branch attendance settings.
 * Maps between the flat BranchSettings wire format and the nested
 * AttendanceSettings shape used by HRSettings.tsx.
 */
import { apiFetch } from './client';
import type { BranchSettings } from '@hospital-hr/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttendanceSettings {
  mode: 'SIMPLE' | 'NORMAL';

  requireManagerApproval: boolean;
  continuousGapMinutes:   number;
  retroApprovalMode:      'HR_ONLY' | 'MANAGER_THEN_HR' | 'MANAGER_ONLY';

  lateRule:      { graceMinutes: number };
  earlyLeaveRule: { graceMinutes: number };

  /** Minutes before shift start an employee may check in. 0 = no restriction. */
  checkInWindowMinutes: number;

  /** Minutes after shift start after which check-in is blocked. 0 = disabled. */
  absentAfterMinutes: number;

  otRule: {
    enabled:           boolean;
    startAfterMinutes: number;
    requireApproval:   boolean;
  };

  locationRule: {
    enabled: boolean;
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
  lateRule:               Partial<AttendanceSettings['lateRule']>;
  earlyLeaveRule:         Partial<AttendanceSettings['earlyLeaveRule']>;
  checkInWindowMinutes:   number;
  absentAfterMinutes:     number;
  otRule:                 Partial<AttendanceSettings['otRule']>;
  locationRule:           Partial<AttendanceSettings['locationRule']>;
  photoRule:              Partial<AttendanceSettings['photoRule']>;
  hrReport:               Partial<AttendanceSettings['hrReport']>;
}>;

// ─── Safe defaults ────────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: AttendanceSettings = {
  mode:                   'NORMAL',
  requireManagerApproval: true,
  continuousGapMinutes:   0,
  retroApprovalMode:      'MANAGER_THEN_HR',

  lateRule:      { graceMinutes: 15 },
  earlyLeaveRule: { graceMinutes: 5 },

  checkInWindowMinutes: 30,
  absentAfterMinutes:   0,

  otRule: {
    enabled:           false,
    startAfterMinutes: 30,
    requireApproval:   true,
  },

  locationRule: { enabled: false },

  photoRule: {
    requireCheckInPhoto:  true,
    requireCheckOutPhoto: false,
  },

  hrReport: { imageMode: 'ON_DEMAND' },
};

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function fromBranchSettings(bs: BranchSettings): AttendanceSettings {
  return {
    mode:                   bs.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL',
    requireManagerApproval: bs.requireManagerApproval,
    continuousGapMinutes:   bs.continuousGapMinutes,
    retroApprovalMode:      bs.retroApprovalMode,
    lateRule:               { graceMinutes: bs.lateGraceMinutes },
    earlyLeaveRule:         { graceMinutes: bs.earlyLeaveGraceMinutes },
    checkInWindowMinutes:   bs.checkInWindowMinutes,
    absentAfterMinutes:     bs.absentAfterMinutes,
    otRule: {
      enabled:           bs.otEnabled,
      startAfterMinutes: bs.otStartAfterMinutes,
      requireApproval:   bs.otRequireApproval,
    },
    locationRule: { enabled: bs.locationEnabled },
    photoRule: {
      requireCheckInPhoto:  bs.requireCheckInPhoto,
      requireCheckOutPhoto: bs.requireCheckOutPhoto,
    },
    hrReport: { imageMode: bs.hrReportImageMode },
  };
}

function toBranchSettingsPatch(patch: AttendanceSettingsPatch): Partial<BranchSettings> {
  const out: Partial<BranchSettings> = {};
  if (patch.mode !== undefined)                  out.attendanceMode          = patch.mode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL';
  if (patch.requireManagerApproval !== undefined) out.requireManagerApproval = patch.requireManagerApproval;
  if (patch.continuousGapMinutes   !== undefined) out.continuousGapMinutes   = patch.continuousGapMinutes;
  if (patch.retroApprovalMode      !== undefined) out.retroApprovalMode      = patch.retroApprovalMode;
  if (patch.lateRule?.graceMinutes  !== undefined) out.lateGraceMinutes      = patch.lateRule.graceMinutes;
  if (patch.earlyLeaveRule?.graceMinutes !== undefined) out.earlyLeaveGraceMinutes = patch.earlyLeaveRule.graceMinutes;
  if (patch.checkInWindowMinutes   !== undefined) out.checkInWindowMinutes   = patch.checkInWindowMinutes;
  if (patch.absentAfterMinutes     !== undefined) out.absentAfterMinutes     = patch.absentAfterMinutes;
  if (patch.otRule?.enabled           !== undefined) out.otEnabled           = patch.otRule.enabled;
  if (patch.otRule?.startAfterMinutes !== undefined) out.otStartAfterMinutes = patch.otRule.startAfterMinutes;
  if (patch.otRule?.requireApproval   !== undefined) out.otRequireApproval   = patch.otRule.requireApproval;
  if (patch.locationRule?.enabled     !== undefined) out.locationEnabled     = patch.locationRule.enabled;
  if (patch.photoRule?.requireCheckInPhoto  !== undefined) out.requireCheckInPhoto  = patch.photoRule.requireCheckInPhoto;
  if (patch.photoRule?.requireCheckOutPhoto !== undefined) out.requireCheckOutPhoto = patch.photoRule.requireCheckOutPhoto;
  if (patch.hrReport?.imageMode       !== undefined) out.hrReportImageMode   = patch.hrReport.imageMode;
  return out;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getAttendanceSettings(branchId: string): Promise<AttendanceSettings> {
  const bs = await apiFetch<BranchSettings>(`/api/branch-settings/${branchId}`);
  return fromBranchSettings(bs);
}

export async function patchAttendanceSettings(
  branchId: string,
  patch:    AttendanceSettingsPatch,
): Promise<AttendanceSettings> {
  const bsPatch = toBranchSettingsPatch(patch);
  const bs = await apiFetch<BranchSettings>(`/api/branch-settings/${branchId}`, {
    method: 'PATCH',
    body:   JSON.stringify(bsPatch),
  });
  return fromBranchSettings(bs);
}

// ─── Diff helper ──────────────────────────────────────────────────────────────

export function diffSettings(
  original: AttendanceSettings,
  current:  AttendanceSettings,
): AttendanceSettingsPatch {
  const patch: AttendanceSettingsPatch = {};

  const keys = Object.keys(original) as (keyof AttendanceSettings)[];
  for (const key of keys) {
    if (JSON.stringify(original[key]) !== JSON.stringify(current[key])) {
      (patch as Record<string, unknown>)[key] = current[key];
    }
  }

  return patch;
}
