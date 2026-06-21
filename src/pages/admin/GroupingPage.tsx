import { useEffect, useMemo, useState } from 'react';
import { exportCsv, getGroupedBySpInduk } from '../../lib/api';
import type { SpIndukGroup } from '../../types';
import { calculateAge, formatBirthDate } from '../../lib/format';
import { Badge, Button, Card, PageLoader } from '../../components/ui';

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GroupingPage() {
  const [groups, setGroups] = useState<SpIndukGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyAttending, setOnlyAttending] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    getGroupedBySpInduk({ onlyAttending })
      .then((g) => {
        setGroups(g);
        setExpanded(new Set(g.map((x) => x.induk))); // mulai dalam keadaan terbuka
      })
      .finally(() => setLoading(false));
  }, [onlyAttending]);

  const totalPeople = useMemo(() => groups.reduce((s, g) => s + g.participants.length, 0), [groups]);

  function toggle(induk: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(induk)) next.delete(induk);
      else next.add(induk);
      return next;
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Pengelompokan per SP Induk</h1>
          <p className="text-sm text-slate-500">
            {groups.length} kelompok · {totalPeople} peserta. Dikelompokkan berdasarkan level pertama kode SP.
          </p>
        </div>
        <Button variant="outline" onClick={async () => downloadCsv(await exportCsv(), `sp-portal-semua-${today}.csv`)}>
          ⬇ Ekspor Semua CSV
        </Button>
      </div>

      <Card className="!p-4">
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyAttending}
            onChange={(e) => setOnlyAttending(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Hanya tampilkan peserta yang akan hadir (sembunyikan yang dibatalkan)
        </label>
      </Card>

      {groups.length === 0 && (
        <Card className="text-center text-slate-400">Belum ada peserta untuk dikelompokkan.</Card>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const open = expanded.has(g.induk);
          return (
            <Card key={g.induk} className="!p-0">
              <div className="flex items-center justify-between gap-3 p-4">
                <button
                  type="button"
                  onClick={() => toggle(g.induk)}
                  className="flex min-w-0 items-center gap-3 text-left"
                  aria-expanded={open}
                >
                  <span className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                  <span className="font-mono text-lg font-extrabold text-brand-700">{g.induk}</span>
                  <Badge color="green">{g.participants.length} orang</Badge>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => downloadCsv(await exportCsv({ induk: g.induk }), `sp-portal-${g.induk}-${today}.csv`)}
                >
                  ⬇ CSV
                </Button>
              </div>

              {open && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Nama</th>
                        <th className="px-4 py-2.5">Kode SP</th>
                        <th className="px-4 py-2.5">Alamat</th>
                        <th className="px-4 py-2.5">Umur / Tgl Lahir</th>
                        <th className="px-4 py-2.5">Pekerjaan</th>
                        <th className="px-4 py-2.5">Menginap</th>
                        <th className="px-4 py-2.5">Email</th>
                        <th className="px-4 py-2.5">WA / HP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.participants.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-slate-800">{p.full_name}</span>
                            {p.is_checked_in && <Badge color="blue">✓</Badge>}
                            {p.attendance_status === 'cancelled' && <span className="ml-1"><Badge color="red">Batal</Badge></span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-700">{p.sp_code}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.address || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {calculateAge(p.birth_date) != null ? `${calculateAge(p.birth_date)} th` : '-'}
                            {p.birth_date ? ` · ${formatBirthDate(p.birth_date)}` : ''}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{p.last_occupation || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.accommodation || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.email || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600">{p.whatsapp_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
