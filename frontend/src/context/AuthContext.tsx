import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { User } from '@hospital-hr/shared';
import { authApi } from '../api/auth';

// ─── Shape ────────────────────────────────────────────────────────────────────

interface AuthState {
  user:               User | null;
  token:              string | null;
  isAuthenticated:    boolean;
  isLoading:          boolean;
  mustChangePassword: boolean;
  login:              (email: string, password: string) => Promise<void>;
  logout:             () => void;
  clearMustChange:    () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,               setUser]               = useState<User | null>(null);
  const [token,              setToken]              = useState<string | null>(null);
  const [isLoading,          setIsLoading]          = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Rehydrate from localStorage on first mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser  = localStorage.getItem('auth_user');
    const storedMust  = localStorage.getItem('must_change_pwd');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as User);
        setMustChangePassword(storedMust === 'true');
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('must_change_pwd');
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: newToken, profile, mustChangePassword: must } = await authApi.login(email, password);
    localStorage.setItem('token',           newToken);
    localStorage.setItem('auth_user',       JSON.stringify(profile));
    localStorage.setItem('must_change_pwd', String(must));
    setToken(newToken);
    setUser(profile);
    setMustChangePassword(must);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('must_change_pwd');
    setToken(null);
    setUser(null);
    setMustChangePassword(false);
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
      value={{ user, token, isAuthenticated: !!token, isLoading, mustChangePassword, login, logout, clearMustChange }}
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
