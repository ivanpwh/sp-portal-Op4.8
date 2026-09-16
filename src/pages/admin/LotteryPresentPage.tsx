// ---------------------------------------------------------------------------
// SP Portal — Undian: HALAMAN LAYAR BESAR (/admin/undian/layar).
//
// Ditayangkan lewat proyektor/TV saat acara, jadi sengaja TANPA AdminLayout —
// tidak ada sidebar/header yang memakan ruang layar. Itu **bukan** berarti
// halaman ini publik: route-nya tetap dibungkus <RequireAuth> di App.tsx, sama
// seperti halaman admin lain. Dibuka dari tab kontrol lewat window.open, jadi
// token auth di localStorage (origin sama) ikut otomatis — tanpa login ulang.
//
// Halaman ini TIDAK PERNAH memanggil API undian. Ia menampilkan apa yang dikirim
// tab kontrol lewat BroadcastChannel dan, bila MC menekan spasi di atas panggung,
// MEMINTA undian lewat 'request-draw' — tab kontrol yang mengeksekusi. Dengan
// begitu kontrol tetap satu-satunya pemanggil backend.
//
// PII: hanya full_name / nickname / sp_code. Lihat catatan di LotteryStage.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LotteryPoolParticipant, LotterySettings, LotteryWinner } from '../../types';
import { DEFAULT_DRAW_ANIMATION_MS } from '../../components/LotteryReel';
import { LotteryStage } from '../../components/LotteryStage';
import { openLotteryChannel, type LotteryScreenMode } from '../../lib/lotteryChannel';
import { DEFAULT_LOTTERY_SETTINGS, normalizeSettings } from '../../lib/lotterySettings';

/**
 * Batas aman: bila 'draw-result' tak kunjung datang sekian lama setelah
 * 'draw-start' (tab kontrol ditutup, undian gagal di server, dsb.), hentikan
 * reel agar layar tidak memutar nama selamanya di depan tamu.
 */
const RESULT_GRACE_MS = 8000;

/**
 * Berapa lama menunggu tab kontrol menjawab permintaan undi dari panggung.
 *
 * Kalau tab kontrol sudah ditutup, 'request-draw' hilang tanpa jejak. Tanpa
 * batas waktu ini, tombol "Mulai Undian" akan menggantung di "Meminta…"
 * selamanya — persis kelakuan tombol rusak yang sudah pernah kita perbaiki
 * sekali di sisi kontrol.
 */
const REQUEST_TIMEOUT_MS = 3000;

/**
 * Cache pemulihan setelah muat ulang.
 *
 * Tanpa ini, satu refresh tak sengaja pada tab proyektor — atau tab kontrol yang
 * tertutup — membuat layar besar kosong total di depan tamu, karena seluruh
 * state-nya hanya datang lewat 'state-snapshot'. sessionStorage, bukan
 * localStorage: cache ini milik SATU tab proyektor dan tidak boleh bocor ke tab
 * lain atau bertahan setelah acara selesai.
 */
const SS_CACHE = 'sp.lottery_stage_cache';

interface StageCache {
  pool: LotteryPoolParticipant[];
  winners: LotteryWinner[];
  settings: LotterySettings;
  muted: boolean;
}

function readCache(): StageCache | null {
  try {
    const raw = sessionStorage.getItem(SS_CACHE);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StageCache>;
    if (!Array.isArray(v.pool) || !Array.isArray(v.winners)) return null;
    return {
      pool: v.pool,
      winners: v.winners,
      settings: normalizeSettings(v.settings),
      muted: Boolean(v.muted),
    };
  } catch {
    // Cache rusak/kedaluwarsa tidak boleh membuat layar gagal render — lebih
    // baik mulai kosong dan menunggu snapshot.
    return null;
  }
}

function writeCache(cache: StageCache): void {
  try {
    sessionStorage.setItem(SS_CACHE, JSON.stringify(cache));
  } catch {
    // Penuh atau ditolak — pemulihan hilang, tampilan tidak.
  }
}

