import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Committee } from '../types';
import { getSession, login as apiLogin, logout as apiLogout } from './api';

interface AuthContextValue {
  committee: Committee | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [committee, setCommittee] = useState<Committee | null>(null);

  useEffect(() => {
    const s = getSession();
    if (s) setCommittee(s.committee);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      committee,
      isAuthenticated: !!committee,
      isSuperAdmin: committee?.role === 'super_admin',
      async login(email, password) {
        const s = await apiLogin(email, password);
        setCommittee(s.committee);
      },
      logout() {
        apiLogout();
        setCommittee(null);
      },
    }),
    [committee],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
