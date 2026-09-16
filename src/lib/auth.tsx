import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
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
  // Lazy initializer, BUKAN useEffect. Sesi harus sudah terbaca pada render
  // PERTAMA, karena <RequireAuth> menilai isAuthenticated di render itu juga.
  // Kalau dipulihkan lewat efek (yang jalan setelah render pertama), setiap
  // muat halaman langsung ke URL admin — tab baru dari window.open, refresh,
  // atau bookmark — akan terlempar ke /admin/login sebelum sesinya sempat
  // dibaca. getSession() adalah pembacaan localStorage sinkron ber-try/catch di
  // kedua data layer, jadi aman dipanggil saat render.
  const [committee, setCommittee] = useState<Committee | null>(
    () => getSession()?.committee ?? null,
  );

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
