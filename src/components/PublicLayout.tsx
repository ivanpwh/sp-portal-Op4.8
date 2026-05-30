import { Link, Outlet } from 'react-router-dom';
import { Logo } from './ui';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="container-app flex h-16 items-center justify-between">
          <Link to="/" className="text-slate-900">
            <Logo />
          </Link>
          <Link
            to="/admin/login"
            className="text-sm font-semibold text-slate-500 hover:text-brand-700"
          >
            Login Panitia
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-app flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500">
          <Logo className="text-slate-700" />
          <p>Portal Pendaftaran Reuni Keluarga Besar Soero Pramono</p>
          <p className="text-xs text-slate-400">
            Data Anda dilindungi &amp; hanya digunakan untuk keperluan acara reuni.
          </p>
        </div>
      </footer>
    </div>
  );
}
