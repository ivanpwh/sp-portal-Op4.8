// ---------------------------------------------------------------------------
// SP Portal — tata letak LAYAR BESAR undian (proyektor).
//
// Komponen presentasional: ia tidak memanggil API, tidak menyentuh
// BroadcastChannel, dan tidak memutar suara. Semua itu milik
// LotteryPresentPage. Dipisah supaya tata letak yang dilihat seluruh ruangan
// bisa diuji tanpa perlu memalsukan channel atau fullscreen API.
//
// Satu-satunya state lokal di sini adalah hiasan waktu (bilah progres & hitung
// mundur). Ia tidak memutuskan apa pun — kalau timer-nya melenceng sedikit dari
// timer tab kontrol, yang bergeser cuma animasinya, bukan pemenangnya.
//
// DUA PAGAR YANG TIDAK BOLEH DILANGGAR SAAT MEMPERCANTIK HALAMAN INI:
//
//  1. Proyektor mencuci warna. Gradien yang cantik di monitor bisa jadi bubur
//     abu-abu di dinding aula yang terang. Hiasan boleh berwarna; NAMA PEMENANG
//     tetap putih pekat di atas latar gelap pekat. Uji sebenarnya bukan
//     tangkapan layar, melainkan proyektor di ruangan terang.
//  2. `prefers-reduced-motion` dihormati penuh. Penonton acara ini banyak yang
//     lansia. Gerakan harus MATI, bukan sekadar melambat.
//
// PII: hanya full_name / nickname / sp_code. Layar ini terlihat oleh seluruh
// ruangan dan direkam ponsel tamu — jangan pernah menambahkan nomor WhatsApp,
// email, tanggal lahir, atau alamat ke sini.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import type { LotteryPoolParticipant, LotterySettings, LotteryWinner } from '../types';
import type { LotteryScreenMode } from '../lib/lotteryChannel';
import { LotteryReel } from './LotteryReel';
import { SafeBoundary, usePrefersReducedMotion } from './ui';

/** Hitung mundur hanya muncul bila durasinya memberi ruang untuk itu. */
const COUNTDOWN_WINDOW_MS = 3000;
/** Cukup halus untuk bilah progres, cukup jarang untuk tidak membebani render. */
const TICK_MS = 100;

interface LotteryStageProps {
  pool: LotteryPoolParticipant[];
  /** Pemenang yang masih aktif, terbaru dulu. */
  winners: LotteryWinner[];
  /** Batch yang baru saja diundi dan sedang diumumkan. */
  revealed: LotteryWinner[];
  spinning: boolean;
  settings: LotterySettings;
  mode: LotteryScreenMode;
  muted: boolean;
  /**
   * true = belum pernah menerima snapshot dari tab kontrol pada sesi ini, jadi
   * yang tampil berasal dari cache halaman. Ditandai supaya operator tahu layar
   * tidak sedang terhubung, alih-alih menampilkan angka usang diam-diam.
   */
  stale: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onSetMode: (mode: LotteryScreenMode) => void;
  /**
   * MC menekan "Mulai Undian" di panggung. Layar besar hanya MEMINTA lewat
   * BroadcastChannel; tab kontrol yang memanggil API — lihat lotteryChannel.ts.
   */
  onRequestDraw: () => void;
  /** Permintaan sudah dikirim, menunggu tab kontrol menjawab dengan 'draw-start'. */
  requesting: boolean;
  /** Tab kontrol tidak menjawab dalam batas waktu. */
  requestFailed: boolean;
}

/**
 * Warna latar mengikuti tahap acara.
 *
 * Perubahan suasananya sendiri sudah memberi tahu seisi ruangan apa yang sedang
 * terjadi — tenang saat siaga, menegang saat berputar, meledak saat pengumuman —
 * tanpa seorang pun perlu membaca tulisan di layar.
 */
const PHASE_BACKDROP: Record<string, string> = {
  idle: 'from-emerald-950/70 via-slate-950 to-slate-950',
  // Kuning keemasan, BUKAN amber gelap. Amber-900 di atas slate-950 mengendap
  // jadi cokelat kemerahan — apalagi lewat proyektor yang mencuci warna.
  spinning: 'from-amber-500/20 via-slate-950 to-slate-950',
  reveal: 'from-brand-700/40 via-amber-400/10 to-slate-950',
  wall: 'from-slate-800/60 via-slate-950 to-slate-950',
};

