// ---------------------------------------------------------------------------
// SP Portal — reel undian, dipakai BERSAMA oleh halaman kontrol panitia
// (LotteryControlPage) dan layar besar (LotteryStage), supaya kedua tab
// menampilkan animasi yang identik.
//
// Bukan roda bersegmen (wheel-of-names): dengan ratusan peserta reuni, segmen
// roda tidak akan terbaca dari jarak proyektor. Pola yang dipakai adalah "reel"
// gaya mesin slot — nama berganti cepat lalu MELAMBAT, dan berhenti tepat di
// pemenang yang sudah ditentukan backend.
//
// Yang ditampilkan hanya full_name / nickname / sp_code. Halaman ini tayang di
// layar publik saat acara — JANGAN pernah menambahkan whatsapp_number, email,
// birth_date, atau address ke sini.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { LotteryNameScale, LotteryPoolParticipant, LotteryWinner } from '../types';
import { usePrefersReducedMotion } from './ui';

/**
 * Durasi bawaan animasi teatrikal, dari klik "Undi Sekarang" sampai pemenang
 * terungkap. Sejak durasi bisa dipilih panitia per babak, nilai ini hanya
 * DEFAULT — durasi sebenarnya datang sebagai prop dan, untuk tab layar besar,
 * lewat pesan 'draw-start'. Jangan menghitung ulang durasi di tempat lain:
 * Control menahan 'draw-result' selama nilai yang sama, dan kalau kedua sisi
 * memakai angka berbeda, kedua tab berhenti pada momen yang berbeda.
 */
export const DEFAULT_DRAW_ANIMATION_MS = 5000;

/**
 * Pilihan durasi yang ditawarkan di panel kontrol. 0 = tampilkan seketika.
 *
 * DEFAULT_DRAW_ANIMATION_MS **wajib** salah satu dari nilai di sini. Kalau
 * tidak, panel kontrol dibuka tanpa satu pun tombol durasi tersorot dan
 * kontrolnya terlihat rusak padahal berfungsi. Dijaga oleh uji di
 * src/lib/lotterySettings.test.ts.
 */
export const DRAW_DURATION_PRESETS = [0, 3000, 5000, 10000] as const;

// Jeda antar-nama di awal (cepat) dan di akhir (lambat). Deselerasi terjadi
// karena jeda tumbuh mengikuti easing, bukan konstan.
const FAST_TICK_MS = 55;
const SLOW_TICK_MS = 380;

/** Pengali ukuran nama di layar besar. Tiga tingkat sudah cukup — rakko.tools
 *  menawarkan sembilan, dan tidak ada panitia yang akan membedakan tingkat 6
 *  dari tingkat 7 di tengah acara. */
const SCALE_FACTOR: Record<LotteryNameScale, number> = {
  sedang: 0.78,
  besar: 1,
  raksasa: 1.3,
};

interface LotteryReelProps {
  /** Kandidat yang namanya diputar selama animasi. Boleh kosong. */
  pool: LotteryPoolParticipant[];
  /** true = sedang memutar nama (pemenang belum boleh ditampilkan). */
  spinning: boolean;
  /** Pemenang final; ditampilkan (dengan confetti) segera setelah di-set. */
  winners: LotteryWinner[];
  /** Gaya gelap kontras tinggi untuk proyektor, atau terang untuk panel admin. */
  variant?: 'light' | 'dark';
  /** Durasi putaran; menentukan seberapa cepat reel melambat. */
  durationMs?: number;
  /** Ukuran nama di layar besar. Diabaikan pada varian terang. */
  scale?: LotteryNameScale;
}

/** Kembalikan indeks acak yang berbeda dari indeks sekarang, agar nama terlihat berganti. */
function nextIndex(current: number, length: number): number {
  if (length <= 1) return 0;
  let i = Math.floor(Math.random() * length);
  if (i === current) i = (i + 1) % length;
  return i;
}

function fireConfetti(): void {
  // Dua burst dari sudut kiri & kanan bawah — menyapu tengah layar tempat kartu
  // pemenang berada, tanpa menutupi namanya.
  // Palet DIBERI EKSPLISIT: bawaan canvas-confetti memuat merah terang, dan di
  // layar acara merah dibaca sebagai peringatan, bukan perayaan. Hijau merek,
  // emas, dan putih senada dengan gradien panggung.
  //
  // Tanpa `as const`: tipe Options milik canvas-confetti meminta string[] yang
  // bisa diubah, sementara `as const` menjadikannya readonly tuple.
  const base = {
    particleCount: 90,
    spread: 70,
    startVelocity: 55,
    ticks: 220,
    colors: ['#22c55e', '#4ade80', '#fbbf24', '#ffffff'],
  };
  confetti({ ...base, origin: { x: 0.15, y: 0.75 }, angle: 60 });
  confetti({ ...base, origin: { x: 0.85, y: 0.75 }, angle: 120 });
}

