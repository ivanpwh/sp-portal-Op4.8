import { Link, Outlet } from 'react-router-dom';
import { Logo } from './ui';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#konten" className="skip-link">
        Langsung ke konten
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container-app flex h-16 items-center justify-between">
          <Link to="/" className="rounded-lg text-slate-900" aria-label="SP Portal — Beranda">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/peserta"
              className="rounded-lg px-3 py-2 text-base font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand-800"
            >
              Peserta
            </Link>
            <Link
              to="/admin/login"
              className="rounded-lg px-3 py-2 text-base font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand-800"
            >
              Login Panitia
            </Link>
          </nav>
        </div>
      </header>

      <main id="konten" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-app flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-600">
          <Logo className="text-slate-700" />
          <p>Portal Pendaftaran Reuni Keluarga Besar Soero Pramono</p>
          <p className="text-xs text-slate-500">
            Data Anda dilindungi &amp; hanya digunakan untuk keperluan acara reuni.
          </p>
        </div>
      </footer>
    </div>
  );
}
