import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  superAdmin?: boolean;
}

const icon = (path: string) => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
);

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: icon('M4 6h16M4 12h16M4 18h7') },
  { to: '/admin/pengelompokan', label: 'Pengelompokan SP', icon: icon('M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z') },
  { to: '/admin/statistik', label: 'Statistik', icon: icon('M9 19v-6m4 6V9m4 10V5M5 21h14') },
  { to: '/admin/checkin', label: 'Check-in Hari-H', icon: icon('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z') },
  { to: '/admin/broadcast', label: 'Broadcast Pengingat', icon: icon('M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4 4 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z') },
  { to: '/admin/notifikasi', label: 'Log Notifikasi', icon: icon('M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9') },
  { to: '/admin/pengaturan', label: 'Pengaturan Acara', icon: icon('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z') },
  { to: '/admin/panitia', label: 'Akun Panitia', superAdmin: true, icon: icon('M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z') },
];

export function AdminLayout() {
  const { committee, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.superAdmin || isSuperAdmin);

  // Aksesibilitas drawer mobile: tutup dengan Escape & kunci scroll latar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const SideNav = (
    <nav className="flex flex-col gap-1" aria-label="Navigasi admin">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/admin'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          {n.icon}
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <a href="#konten" className="skip-link">
        Langsung ke konten
      </a>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu navigasi"
              aria-expanded={open}
              aria-controls="admin-drawer"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link to="/admin" className="rounded-lg text-slate-900" aria-label="SP Portal — Dashboard">
              <Logo />
            </Link>
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 sm:inline">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{committee?.name}</p>
              <p className="text-xs text-slate-500">{isSuperAdmin ? 'Super Admin' : 'Panitia'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20">{SideNav}</div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              id="admin-drawer"
              className="absolute left-0 top-0 h-full w-72 bg-white p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Menu navigasi"
            >
              <div className="mb-4 flex items-center justify-between">
                <Logo />
                <button
                  onClick={() => setOpen(false)}
                  className="-mr-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Tutup menu"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {SideNav}
            </div>
          </div>
        )}

        <main id="konten" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
