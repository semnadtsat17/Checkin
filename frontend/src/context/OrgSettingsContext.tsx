/**
 * OrgSettingsContext
 *
 * Fetches per-branch settings once after the user authenticates.
 * Every component that reads feature flags calls useOrgSettings().
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  getOrgSettings,
  ORG_SETTINGS_DEFAULTS,
  type OrgSettingsConfig,
} from '../api/orgSettings';
import { useAuth } from './AuthContext';

// ─── Context shape ────────────────────────────────────────────────────────────

interface OrgSettingsContextValue extends OrgSettingsConfig {
  refetch: () => void;
}

const OrgSettingsContext = createContext<OrgSettingsContextValue>({
  ...ORG_SETTINGS_DEFAULTS,
  refetch: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OrgSettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [settings, setSettings] = useState<OrgSettingsConfig>(ORG_SETTINGS_DEFAULTS);

  const load = useCallback((branchId: string) => {
    getOrgSettings(branchId)
      .then((s) => setSettings({ ...s, superAdminEnabled: user?.role === 'super_admin' || user?.role === 'admin' }))
      .catch(() => setSettings(ORG_SETTINGS_DEFAULTS));
  }, [user?.role]);

  useEffect(() => {
    if (isAuthenticated && user?.branchId) {
      load(user.branchId);
    } else {
      setSettings(ORG_SETTINGS_DEFAULTS);
    }
  }, [isAuthenticated, user?.branchId, load]);

  return (
    <OrgSettingsContext.Provider value={{ ...settings, refetch: () => user?.branchId && load(user.branchId) }}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrgSettings(): OrgSettingsContextValue {
  return useContext(OrgSettingsContext);
}
