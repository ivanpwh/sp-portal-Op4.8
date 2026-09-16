import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { PublicLayout } from './components/PublicLayout';
import { AdminLayout } from './components/AdminLayout';
import { SafeBoundary, Spinner } from './components/ui';

// Beranda dan daftar peserta DISENGAJA tetap statis: keduanya titik masuk paling
// umum, jadi memecahnya hanya menambah satu round-trip sebelum layar pertama.
import HomePage from './pages/public/HomePage';
import ParticipantsPage from './pages/public/ParticipantsPage';

// Sisanya dimuat saat dibutuhkan. Yang dihemat bukan sekadar kode halamannya,
// tapi dependensi berat yang hanya dipakai di situ — lottie-react (256K) dan
// qrcode.react (130K) cuma dipakai SuccessPage, canvas-confetti (108K) cuma
// dipakai layar undian, flowbite-datepicker cuma dipakai form. Tamu yang
// membuka beranda dulu mengunduh semuanya tanpa pernah memakainya.
const RegisterPage = lazy(() => import('./pages/public/RegisterPage'));
const SuccessPage = lazy(() => import('./pages/public/SuccessPage'));
const ManagePage = lazy(() => import('./pages/public/ManagePage'));

const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const SessionDetailPage = lazy(() => import('./pages/admin/SessionDetailPage'));
const GroupingPage = lazy(() => import('./pages/admin/GroupingPage'));
const StatisticsPage = lazy(() => import('./pages/admin/StatisticsPage'));
const BroadcastPage = lazy(() => import('./pages/admin/BroadcastPage'));
const CheckinPage = lazy(() => import('./pages/admin/CheckinPage'));
const EventSettingsPage = lazy(() => import('./pages/admin/EventSettingsPage'));
const CommitteesPage = lazy(() => import('./pages/admin/CommitteesPage'));
const NotificationLogsPage = lazy(() => import('./pages/admin/NotificationLogsPage'));
const LotteryControlPage = lazy(() => import('./pages/admin/LotteryControlPage'));
const LotteryPresentPage = lazy(() => import('./pages/admin/LotteryPresentPage'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? children : <Navigate to="/admin" replace />;
}

/** Ditampilkan selama chunk halaman diunduh. */
function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <Spinner className="h-8 w-8 text-emerald-600" />
      <span className="sr-only">Memuat halaman…</span>
    </div>
  );
}

/**
 * Kegagalan memuat chunk BUKAN kasus teoretis: koneksi seluler yang putus di
 * tengah, atau deploy baru yang menghapus nama berkas lama dari tab yang sudah
 * lama dibiarkan terbuka. Tanpa pembatas ini layarnya jadi putih tanpa
 * penjelasan. SafeBoundary tanpa `fallback` merender null — persis layar putih
 * yang ingin dihindari — jadi fallback-nya wajib diisi di sini.
 */
function RouteErrorFallback() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-lg font-semibold text-slate-900">Halaman gagal dimuat</p>
      <p className="mt-2 text-sm text-slate-600">
        Sebagian halaman ini tidak berhasil diunduh. Periksa koneksi Anda lalu muat ulang.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Muat ulang
      </button>
    </div>
  );
}

export default function App() {
  return (
    <SafeBoundary fallback={<RouteErrorFallback />}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public area */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/peserta" element={<ParticipantsPage />} />
            <Route path="/daftar" element={<RegisterPage />} />
            <Route path="/sukses/:token" element={<SuccessPage />} />
            <Route path="/kelola/:token" element={<ManagePage />} />
          </Route>

          {/* Admin auth */}
          <Route path="/admin/login" element={<LoginPage />} />

          {/* Layar besar undian (proyektor). Di luar AdminLayout supaya tidak ada
              sidebar/header yang memakan ruang layar — TAPI tetap terproteksi
              RequireAuth persis seperti halaman admin lain. Dibuka lewat
              window.open dari /admin/undian, jadi sesi login-nya ikut serta. */}
          <Route
            path="/admin/undian/layar"
            element={
              <RequireAuth>
                <LotteryPresentPage />
              </RequireAuth>
            }
          />

          {/* Admin area (protected) */}
          <Route
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/sesi/:id" element={<SessionDetailPage />} />
            <Route path="/admin/pengelompokan" element={<GroupingPage />} />
            <Route path="/admin/statistik" element={<StatisticsPage />} />
            <Route path="/admin/broadcast" element={<BroadcastPage />} />
            <Route path="/admin/checkin" element={<CheckinPage />} />
            <Route path="/admin/undian" element={<LotteryControlPage />} />
            <Route path="/admin/notifikasi" element={<NotificationLogsPage />} />
            <Route path="/admin/pengaturan" element={<EventSettingsPage />} />
            <Route
              path="/admin/panitia"
              element={
                <RequireSuperAdmin>
                  <CommitteesPage />
                </RequireSuperAdmin>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </SafeBoundary>
  );
}
