import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { UserProfile } from '@hospital-hr/shared';
import { authApi, type BranchSlim } from '../api/auth';

// ─── Shape ────────────────────────────────────────────────────────────────────

export interface LoginResult {
  needsBranchSelect: boolean;
  mustChangePassword: boolean;
  role: string;
}

interface AuthState {
  user:               UserProfile | null;
  token:              string | null;
  isAuthenticated:    boolean;
  isLoading:          boolean;
  mustChangePassword: boolean;
  pendingBranches:    BranchSlim[] | null;   // non-null = branch selection required
  login:              (email: string, password: string) => Promise<LoginResult>;
  selectBranch:       (branchId: string) => Promise<void>;
  logout:             () => void;
  clearMustChange:    () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,               setUser]               = useState<UserProfile | null>(null);
  const [token,              setToken]              = useState<string | null>(null);
  const [isLoading,          setIsLoading]          = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingBranches,    setPendingBranches]    = useState<BranchSlim[] | null>(null);

  // Rehydrate from localStorage on first mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser  = localStorage.getItem('auth_user');
    const storedMust  = localStorage.getItem('must_change_pwd');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as UserProfile);
        setMustChangePassword(storedMust === 'true');
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('must_change_pwd');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { token: newToken, profile, branches, mustChangePassword: must } =
      await authApi.login(email, password);

    if (branches.length <= 1) {
      // Auto-select the single branch (or no branch needed) — exchange for branch-scoped token
      localStorage.setItem('token', newToken);
      const targetBranchId = branches[0]?.id ?? profile.branchId;
      const { token: branchToken, profile: branchProfile } =
        await authApi.selectBranch(targetBranchId);
      localStorage.setItem('token',           branchToken);
      localStorage.setItem('auth_user',       JSON.stringify(branchProfile));
      localStorage.setItem('must_change_pwd', String(must));
      setToken(branchToken);
      setUser(branchProfile);
      setMustChangePassword(must);
      return { needsBranchSelect: false, mustChangePassword: must, role: branchProfile.role };
    } else {
      // Multiple branches — store pre-branch token temporarily, show picker
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(profile);
      setMustChangePassword(must);
      setPendingBranches(branches);
      return { needsBranchSelect: true, mustChangePassword: must, role: profile.role };
    }
  }, []);

  const selectBranch = useCallback(async (branchId: string) => {
    const { token: branchToken, profile: branchProfile } =
      await authApi.selectBranch(branchId);
    localStorage.setItem('token',           branchToken);
    localStorage.setItem('auth_user',       JSON.stringify(branchProfile));
    setToken(branchToken);
    setUser(branchProfile);
    setPendingBranches(null);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('must_change_pwd');
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
    setPendingBranches(null);
  }, []);

  const clearMustChange = useCallback(() => {
    localStorage.setItem('must_change_pwd', 'false');
    setMustChangePassword(false);
  }, []);

  // Auto-logout on 401 from any API call
  useEffect(() => {
    function onUnauthorized() { logout(); }
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user, token, isAuthenticated: !!token, isLoading, mustChangePassword,
        pendingBranches, login, selectBranch, logout, clearMustChange,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