/**
 * Ukuran font untuk satu nama, dalam satuan `clamp()` yang ikut lebar layar.
 *
 * Nama panjang dikecilkan otomatis. Tanpa ini, "Indah Permatasari Wijayakusuma"
 * pecah jadi tiga baris tepat di momen paling penting acara, sementara "Budi"
 * tampil mungil di layar yang sama.
 */
function nameFontSize(name: string, scale: LotteryNameScale, solo: boolean): string {
  const len = name.trim().length;
  const shrink = len > 26 ? 0.62 : len > 20 ? 0.74 : len > 14 ? 0.87 : 1;
  const k = SCALE_FACTOR[scale] * shrink * (solo ? 1 : 0.6);
  return `clamp(${(1.5 * k).toFixed(2)}rem, ${(6.4 * k).toFixed(2)}vw, ${(5.4 * k).toFixed(2)}rem)`;
}

export function LotteryReel({
  pool,
  spinning,
  winners,
  variant = 'light',
  durationMs = DEFAULT_DRAW_ANIMATION_MS,
  scale = 'besar',
}: LotteryReelProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  // Putaran nama. Jeda antar-nama tumbuh mengikuti easing kuadratik, sehingga
  // reel terasa melambat mendekati akhir alih-alih berhenti mendadak.
  // Rantai setTimeout, bukan setInterval: jedanya memang berubah tiap langkah.
  useEffect(() => {
    if (!spinning || reduceMotion || durationMs <= 0) return;
    const started = performance.now();
    let timer = 0;

    const tick = () => {
      const progress = Math.min(1, (performance.now() - started) / durationMs);
      setIndex((cur) => nextIndex(cur, poolRef.current.length));
      const gap = FAST_TICK_MS + (SLOW_TICK_MS - FAST_TICK_MS) * progress * progress;
      timer = window.setTimeout(tick, gap);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [spinning, reduceMotion, durationMs]);

  // Confetti hanya saat pemenang BARU muncul — bukan tiap render ulang (mis.
  // saat halaman Present menerima state-snapshot berisi pemenang yang sama).
  const key = winners.map((w) => w.id).join(',');
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!key || celebratedRef.current === key) return;
    celebratedRef.current = key;
    fireConfetti();
  }, [key]);

  const dark = variant === 'dark';
  const shell = dark
    ? 'border-white/15 bg-white/[0.06] text-white'
    : 'border-slate-200 bg-slate-50 text-slate-900';

  // Teks berjalan saat spinning, pemenang saat sudah ada, placeholder saat idle.
  // Dengan prefers-reduced-motion, fase spinning tidak menampilkan nama sama
  // sekali (tidak ada cycling) — hanya penanda proses, lalu pemenang muncul.
  const rolling = spinning && winners.length === 0 && !reduceMotion && durationMs > 0;
  const rollingEntry = rolling ? (poolRef.current[index] ?? null) : null;
  const solo = winners.length <= 1;

  return (
    <div
      className={`flex min-h-[9rem] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border px-4 py-8 text-center sm:min-h-[12rem] ${shell}`}
      // Hanya hasil akhir yang diumumkan pembaca layar; nama yang berputar akan
      // membanjiri antrean bicara tanpa menyampaikan informasi apa pun.
      aria-live="polite"
      aria-atomic="true"
    >
      {rollingEntry !== null ? (
        <>
          <p
            // key memaksa React memasang ulang elemen tiap nama berganti,
            // sehingga animasi masuk 'reel-tick' benar-benar diputar lagi.
            key={`roll-${index}`}
            className={`animate-reel-tick font-bold leading-tight ${dark ? 'text-white' : 'text-slate-900'}`}
            style={{ fontSize: dark ? nameFontSize(rollingEntry.full_name, scale, true) : undefined }}
          >
            {rollingEntry.full_name}
          </p>
          <p
            className={`font-mono font-semibold ${dark ? 'text-2xl text-brand-300 sm:text-4xl' : 'text-lg text-brand-700'}`}
          >
            {rollingEntry.sp_code}
          </p>
        </>
      ) : winners.length > 0 ? (
        <div className={`flex w-full flex-col items-center ${solo ? 'gap-2' : 'gap-4'}`}>
          {winners.map((w) => (
            <div key={w.id} className={reduceMotion ? 'animate-fade-in' : 'animate-pop-in'}>
              <p
                className={`font-bold leading-tight ${dark ? 'text-white' : 'text-slate-900'}`}
                style={{
                  fontSize: dark
                    ? nameFontSize(w.full_name, scale, solo)
                    : solo
                      ? undefined
                      : '1.35rem',
                }}
              >
                {w.full_name}
              </p>
              <p
                className={`font-mono font-semibold ${
                  dark
                    ? solo
                      ? 'text-2xl text-brand-300 sm:text-4xl'
                      : 'text-lg text-brand-300 sm:text-2xl'
                    : 'text-lg text-brand-700'
                }`}
              >
                {w.sp_code}
                {w.nickname ? ` · ${w.nickname}` : ''}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className={dark ? 'text-2xl text-white/60' : 'text-base text-slate-500'}>
          {spinning ? 'Mengundi…' : 'Menunggu undian dimulai…'}
        </p>
      )}
    </div>
  );
}
