import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, authApi, type ApiProfile, type ApiUser } from '../lib/api';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'unavailable';

interface AuthContextValue {
  status: AuthStatus;
  user: ApiUser | null;
  profile: ApiProfile | null;
  error: string;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setStatus('checking');
    setError('');
    try {
      const result = await authApi.me();
      setUser(result.user);
      setProfile(result.profile);
      setStatus('authenticated');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setUser(null);
        setProfile(null);
        setStatus('unauthenticated');
        return;
      }
      setUser(null);
      setProfile(null);
      setStatus('unavailable');
      setError(cause instanceof Error ? cause.message : 'Unable to check your session.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const result = await authApi.me();
        if (!active) return;
        setUser(result.user);
        setProfile(result.profile);
        setStatus('authenticated');
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setUser(null);
          setProfile(null);
          setStatus('unauthenticated');
          return;
        }
        setStatus('unavailable');
        setError(cause instanceof Error ? cause.message : 'Unable to check your session.');
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    const result = await authApi.me();
    setUser(result.user);
    setProfile(result.profile);
    setError('');
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    await authApi.register(displayName, email, password);
    const result = await authApi.me();
    setUser(result.user);
    setProfile(result.profile);
    setError('');
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setProfile(null);
    setError('');
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status, user, profile, error, refresh, login, register, logout,
  }), [status, user, profile, error, refresh, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
