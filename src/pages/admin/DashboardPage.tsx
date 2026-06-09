import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { exportCsv, listSessions, shortCode } from '../../lib/api';
import type { SessionWithParticipants } from '../../types';
import { compareSpCode, formatShortDateTime, spInduk } from '../../lib/format';
import { Badge, Button, Card, Input, PageLoader, Select, StatCard } from '../../components/ui';

type StatusFilter = 'all' | 'will_attend' | 'cancelled' | 'checked_in';

function attendingCount(s: SessionWithParticipants): number {
  return s.participants.filter((p) => p.attendance_status === 'will_attend').length;
}
function checkedInCount(s: SessionWithParticipants): number {
  return s.participants.filter((p) => p.is_checked_in).length;
}
function indukList(s: SessionWithParticipants): string[] {
  return Array.from(new Set(s.participants.map((p) => spInduk(p.sp_code)))).sort(compareSpCode);
}
function isCancelled(s: SessionWithParticipants): boolean {
  return s.participants.length > 0 && s.participants.every((p) => p.attendance_status === 'cancelled');
}
// Representative = first participant (participants come pre-sorted by SP code).
function repName(s: SessionWithParticipants): string {
  return s.participants[0]?.full_name ?? '(tanpa peserta)';
}
function repContact(s: SessionWithParticipants): string {
  const p = s.participants.find((x) => x.whatsapp_number || x.email);
  return p?.whatsapp_number || p?.email || '-';
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [induk, setInduk] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  const allInduk = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => s.participants.forEach((p) => set.add(spInduk(p.sp_code))));
    return Array.from(set).sort(compareSpCode);
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (induk !== 'all' && !indukList(s).includes(induk)) return false;
      if (status === 'will_attend' && isCancelled(s)) return false;
      if (status === 'cancelled' && !isCancelled(s)) return false;
      if (status === 'checked_in' && checkedInCount(s) === 0) return false;
      if (q) {
        const hay = [
          shortCode(s),
          ...s.participants.map((p) => `${p.full_name} ${p.sp_code} ${p.whatsapp_number ?? ''} ${p.email ?? ''}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, query, induk, status]);

  const totals = useMemo(() => {
    return {
      sessions: sessions.filter((s) => !isCancelled(s)).length,
      people: sessions.reduce((sum, s) => sum + attendingCount(s), 0),
      checkedIn: sessions.reduce((sum, s) => sum + checkedInCount(s), 0),
      cancelled: sessions.filter((s) => isCancelled(s)).length,
    };
  }, [sessions]);

  function downloadCsv() {
    const blob = new Blob([exportCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sp-portal-peserta-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Pendaftar</h1>
          <p className="text-sm text-slate-500">Pantau, cari, dan kelola sesi pendaftaran reuni.</p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          ⬇ Ekspor CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Sesi Terdaftar" value={totals.sessions} />
        <StatCard label="Total Peserta" value={totals.people} accent="blue" />
        <StatCard label="Sudah Check-in" value={totals.checkedIn} accent="amber" />
        <StatCard label="Sesi Dibatalkan" value={totals.cancelled} accent="slate" />
      </div>

      {/* Filters */}
      <Card className="!p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            placeholder="Cari nama peserta, kode SP, WA…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={induk} onChange={(e) => setInduk(e.target.value)}>
            <option value="all">Semua SP Induk</option>
            {allInduk.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">Semua Status</option>
            <option value="will_attend">Akan Hadir</option>
            <option value="checked_in">Ada yang Check-in</option>
            <option value="cancelled">Dibatalkan</option>
          </Select>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Menampilkan <strong>{filtered.length}</strong> dari {sessions.length} sesi.
        </p>
      </Card>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Perwakilan</th>
              <th className="px-4 py-3">Peserta</th>
              <th className="px-4 py-3">SP Induk</th>
              <th className="px-4 py-3">Kontak</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Terdaftar</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{repName(s)}</p>
                  <p className="text-xs text-slate-400">{shortCode(s)}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {attendingCount(s)} / {s.participants.length} org
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {indukList(s).map((i) => (
                      <Badge key={i}>{i}</Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{repContact(s)}</td>
                <td className="px-4 py-3">
                  <StatusBadges s={s} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatShortDateTime(s.registered_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/admin/sesi/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Tidak ada sesi yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {filtered.map((s) => (
          <Link key={s.id} to={`/admin/sesi/${s.id}`}>
            <Card className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{repName(s)}</p>
                  <p className="text-xs text-slate-400">{shortCode(s)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {indukList(s).map((i) => (
                      <Badge key={i}>{i}</Badge>
                    ))}
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{repContact(s)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadges s={s} />
                  <p className="mt-1 text-xs text-slate-400">{attendingCount(s)} / {s.participants.length} org</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <Card className="text-center text-slate-400">Tidak ada sesi yang cocok.</Card>
        )}
      </div>
    </div>
  );
}

function StatusBadges({ s }: { s: SessionWithParticipants }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {isCancelled(s) ? <Badge color="red">Batal</Badge> : <Badge color="green">Hadir</Badge>}
      {checkedInCount(s) > 0 && <Badge color="blue">Check-in {checkedInCount(s)}</Badge>}
    </div>
  );
}
