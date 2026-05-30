import { useEffect, useState } from 'react';
import { checkIn, findForCheckIn, shortCode } from '../../lib/api';
import type { Registrant } from '../../types';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, Input, StatCard } from '../../components/ui';

export default function CheckinPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Registrant[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh(q: string) {
    findForCheckIn(q).then(setResults);
  }

  useEffect(() => {
    refresh('');
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => refresh(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  async function mark(r: Registrant) {
    setBusyId(r.id);
    try {
      await checkIn(r.id, !r.is_checked_in);
      refresh(query);
    } finally {
      setBusyId(null);
    }
  }

  const present = results.filter((r) => r.is_checked_in).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Check-in Hari-H</h1>
        <p className="text-sm text-slate-500">Cari peserta berdasarkan nama / kode / nomor, lalu tandai hadir.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Ditampilkan" value={results.length} />
        <StatCard label="Sudah Hadir" value={present} accent="blue" />
        <StatCard label="Belum Hadir" value={results.length - present} accent="amber" />
      </div>

      <Card className="!p-4">
        <Input
          autoFocus
          placeholder="🔍 Scan/ketik kode (SP-XXXXXX), nama, atau nomor WA…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="text-lg"
        />
        <p className="field-hint">
          Tip: gunakan pemindai QR yang mengetik ke kolom ini, atau cari manual.
        </p>
      </Card>

      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.id} className="!p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-slate-800">{r.full_name}</p>
                  {r.is_checked_in && <Badge color="blue">Hadir</Badge>}
                </div>
                <p className="text-xs text-slate-400">
                  {shortCode(r)} · {r.family_branch} · {r.group_size} org
                </p>
                {r.is_checked_in && r.checked_in_at && (
                  <p className="mt-0.5 text-xs text-slate-400">Check-in: {formatDateTime(r.checked_in_at)}</p>
                )}
              </div>
              <Button
                size="sm"
                variant={r.is_checked_in ? 'outline' : 'primary'}
                loading={busyId === r.id}
                onClick={() => mark(r)}
              >
                {r.is_checked_in ? 'Batalkan' : '✓ Hadir'}
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
