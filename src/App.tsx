import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { PublicLayout } from './components/PublicLayout';
import { AdminLayout } from './components/AdminLayout';

import HomePage from './pages/public/HomePage';
import RegisterPage from './pages/public/RegisterPage';
import SuccessPage from './pages/public/SuccessPage';
import ManagePage from './pages/public/ManagePage';
import ParticipantsPage from './pages/public/ParticipantsPage';

import LoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import SessionDetailPage from './pages/admin/SessionDetailPage';
import GroupingPage from './pages/admin/GroupingPage';
import StatisticsPage from './pages/admin/StatisticsPage';
import BroadcastPage from './pages/admin/BroadcastPage';
import CheckinPage from './pages/admin/CheckinPage';
import EventSettingsPage from './pages/admin/EventSettingsPage';
import CommitteesPage from './pages/admin/CommitteesPage';
import NotificationLogsPage from './pages/admin/NotificationLogsPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

function RequireSuperAdmin({ children }: { children: JSX.Element }) {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? children : <Navigate to="/admin" replace />;
}

export default function App() {
  return (
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
  );
}
