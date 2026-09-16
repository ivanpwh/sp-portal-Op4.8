import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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

/**
 * Isi satu sel tabel yang dijaga tetap satu baris: teks yang melebihi lebar
 * kolom dipotong dengan elipsis, dan `title` (tooltip bawaan browser) hanya
 * dipasang ketika pemotongan benar-benar terjadi. Memasang `title` tanpa
 * syarat akan memunculkan tooltip pada teks yang sudah terbaca utuh — selain
 * mengganggu, itu membuat pengguna tak bisa menebak sel mana yang sebenarnya
 * menyembunyikan isi.
 */
function Truncated({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Toleransi 1px: pembulatan sub-pixel bisa membuat scrollWidth unggul satu
    // piksel pada teks yang sebetulnya muat.
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return; // jsdom tidak punya ini
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={`block truncate ${className}`} title={clipped ? text : undefined}>
      {text}
    </span>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-2.5 font-semibold">{children}</th>;
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
                  {/*
                    `table-fixed` + <colgroup> wajib berpasangan di sini. Tanpa
                    keduanya browser melebarkan kolom mengikuti isi terpanjang
                    lalu membungkus sisanya ke baris baru — satu alamat panjang
                    saja cukup membuat seluruh baris setinggi delapan baris teks.
                    Lebar tetap membuat tiap baris peserta persis satu baris.

                    Empat kolom dilebihkan supaya isinya tidak pernah terpotong:

                    - Umur / Tgl Lahir (230px) — maksimum "100 th · 13 September
                      1974".
                    - Menginap (230px) — opsi terpanjang di ACCOMMODATION_OPTIONS
                      (src/lib/constants.ts), "Rumah Sendiri (warga lokal)".
                    - WA / HP (170px) — isValidWhatsapp() di backend/src/utils.ts
                      membatasi nomor pada /^62\d{8,13}$/, jadi paling panjang 15
                      digit.
                    - Email (320px) — muat ~39 karakter, cukup untuk alamat yang
                      wajar; ini satu-satunya dari keempatnya yang tidak punya
                      batas atas di skema.

                    <Truncated> tetap dipakai di keempatnya sebagai jaring
                    pengaman. `accommodation` dan `email` divalidasi sebagai
                    z.string() bebas (backend/src/schemas.ts), bukan enum atau
                    string berbatas, jadi nilai di luar dugaan masih bisa masuk —
                    lebih baik dipotong rapi dengan tooltip daripada meluber
                    menimpa kolom sebelah.
                  */}
                  <table className="w-full min-w-[1690px] table-fixed text-left text-sm">
                    <colgroup>
                      <col className="w-[200px]" />
                      <col className="w-[130px]" />
                      <col className="w-[260px]" />
                      <col className="w-[230px]" /> {/* Umur / Tgl Lahir — lihat catatan di atas */}
                      <col className="w-[150px]" />
                      <col className="w-[230px]" /> {/* Menginap — lihat catatan di atas */}
                      <col className="w-[320px]" /> {/* Email — lihat catatan di atas */}
                      <col className="w-[170px]" /> {/* WA / HP — lihat catatan di atas */}
                    </colgroup>
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <Th>Nama</Th>
                        <Th>Kode SP</Th>
                        <Th>Alamat</Th>
                        <Th>Umur / Tgl Lahir</Th>
                        <Th>Pekerjaan</Th>
                        <Th>Menginap</Th>
                        <Th>Email</Th>
                        <Th>WA / HP</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.participants.map((p) => {
                        const age = calculateAge(p.birth_date);
                        const ageLine =
                          (age != null ? `${age} th` : '-') +
                          (p.birth_date ? ` · ${formatBirthDate(p.birth_date)}` : '');
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <Truncated text={p.full_name} className="font-semibold text-slate-800" />
                                {p.is_checked_in && (
                                  <span className="shrink-0">
                                    <Badge color="blue">✓</Badge>
                                  </span>
                                )}
                                {p.attendance_status === 'cancelled' && (
                                  <span className="shrink-0">
                                    <Badge color="red">Batal</Badge>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.sp_code} className="font-mono text-slate-700" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.address || '-'} className="text-slate-600" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={ageLine} className="text-slate-600" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.last_occupation || '-'} className="text-slate-600" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.accommodation || '-'} className="text-slate-600" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.email || '-'} className="text-slate-600" />
                            </td>
                            <td className="px-4 py-2.5">
                              <Truncated text={p.whatsapp_number || '-'} className="text-slate-600" />
                            </td>
                          </tr>
                        );
                      })}
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
