import { apiFetch } from './client';
import type { BranchSettings } from '@hospital-hr/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgSettingsConfig {
  /** NORMAL = schedule/OT/approvals. SIMPLE = check-in/out only. */
  mode:                   'NORMAL' | 'SIMPLE';
  requireManagerApproval: boolean;
  superAdminEnabled:      boolean;
  hrReportImageMode:      'ALWAYS' | 'ON_DEMAND' | 'OFF';
}

// ─── Safe fallback ────────────────────────────────────────────────────────────

export const ORG_SETTINGS_DEFAULTS: OrgSettingsConfig = {
  mode:                   'NORMAL',
  requireManagerApproval: true,
  superAdminEnabled:      false,
  hrReportImageMode:      'ON_DEMAND',
};

// ─── API calls ────────────────────────────────────────────────────────────────

export async function getOrgSettings(branchId: string): Promise<OrgSettingsConfig> {
  const bs = await apiFetch<BranchSettings>(`/api/branch-settings/${branchId}`);
  return {
    mode:                   bs.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL',
    requireManagerApproval: bs.requireManagerApproval,
    superAdminEnabled:      false,   // derived from role in auth context
    hrReportImageMode:      bs.hrReportImageMode,
  };
}

export async function updateOrgSettings(
  branchId: string,
  patch: Partial<Pick<OrgSettingsConfig, 'mode' | 'requireManagerApproval'>>,
): Promise<OrgSettingsConfig> {
  const bsPatch: Partial<BranchSettings> = {};
  if (patch.mode !== undefined) bsPatch.attendanceMode = patch.mode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL';
  if (patch.requireManagerApproval !== undefined) bsPatch.requireManagerApproval = patch.requireManagerApproval;

  const bs = await apiFetch<BranchSettings>(`/api/branch-settings/${branchId}`, {
    method: 'PATCH',
    body:   JSON.stringify(bsPatch),
  });
  return {
    mode:                   bs.attendanceMode === 'SIMPLE' ? 'SIMPLE' : 'NORMAL',
    requireManagerApproval: bs.requireManagerApproval,
    superAdminEnabled:      false,
    hrReportImageMode:      bs.hrReportImageMode,
  };
}
