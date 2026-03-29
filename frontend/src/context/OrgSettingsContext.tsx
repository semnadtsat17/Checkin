/**
 * OrgSettingsContext
 *
 * Fetches /org-settings ONCE after the user authenticates.
 * Every component that reads feature flags calls useOrgSettings() —
 * no repeated requests, no prop-drilling.
 *
 * The context value also exposes `refetch()` so the super-admin panel
 * can invalidate after a PATCH without reloading the page.
 *
 * Fallback behavior:
 *   If the API call fails (network error, 5xx), ORG_SETTINGS_DEFAULTS
 *   is used. Defaults are identical to current production behavior,
 *   so a failed fetch is invisible to regular users.
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
  /** Re-fetch settings from the server (call after a PATCH /org-settings). */
  refetch: () => void;
}

const OrgSettingsContext = createContext<OrgSettingsContextValue>({
  ...ORG_SETTINGS_DEFAULTS,
  refetch: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function OrgSettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<OrgSettingsConfig>(ORG_SETTINGS_DEFAULTS);

  const load = useCallback(() => {
    getOrgSettings()
      .then(setSettings)
      .catch(() => setSettings(ORG_SETTINGS_DEFAULTS));
  }, []);

  // Fetch when user authenticates; reset to defaults on logout.
  useEffect(() => {
    if (isAuthenticated) {
      load();
    } else {
      setSettings(ORG_SETTINGS_DEFAULTS);
    }
  }, [isAuthenticated, load]);

  return (
    <OrgSettingsContext.Provider value={{ ...settings, refetch: load }}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOrgSettings(): OrgSettingsContextValue {
  return useContext(OrgSettingsContext);
}
