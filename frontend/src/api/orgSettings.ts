import { apiFetch } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgSettingsConfig {
  /** FULL = WORKFORCE mode (schedules, OT, approvals all active).
   *  SIMPLE = check-in/out only, no schedule or OT enforcement. */
  mode:                   'FULL' | 'SIMPLE';
  /** When true, unscheduled check-ins surface as pending_approval for manager. */
  requireManagerApproval: boolean;
  /** True only when the authenticated user's role is super_admin. */
  superAdminEnabled:      boolean;
  /** Always ON_DEMAND — evidence photos never load in list views. */
  hrReportImageMode:      'ON_DEMAND';
}

// ─── Safe fallback ───────────────────────────────────────────────────────────
//
// Matches existing production behavior exactly:
//   mode FULL          → schedule / OT / approval logic unchanged
//   requireManager true → pending_approval flow unchanged
//   superAdmin false    → no extra controls shown (safe default)

export const ORG_SETTINGS_DEFAULTS: OrgSettingsConfig = {
  mode:                   'FULL',
  requireManagerApproval: true,
  superAdminEnabled:      false,
  hrReportImageMode:      'ON_DEMAND',
};

// ─── API calls ────────────────────────────────────────────────────────────────

export function getOrgSettings(): Promise<OrgSettingsConfig> {
  return apiFetch<OrgSettingsConfig>('/api/org-settings');
}

export function updateOrgSettings(
  patch: Partial<Pick<OrgSettingsConfig, 'mode' | 'requireManagerApproval'>>,
): Promise<OrgSettingsConfig> {
  return apiFetch<OrgSettingsConfig>('/api/org-settings', {
    method: 'PATCH',
    body:   JSON.stringify(patch),
  });
}
