import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicParticipants } from '../../lib/api';
import type { PublicSpIndukGroup } from '../../types';
import { Badge, Button, Card, CountUp, Input, PageLoader } from '../../components/ui';
import { maskWhatsApp } from '../../lib/format';

export default function ParticipantsPage() {
  const [groups, setGroups] = useState<PublicSpIndukGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
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
          <div className="mt-4">
            <Input
              placeholder="🔍 Cari nama atau kode SP…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Cari peserta"
            />
            {isSearching && (
              <p className="field-hint">
                Menampilkan {shownPeople} peserta untuk “{query.trim()}”.
              </p>
            )}
          </div>
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
          {filtered.map((g) => {
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
                              {p.whatsapp_number ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-semibold text-slate-600"
                                  title="Nomor disamarkan demi privasi"
                                >
                                  💬 {maskWhatsApp(p.whatsapp_number)}
                                  <span className="sr-only"> (nomor disamarkan demi privasi)</span>
                                </span>
                              ) : p.email ? (
                                <a
                                  href={`mailto:${p.email}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                                >
                                  ✉ {p.email}
                                </a>
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
