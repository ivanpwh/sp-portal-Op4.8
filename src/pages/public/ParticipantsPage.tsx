import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicParticipants } from '../../lib/api';
import type { PublicParticipant, PublicSpIndukGroup } from '../../types';
import { Badge, Button, Card, CountUp, Input, PageLoader, Select } from '../../components/ui';

type SortMode = 'sp' | 'name';

/**
 * Bandingkan nama sesuai kebiasaan Bahasa Indonesia, mengabaikan beda huruf
 * besar/kecil dan tanda diakritik — "Ahmad", "ahmad", dan "Áhmad" duduk
 * berdampingan, bukan terlempar ke ujung daftar seperti pada perbandingan
 * kode karakter biasa.
 *
 * Kode SP jadi penentu saat namanya persis sama: tanpa itu dua orang bernama
 * sama bisa bertukar tempat di tiap render, dan daftar tampak berkedip.
 */
function compareByName(a: PublicParticipant, b: PublicParticipant): number {
  const n = a.full_name.localeCompare(b.full_name, 'id', { sensitivity: 'base' });
  return n !== 0 ? n : a.sp_code.localeCompare(b.sp_code, 'id');
}

export default function ParticipantsPage() {
  const [groups, setGroups] = useState<PublicSpIndukGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('sp');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getPublicParticipants()
      .then((g) => {
        setGroups(g);
        setExpanded(new Set(g.map((x) => x.induk))); // mulai terbuka
      })
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();

  // Saring nama / panggilan / kode SP, lalu buang kelompok yang kosong.
  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        participants: g.participants.filter(
          (p) =>
            p.full_name.toLowerCase().includes(q) ||
            (p.nickname ?? '').toLowerCase().includes(q) ||
            p.sp_code.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.participants.length > 0);
  }, [groups, q]);

  /**
   * Pengurutan dilakukan SETELAH penyaringan dan hanya di dalam tiap kelompok —
   * urutan kelompok SP Induk itu sendiri tidak ikut berubah, karena itulah
   * kerangka halaman ini.
   *
   * 'sp' TIDAK mengurutkan ulang apa pun: backend sudah mengirim peserta urut
   * kode SP (services.publicParticipants()), dan mengurutkannya lagi di sini
   * hanya akan menjadi salinan kedua dari aturan yang sama — yang bisa
   * menyimpang diam-diam begitu salah satunya berubah.
   */
  const shown = useMemo(() => {
    if (sort === 'sp') return filtered;
    return filtered.map((g) => ({ ...g, participants: [...g.participants].sort(compareByName) }));
  }, [filtered, sort]);

  const totalPeople = useMemo(
    () => groups.reduce((s, g) => s + g.participants.length, 0),
    [groups],
  );
  const shownPeople = useMemo(
    () => filtered.reduce((s, g) => s + g.participants.length, 0),
    [filtered],
  );

  function toggle(induk: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(induk)) next.delete(induk);
      else next.add(induk);
      return next;
    });
  }

  const isSearching = q.length > 0;

  if (loading) return <PageLoader />;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-700 to-brand-600 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 animate-float-slow rounded-full bg-white/10 blur-2xl"
        />
        <div className="container-app relative animate-fade-in-up py-10 sm:py-12">
          <p className="font-semibold uppercase tracking-wide text-brand-100">Keluarga Besar Soero Pramono</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">Peserta Terdaftar</h1>
          <p className="mt-3 max-w-xl text-lg text-brand-50">
            Daftar keluarga yang sudah mendaftar reuni, dikelompokkan per SP Induk.
          </p>
        </div>
      </section>

      <div className="container-app -mt-6 space-y-5 pb-12">
        {/* Ringkasan + pencarian */}
        <Card className="animate-fade-in-up stagger-1">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-3xl font-extrabold text-brand-700">
                <CountUp value={groups.length} />
              </p>
              <p className="text-sm text-slate-500">Kelompok SP Induk</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-brand-700">
                <CountUp value={totalPeople} />
              </p>
              <p className="text-sm text-slate-500">Total Peserta</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="🔍 Cari nama atau kode SP…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cari peserta"
            />
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              aria-label="Urutkan peserta"
              className="sm:w-56"
            >
              <option value="sp">Urutkan: Kode SP</option>
              <option value="name">Urutkan: Nama A–Z</option>
            </Select>
          </div>
          {isSearching && (
            <p className="field-hint">
              Menampilkan {shownPeople} peserta untuk “{query.trim()}”.
            </p>
          )}
        </Card>

        {groups.length === 0 && (
          <Card className="text-center text-slate-500">
            Belum ada peserta yang terdaftar. Jadilah yang pertama!
            <div className="mt-4">
              <Link to="/daftar">
                <Button>Mulai Pendaftaran</Button>
              </Link>
            </div>
          </Card>
        )}

        {groups.length > 0 && filtered.length === 0 && (
          <Card className="text-center text-slate-400">Tidak ada peserta yang cocok dengan pencarian.</Card>
        )}

        <div className="space-y-4">
          {shown.map((g) => {
                const open = isSearching || expanded.has(g.induk);
                return (
                  <Card key={g.induk} className="animate-fade-in-up !p-0">
                    <button
                      type="button"
                      onClick={() => toggle(g.induk)}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50"
                      aria-expanded={open}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}>▶</span>
                        <span className="font-mono text-lg font-extrabold text-brand-700">{g.induk}</span>
                        <Badge color="green">{g.participants.length} orang</Badge>
                      </span>
                    </button>

                    {open && (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {g.participants.map((p, i) => (
                          <li key={`${p.sp_code}-${i}`} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800">
                                {p.full_name}
                                {p.nickname ? <span className="font-normal text-slate-500"> ({p.nickname})</span> : null}
                              </p>
                              <p className="mt-0.5 font-mono text-sm text-slate-500">{p.sp_code}</p>
                            </div>
                            <div className="shrink-0 sm:text-right">
                              {/* Kontak SUDAH tersamar saat sampai di sini — lihat
                                  services.publicParticipants() di backend dan
                                  getPublicParticipants() di api.mock.ts. Jangan
                                  menyamarkan lagi di komponen ini: menyamarkan dua
                                  kali menghasilkan hasil yang berbeda dan menyesatkan. */}
                              {p.whatsapp_number ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-semibold text-slate-600"
                                  title="Nomor disamarkan demi privasi"
                                >
                                  💬 {p.whatsapp_number}
                                  <span className="sr-only"> (nomor disamarkan demi privasi)</span>
                                </span>
                              ) : p.email ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-semibold text-slate-600"
                                  title="Email disamarkan demi privasi"
                                >
                                  ✉ {p.email}
                                  <span className="sr-only"> (email disamarkan demi privasi)</span>
                                </span>
                              ) : (
                                <span className="text-sm text-slate-400">Kontak tidak tersedia</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
        </div>
      </div>
    </div>
  );
}
