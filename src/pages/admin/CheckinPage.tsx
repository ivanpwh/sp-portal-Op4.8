import { useEffect, useMemo, useState } from 'react';
import { checkInParticipant, checkInSession, findForCheckIn, getStats, shortCode } from '../../lib/api';
import type { ParticipantWithSession } from '../../types';
import { formatDateTime, spInduk } from '../../lib/format';
import { Badge, Button, Card, Input, StatCard } from '../../components/ui';

// Tampilkan maksimal sekian baris saat kolom pencarian masih kosong, agar daftar
// tidak memuat seluruh peserta sekaligus di hari-H.
const EMPTY_QUERY_LIMIT = 50;

export default function CheckinPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ParticipantWithSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [totals, setTotals] = useState({ people: 0, checkedIn: 0 });

  function refresh(q: string) {
    findForCheckIn(q).then(setResults);
  }
  function refreshTotals() {
    getStats().then((s) => setTotals({ people: s.total_people, checkedIn: s.total_checked_in }));
  }

  useEffect(() => {
    refresh('');
    refreshTotals();
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => refresh(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  async function mark(p: ParticipantWithSession) {
    setBusyId(p.id);
    try {
      await checkInParticipant(p.id, !p.is_checked_in);
      refresh(query);
      refreshTotals();
    } finally {
      setBusyId(null);
    }
  }

  const isSearching = query.trim().length > 0;
  const limited = isSearching ? results : results.slice(0, EMPTY_QUERY_LIMIT);

  // Deteksi: pencarian cocok dengan satu KODE SESI (SP-XXXXXX) yang memuat lebih
  // dari satu orang → tawarkan check-in seluruh peserta sesi tersebut sekaligus.
  const sessionMatch = useMemo(() => {
    const qq = query.trim().toUpperCase();
    // Hanya aktif untuk pencarian KODE SESI (SP-XXXXXX), bukan nama / kode SP.
    if (!qq.startsWith('SP-')) return null;
    const bySession = new Map<string, ParticipantWithSession[]>();
    for (const r of results) {
      const arr = bySession.get(r.manage_token) ?? [];
      arr.push(r);
      bySession.set(r.manage_token, arr);
    }
    for (const members of bySession.values()) {
      if (members.length < 2) continue;
      const code = shortCode(members[0]);
      if (code.includes(qq)) {
        const remaining = members.filter((m) => !m.is_checked_in).length;
        return { code, members, remaining, sessionId: members[0].session_id };
      }
    }
    return null;
  }, [results, query]);

  async function markSession(members: ParticipantWithSession[], sessionId: string) {
    const allChecked = members.every((m) => m.is_checked_in);
    setBulkBusy(true);
    try {
      await checkInSession(sessionId, !allChecked);
      refresh(query);
      refreshTotals();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Check-in Hari-H</h1>
        <p className="text-sm text-slate-500">Cari peserta berdasarkan nama / kode SP / kode check-in, lalu tandai hadir.</p>
      </div>

      {/* Jumlah hadir global — bukan hanya dari hasil filter saat ini. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Sudah Hadir" value={totals.checkedIn} accent="blue" />
        <StatCard label="Belum Hadir" value={Math.max(totals.people - totals.checkedIn, 0)} accent="amber" />
        <StatCard label="Total Peserta" value={totals.people} />
      </div>

      <Card className="!p-4">
        <Input
          autoFocus
          placeholder="🔍 Scan/ketik kode (SP-XXXXXX), nama, atau kode SP…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-lg"
        />
        <p className="field-hint">
          Tip: gunakan pemindai QR yang mengetik ke kolom ini, atau cari manual.
        </p>
      </Card>

      {/* Aksi massal per sesi */}
      {sessionMatch && (
        <Card className="!p-4 border-brand-300 bg-brand-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-brand-900">
                Sesi <span className="font-mono">{sessionMatch.code}</span> · {sessionMatch.members.length} peserta
              </p>
              <p className="text-sm text-brand-800">
                {sessionMatch.remaining > 0
                  ? `${sessionMatch.remaining} peserta belum hadir.`
                  : 'Semua peserta sesi ini sudah hadir.'}
              </p>
            </div>
            <Button
              size="sm"
              variant={sessionMatch.remaining > 0 ? 'primary' : 'outline'}
              loading={bulkBusy}
              onClick={() => markSession(sessionMatch.members, sessionMatch.sessionId)}
            >
              {sessionMatch.remaining > 0 ? `✓ Check-in semua (${sessionMatch.members.length})` : 'Batalkan semua'}
            </Button>
          </div>
        </Card>
      )}

      {!isSearching && results.length > EMPTY_QUERY_LIMIT && (
        <p className="text-sm text-slate-500">
          Menampilkan {EMPTY_QUERY_LIMIT} dari {results.length} peserta — ketik nama atau kode untuk mencari.
        </p>
      )}

      <div className="space-y-3">
        {limited.map((p) => (
          <Card key={p.id} className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-slate-800">{p.full_name}</p>
                  {p.is_checked_in && <Badge color="blue">Hadir</Badge>}
                </div>
                <p className="text-xs text-slate-400">
                  <span className="font-mono">{p.sp_code}</span> · Induk {spInduk(p.sp_code)} · {shortCode(p)}
                </p>
                {p.is_checked_in && p.checked_in_at && (
                  <p className="mt-0.5 text-xs text-slate-400">Check-in: {formatDateTime(p.checked_in_at)}</p>
                )}
              </div>
              <Button
                size="sm"
                variant={p.is_checked_in ? 'outline' : 'primary'}
                loading={busyId === p.id}
                onClick={() => mark(p)}
              >
                {p.is_checked_in ? 'Batalkan' : '✓ Hadir'}
              </Button>
            </div>
          </Card>
        ))}
        {results.length === 0 && (
          <Card className="text-center text-slate-400">Tidak ada peserta yang cocok.</Card>
        )}
      </div>
    </div>
  );
}
