import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportCsv, listRegistrants, shortCode } from '../../lib/api';
import type { AttendanceStatus, Registrant } from '../../types';
import { FAMILY_BRANCHES } from '../../lib/constants';
import { formatShortDateTime } from '../../lib/format';
import { Badge, Button, Card, Input, PageLoader, Select, StatCard } from '../../components/ui';

type StatusFilter = 'all' | AttendanceStatus | 'checked_in';

export default function DashboardPage() {
  const [registrants, setRegistrants] = useState<Registrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    listRegistrants()
      .then(setRegistrants)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registrants.filter((r) => {
      if (branch !== 'all' && r.family_branch !== branch) return false;
      if (status === 'will_attend' && r.attendance_status !== 'will_attend') return false;
      if (status === 'cancelled' && r.attendance_status !== 'cancelled') return false;
      if (status === 'checked_in' && !r.is_checked_in) return false;
      if (q) {
        const hay = `${r.full_name} ${r.email} ${r.whatsapp_number} ${shortCode(r)} ${r.last_occupation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [registrants, query, branch, status]);

  const totals = useMemo(() => {
    const active = registrants.filter((r) => r.attendance_status === 'will_attend');
    return {
      registrants: active.length,
      people: active.reduce((s, r) => s + (r.group_size || 1), 0),
      cancelled: registrants.filter((r) => r.attendance_status === 'cancelled').length,
      checkedIn: registrants.filter((r) => r.is_checked_in).length,
    };
  }, [registrants]);

  function downloadCsv() {
    const csv = exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sp-portal-pendaftar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Pendaftar</h1>
          <p className="text-sm text-slate-500">Pantau, cari, dan kelola data peserta reuni.</p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          ⬇ Ekspor CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Keluarga Terdaftar" value={totals.registrants} />
        <StatCard label="Total Orang" value={totals.people} accent="blue" />
        <StatCard label="Sudah Check-in" value={totals.checkedIn} accent="amber" />
        <StatCard label="Dibatalkan" value={totals.cancelled} accent="slate" />
      </div>

      {/* Filters */}
      <Card className="!p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            placeholder="Cari nama, email, WA, kode…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">Semua Trah</option>
            {FAMILY_BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">Semua Status</option>
            <option value="will_attend">Akan Hadir</option>
            <option value="checked_in">Sudah Check-in</option>
            <option value="cancelled">Dibatalkan</option>
          </Select>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Menampilkan <strong>{filtered.length}</strong> dari {registrants.length} pendaftar.
        </p>
      </Card>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Trah</th>
              <th className="px-4 py-3">Rombongan</th>
              <th className="px-4 py-3">Kontak</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Terdaftar</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{r.full_name}</p>
                  <p className="text-xs text-slate-400">{shortCode(r)}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.family_branch}</td>
                <td className="px-4 py-3 text-slate-600">{r.group_size} org</td>
                <td className="px-4 py-3 text-slate-600">
                  <p>{r.whatsapp_number}</p>
                  <p className="text-xs text-slate-400">{r.email}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadges r={r} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatShortDateTime(r.registered_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/admin/peserta/${r.id}`} className="font-semibold text-brand-700 hover:underline">
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Tidak ada pendaftar yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {filtered.map((r) => (
          <Link key={r.id} to={`/admin/peserta/${r.id}`}>
            <Card className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{r.full_name}</p>
                  <p className="text-xs text-slate-400">{shortCode(r)} · {r.family_branch}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">{r.whatsapp_number}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadges r={r} />
                  <p className="mt-1 text-xs text-slate-400">{r.group_size} org</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <Card className="text-center text-slate-400">Tidak ada pendaftar yang cocok.</Card>
        )}
      </div>
    </div>
  );
}

function StatusBadges({ r }: { r: Registrant }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {r.attendance_status === 'cancelled' ? (
        <Badge color="red">Batal</Badge>
      ) : (
        <Badge color="green">Hadir</Badge>
      )}
      {r.is_checked_in && <Badge color="blue">Check-in</Badge>}
    </div>
  );
}
