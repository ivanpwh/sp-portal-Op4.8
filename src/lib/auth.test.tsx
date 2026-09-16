import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import type { Committee } from '../types';

const LS_SESSION = 'sp.session';

const COMMITTEE: Committee = {
  id: 'committee-1',
  name: 'Panitia Inti',
  email: 'panitia@example.com',
  role: 'super_admin',
  is_active: true,
  created_at: new Date().toISOString(),
};

function seedSession() {
  localStorage.setItem(LS_SESSION, JSON.stringify({ token: 'jwt.test', committee: COMMITTEE }));
}

/** Mencatat nilai isAuthenticated pada SETIAP render, dimulai dari yang pertama. */
function makeProbe() {
  const seen: boolean[] = [];
  function Probe() {
    const { isAuthenticated, committee } = useAuth();
    seen.push(isAuthenticated);
    return <span data-testid="state">{isAuthenticated ? `masuk:${committee?.name}` : 'keluar'}</span>;
  }
  return { seen, Probe };
}

beforeEach(() => {
  localStorage.clear();
});

describe('AuthProvider', () => {
  /**
   * REGRESI — bug yang melumpuhkan seluruh fitur dua-tab undian.
   *
   * Dulu sesi dipulihkan di dalam useEffect, yang jalan SETELAH render pertama.
   * Sementara <RequireAuth> menilai isAuthenticated di render pertama itu juga,
   * jadi setiap muat halaman langsung ke URL admin — tab baru dari window.open,
   * refresh, atau bookmark — terlempar ke /admin/login sebelum sesinya sempat
   * dibaca, lalu mendarat di dashboard admin lengkap dengan sidebar.
   *
   * Yang diuji di sini BUKAN "akhirnya terautentikasi", melainkan "sudah
   * terautentikasi pada render PERTAMA". Versi lama akan lolos uji pertama dan
   * gagal di uji ini.
   */
  it('mengenali sesi tersimpan pada render PERTAMA, bukan setelah efek', () => {
    seedSession();
    const { seen, Probe } = makeProbe();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe(true);
    // Tidak boleh ada satu pun render yang sempat mengira pengguna belum masuk —
    // satu render saja sudah cukup untuk memicu <Navigate to="/admin/login" />.
    expect(seen).not.toContain(false);
  });

  it('mengekspos komiti dan peran dari sesi tersimpan', () => {
    seedSession();
    render(
      <AuthProvider>
        <ProbeRoles />
      </AuthProvider>,
    );
    expect(screen.getByTestId('name').textContent).toBe('Panitia Inti');
    expect(screen.getByTestId('super').textContent).toBe('ya');
  });

  it('tidak terautentikasi saat tidak ada sesi tersimpan', () => {
    const { seen, Probe } = makeProbe();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(seen[0]).toBe(false);
    expect(screen.getByTestId('state').textContent).toBe('keluar');
  });

  it('tidak melempar saat isi sesi di localStorage rusak', () => {
    localStorage.setItem(LS_SESSION, '{bukan json');
    const { seen, Probe } = makeProbe();
    expect(() =>
      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      ),
    ).not.toThrow();
    expect(seen[0]).toBe(false);
  });
});

function ProbeRoles() {
  const { committee, isSuperAdmin } = useAuth();
  return (
    <>
      <span data-testid="name">{committee?.name}</span>
      <span data-testid="super">{isSuperAdmin ? 'ya' : 'tidak'}</span>
    </>
  );
}