/**
 * Warna chip babak di papan pemenang — stabil per label, bukan acak per render.
 *
 * Tidak ada satu pun dari keluarga merah (red/rose/pink/fuchsia/orange): di
 * layar acara, merah dibaca sebagai peringatan atau kesalahan, bukan perayaan.
 * Kelimanya dipilih supaya tetap saling terbedakan dari jarak proyektor.
 */
const ROUND_TINTS = [
  'border-amber-400/30 bg-amber-400/10 text-amber-200',
  'border-brand-400/30 bg-brand-400/10 text-brand-200',
  'border-sky-400/30 bg-sky-400/10 text-sky-200',
  'border-violet-400/30 bg-violet-400/10 text-violet-200',
  'border-teal-400/30 bg-teal-400/10 text-teal-200',
];

function roundTint(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 997;
  return ROUND_TINTS[h % ROUND_TINTS.length];
}

export function LotteryStage({
  pool,
  winners,
  revealed,
  spinning,
  settings,
  mode,
  muted,
  stale,
  fullscreen,
  onToggleFullscreen,
  onSetMode,
  onRequestDraw,
  requesting,
  requestFailed,
}: LotteryStageProps) {
  const reduceMotion = usePrefersReducedMotion();
  const showWall = mode === 'wall';
  const announcing = revealed.length > 0 && !showWall;
  const recent = winners.slice(0, 4);

  const phaseKey = showWall ? 'wall' : announcing ? 'reveal' : spinning ? 'spinning' : 'idle';

  // Hiasan waktu selama reel berputar. Timer sendiri, bukan kiriman tab kontrol:
  // yang dipertaruhkan hanya animasi, dan menambah pesan lintas-tab per 100 ms
  // demi sebuah bilah progres jelas tidak sepadan.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!spinning || settings.durationMs <= 0) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), TICK_MS);
    return () => window.clearInterval(id);
  }, [spinning, settings.durationMs]);

  const remaining = Math.max(0, settings.durationMs - elapsed);
  const progress = settings.durationMs > 0 ? Math.min(1, elapsed / settings.durationMs) : 0;
  // Angka besar 3–2–1 hanya masuk akal kalau durasinya memang memberi ruang;
  // pada "Langsung" atau 3 detik pas, ia cuma akan berkedip sekali lalu hilang.
  const countdown =
    spinning && settings.durationMs > COUNTDOWN_WINDOW_MS && remaining > 0 && remaining <= COUNTDOWN_WINDOW_MS
      ? Math.ceil(remaining / 1000)
      : null;

  const drawBlockedBy = spinning
    ? 'Sedang mengundi…'
    : pool.length === 0
      ? 'Semua peserta sudah mendapat giliran'
      : null;

  const phase = showWall
    ? `Papan Pemenang · ${winners.length} orang`
    : announcing
      ? revealed.length > 1
        ? `Pemenang · ${revealed.length} orang`
        : 'Pemenang'
      : spinning
        ? 'Sedang Diundi'
        : 'Siap Diundi';

  return (
    <>
      {/* Lapisan latar. Murni hiasan, jadi aria-hidden dan di bawah segalanya —
          teks tidak pernah bergantung padanya untuk keterbacaan. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b transition-[background-image] duration-1000 ${PHASE_BACKDROP[phaseKey]}`}
      />
      {!reduceMotion && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-32 top-1/4 -z-10 h-96 w-96 animate-float-slow rounded-full bg-brand-500/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 bottom-1/4 -z-10 h-96 w-96 animate-float rounded-full bg-amber-500/10 blur-3xl"
          />
        </>
      )}

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight sm:text-3xl">Undian Reuni</h1>
          {settings.roundLabel ? (
            <p className="truncate text-lg font-bold text-amber-300 sm:text-2xl">
              {settings.roundLabel}
            </p>
          ) : null}
          <p className="text-sm text-white/60 sm:text-base">
            {pool.length} peserta masih di dalam undian · {winners.length} sudah menang
            {muted && ' · suara dimatikan'}
            {stale && ' · menunggu sambungan tab kontrol'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onSetMode(showWall ? 'idle' : 'wall')}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {showWall ? 'Kembali' : 'Papan Pemenang'}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {fullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 py-8">
        <p
          className={`text-center text-lg font-semibold uppercase tracking-[0.3em] sm:text-2xl ${
            announcing ? 'text-amber-300' : spinning ? 'text-amber-400/80' : 'text-brand-400'
          }`}
        >
          {phase}
        </p>

        {showWall ? (
          winners.length === 0 ? (
            <p className="text-2xl text-white/45">Belum ada pemenang untuk ditampilkan.</p>
          ) : (
            <ul className="grid w-full max-w-6xl grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {/* Urut terlama dulu: papan ini ditayangkan di akhir acara, dan
                  orang membacanya sebagai kronologi, bukan sebagai umpan berita. */}
              {winners
                .slice()
                .reverse()
                .map((w) => (
                  <li
                    key={w.id}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left"
                  >
                    <p className="truncate text-lg font-semibold sm:text-xl">{w.full_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-white/70">{w.sp_code}</span>
                      {w.round_label ? (
                        <span
                          className={`truncate rounded-full border px-2 py-0.5 text-xs font-semibold ${roundTint(w.round_label)}`}
                        >
                          {w.round_label}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          )
        ) : !spinning && !announcing ? (
          // Layar siaga. Tampil lama sekali selama sambutan, jadi isinya angka
          // yang benar-benar berguna — bukan kalimat "menunggu…".
          <div className="text-center">
            <p className="text-[clamp(3rem,14vw,10rem)] font-extrabold leading-none tabular-nums">
              {pool.length}
            </p>
            <p className="mt-2 text-xl text-white/60 sm:text-2xl">peserta siap diundi</p>
          </div>
        ) : (
          <div className="w-full max-w-6xl">
            {countdown !== null ? (
              // Selama tiga detik terakhir, angka mundur menggantikan nama yang
              // berputar: seluruh ruangan ikut menghitung, dan itu momen yang
              // paling sering direkam tamu.
              <p
                key={countdown}
                className={`text-center text-[clamp(6rem,26vw,20rem)] font-extrabold leading-none tabular-nums text-amber-300 ${
                  reduceMotion ? '' : 'animate-pop-in'
                }`}
              >
                {countdown}
              </p>
            ) : (
              <div
                className={
                  announcing && !reduceMotion
                    ? 'rounded-3xl ring-4 ring-amber-300/40 ring-offset-4 ring-offset-transparent'
                    : ''
                }
              >
                {/* Reel memakai canvas-confetti; bila gagal dirender, layar tetap
                    menampilkan sisa halaman alih-alih blank di depan tamu. */}
                <SafeBoundary
                  fallback={
                    <p className="text-center text-3xl font-bold">
                      {revealed[0]?.full_name ?? 'Menunggu undian…'}
                    </p>
                  }
                >
                  <LotteryReel
                    pool={pool}
                    spinning={spinning}
                    winners={revealed}
                    variant="dark"
                    durationMs={settings.durationMs}
                    scale={settings.scale}
                  />
                </SafeBoundary>
              </div>
            )}

            {spinning && settings.durationMs > 0 && (
              // Ketegangan yang terukur, bukan menunggu buta.
              <div
                className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-label="Sisa waktu undian"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
              >
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.round((1 - progress) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bilah kendali panggung.
          Sebelum ini, satu-satunya cara mengundi dari panggung adalah menekan
          spasi — dan pintasan itu hanya aktif di layar penuh. Di luar mode itu,
          MC yang berdiri di depan proyektor harus kembali ke tab kontrol untuk
          mengundi. Tombolnya sengaja besar: sering ditekan lewat layar sentuh
          tablet di samping panggung. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <button
          onClick={onRequestDraw}
          disabled={drawBlockedBy !== null || requesting}
          title={drawBlockedBy ?? undefined}
          className="rounded-2xl bg-brand-600 px-8 py-4 text-lg font-extrabold text-white shadow-lg shadow-brand-900/40 transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none sm:text-xl"
        >
          {requesting ? 'Meminta…' : 'Mulai Undian'}
        </button>
        <button
          onClick={() => onSetMode('idle')}
          className="rounded-2xl border border-white/20 px-6 py-4 text-base font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          Reset Tampilan
        </button>

        <p className="text-sm text-white/50">
          {drawBlockedBy ??
            (requestFailed
              ? 'Tab kontrol tidak menjawab — undi dari tab kontrol, atau buka ulang layar ini dari sana.'
              : fullscreen
                ? 'Spasi / tombol maju presenter juga bisa dipakai.'
                : 'Pintasan papan tik aktif saat layar penuh.')}
        </p>
      </div>

      {recent.length > 0 && !showWall && (
        <footer className="border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">
            Pemenang sebelumnya
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70 sm:text-base">
            {recent.map((w) => (
              <li key={w.id}>
                <span className="font-semibold text-white/90">{w.full_name}</span>{' '}
                <span className="font-mono text-amber-300/80">{w.sp_code}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </>
  );
}