export default function LotteryPresentPage() {
  const cached = useRef(readCache()).current;

  const [pool, setPool] = useState<LotteryPoolParticipant[]>(cached?.pool ?? []);
  const [winners, setWinners] = useState<LotteryWinner[]>(cached?.winners ?? []);
  const [settings, setSettings] = useState<LotterySettings>(
    cached?.settings ?? DEFAULT_LOTTERY_SETTINGS,
  );
  const [muted, setMuted] = useState(cached?.muted ?? false);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState<LotteryWinner[]>([]);
  const [mode, setMode] = useState<LotteryScreenMode>('idle');
  const [fullscreen, setFullscreen] = useState(false);
  // Sudah pernah menerima snapshot pada sesi ini? Kalau belum dan kita punya
  // cache, yang tampil adalah data lama — katakan itu, jangan diam-diam.
  const [synced, setSynced] = useState(false);
  // Permintaan undi dari panggung: sudah dikirim, belum dijawab 'draw-start'.
  const [requesting, setRequesting] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const watchdogRef = useRef(0);
  const requestTimerRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof openLotteryChannel> | null>(null);
  // Dibaca dari dalam handler channel & handler papan tik, yang dipasang sekali
  // saat mount dan karena itu tidak boleh menutup nilai state dari render awal.
  const spinningRef = useRef(false);
  spinningRef.current = spinning;
  const winnersRef = useRef(winners);
  winnersRef.current = winners;

  const clearWatchdog = useCallback(() => {
    window.clearTimeout(watchdogRef.current);
    watchdogRef.current = 0;
  }, []);

  useEffect(() => {
    const channel = openLotteryChannel((msg) => {
      switch (msg.type) {
        case 'draw-start':
          // Tab kontrol menjawab — apa pun yang memicunya (tombol di sini, spasi,
          // atau klik di tab kontrol).
          window.clearTimeout(requestTimerRef.current);
          setRequesting(false);
          setRequestFailed(false);
          setRevealed([]);
          setMode('idle');
          setSpinning(true);
          clearWatchdog();
          watchdogRef.current = window.setTimeout(
            () => setSpinning(false),
            (msg.durationMs || DEFAULT_DRAW_ANIMATION_MS) + RESULT_GRACE_MS,
          );
          break;
        case 'draw-result':
          clearWatchdog();
          setSpinning(false);
          setRevealed(msg.winners);
          setMode('idle');
          break;
        case 'state-snapshot':
          setPool(msg.pool);
          setWinners(msg.winners);
          setSettings(normalizeSettings(msg.settings));
          setMuted(msg.muted);
          setSynced(true);
          writeCache({
            pool: msg.pool,
            winners: msg.winners,
            settings: msg.settings,
            muted: msg.muted,
          });
          // Sengaja TIDAK menyentuh `revealed`: snapshot memperbarui daftar dan
          // angka, bukan apa yang sedang diumumkan. Kalau ia ikut mengubahnya,
          // snapshot yang datang di tengah putaran akan membocorkan pemenang
          // sebelum reel berhenti.
          break;
        case 'screen':
          if (msg.mode === 'replay') {
            setMode('idle');
            // Ulangi pengumuman terakhir: tampilkan lagi pemenang yang sudah
            // ada, tanpa mengundi apa pun.
            setRevealed((cur) => (cur.length > 0 ? cur : winnersRef.current.slice(0, 1)));
          } else {
            setMode(msg.mode);
            if (msg.mode === 'idle') setRevealed([]);
          }
          break;
        case 'request-snapshot':
        case 'request-draw':
          // Dikirim oleh/untuk tab lain; layar besar tidak menanggapinya.
          break;
      }
    });
    channelRef.current = channel;

    // Tab ini bisa dibuka setelah undian berjalan — minta state terkini.
    channel.post({ type: 'request-snapshot' });

    return () => {
      channel.close();
      channelRef.current = null;
      clearWatchdog();
      window.clearTimeout(requestTimerRef.current);
    };
  }, [clearWatchdog]);

  // Ikuti perubahan fullscreen dari mana pun (tombol di bawah, F11, atau Escape).
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /**
   * Minta tab kontrol menjalankan undian.
   *
   * Panggung TIDAK PERNAH memanggil API undian sendiri — invarian itu yang
   * menjamin tidak ada dua tab yang mengundi bersamaan. Yang dikirim hanyalah
   * permintaan; tab kontrol punya pagar sendiri (menolak saat undian berjalan,
   * plus jeda 1,5 detik) sebelum mengeksekusinya.
   */
  const requestDraw = useCallback(() => {
    if (spinningRef.current) return;
    setRequestFailed(false);
    setRequesting(true);
    channelRef.current?.post({ type: 'request-draw' });

    window.clearTimeout(requestTimerRef.current);
    requestTimerRef.current = window.setTimeout(() => {
      // Tidak ada 'draw-start' yang datang: tab kontrol tertutup, atau sedang
      // menolak permintaan ini. Katakan, jangan biarkan tombolnya menggantung.
      setRequesting(false);
      setRequestFailed(true);
    }, REQUEST_TIMEOUT_MS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      // Bisa ditolak browser (mis. tanpa gesture pengguna) — abaikan diam-diam,
      // halaman tetap tampil normal di jendela biasa.
      void rootRef.current?.requestFullscreen().catch(() => undefined);
    }
  }, []);

  /**
   * Pintasan papan tik HANYA aktif saat layar penuh.
   *
   * Di luar mode itu, halaman ini bisa terbuka di tab biasa sementara panitia
   * mengetik di tab lain; menyambar spasi di situ akan memicu undian yang tidak
   * diminta siapa pun. Presenter remote di panggung mengirim PageDown / panah
   * kanan, jadi keduanya diperlakukan sama dengan spasi.
   */
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'PageDown':
        case 'ArrowRight':
          e.preventDefault();
          // Jalur yang sama persis dengan tombol "Mulai Undian" — termasuk
          // penanda menunggu dan batas waktunya.
          requestDraw();
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          setMode((m) => (m === 'wall' ? 'idle' : 'wall'));
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setMode('idle');
          setRevealed([]);
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setMode('idle');
          setRevealed((cur) => (cur.length > 0 ? cur : winnersRef.current.slice(0, 1)));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, requestDraw]);

  return (
    <div
      ref={rootRef}
      // `isolate` WAJIB: tanpanya lapisan gradien ber-`-z-10` di LotteryStage
      // tercetak di belakang `bg-slate-950` milik div ini dan tidak terlihat
      // sama sekali — kecuali di layar penuh, yang membentuk stacking context
      // sendiri. Lihat uji "latar bergradien terlihat di kedua mode".
      className="relative isolate flex min-h-screen flex-col overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10"
    >
      <LotteryStage
        pool={pool}
        winners={winners}
        revealed={revealed}
        spinning={spinning}
        settings={settings}
        mode={mode}
        muted={muted}
        stale={!synced && cached !== null}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onSetMode={(m) => {
          setMode(m);
          if (m === 'idle') setRevealed([]);
        }}
        onRequestDraw={requestDraw}
        requesting={requesting}
        requestFailed={requestFailed}
      />

      {fullscreen && (
        <p className="pt-3 text-center text-xs text-white/30">
          Spasi / tombol maju presenter: undi · W: papan pemenang · C: bersihkan layar · R: ulangi
        </p>
      )}
    </div>
  );
}
