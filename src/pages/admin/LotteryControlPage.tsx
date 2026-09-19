// ---------------------------------------------------------------------------
// SP Portal — Undian: HALAMAN KONTROL PANITIA (/admin/undian).
//
// Halaman inilah SATU-SATUNYA yang memanggil endpoint /api/admin/lottery/*.
// Halaman layar besar (LotteryPresentPage) murni menampilkan apa yang dikirim
// dari sini lewat BroadcastChannel — lihat src/lib/lotteryChannel.ts. Layar besar
// boleh MEMINTA undian ('request-draw', mis. MC menekan spasi di panggung), tapi
// eksekusinya tetap di sini.
//
// PII: hanya full_name / nickname / sp_code yang dirender di sini. Jangan
// menambahkan whatsapp_number / email / birth_date / address.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  drawLotteryWinner,
  getLotteryPool,
  getLotteryWinners,
  resetLottery,
  undoLastLotteryDraw,
  voidLotteryWinner,
} from '../../lib/api';
import type {
  LotteryEffect,
  LotteryNameScale,
  LotteryPoolParticipant,
  LotteryPreset,
  LotterySettings,
  LotteryWinner,
} from '../../types';
import { MAX_LOTTERY_DRAW_COUNT } from '../../types';
import { Alert, Badge, Button, Card, Input, Modal, PageLoader } from '../../components/ui';
import { DRAW_DURATION_PRESETS, LotteryReel } from '../../components/LotteryReel';
import { openLotteryChannel, type LotteryChannel } from '../../lib/lotteryChannel';
import {
  DEFAULT_LOTTERY_SETTINGS,
  MAX_LOTTERY_PRESETS,
  deletePreset,
  loadPresets,
  loadSettings,
  restorePresets,
  savePreset,
  saveSettings,
} from '../../lib/lotterySettings';
import { isMuted, playDrumroll, playFanfare, setMuted, stopAllLotterySound } from '../../lib/lotterySound';
import { SP_INDUK_RE, compareSpCode, formatDateTime, spInduk } from '../../lib/format';

// Kata yang harus diketik ulang sebelum tombol reset aktif. Reset mengosongkan
// SELURUH daftar pemenang dan tidak bisa dibatalkan oleh undo, jadi satu klik
// OK/Cancel biasa sengaja TIDAK cukup di sini.
const RESET_PHRASE = 'RESET';

const PRESENT_PATH = '/admin/undian/layar';

/** Jeda minimum antar-undian yang dipicu dari panggung. Tombol presenter remote
 *  gampang tertekan dua kali, dan undian ganda tak sengaja tidak bisa ditarik
 *  kembali tanpa drama di depan tamu. */
const REQUEST_DRAW_COOLDOWN_MS = 1500;

const COUNT_PRESETS = [1, 3, 5] as const;

const DURATION_LABEL: Record<number, string> = {
  0: 'Langsung',
  3000: '3 dtk',
  5000: '5 dtk',
  10000: '10 dtk',
};

const SCALE_LABEL: Record<LotteryNameScale, string> = {
  sedang: 'Sedang',
  besar: 'Besar',
  raksasa: 'Raksasa',
};

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Peserta yang benar-benar ikut diundi pada filter kelompok ini.
 *
 * DAFTAR KOSONG = SEMUA KELOMPOK IKUT. Itu bentuk kanonik yang sama dipakai
 * backend, dan alasan halaman ini tidak pernah membiarkan panitia mengosongkan
 * seluruh centang: centang kosong akan berarti "semua", persis kebalikan dari
 * yang dimaksud.
 *
 * Ini SEMATA untuk tampilan — reel, hitungan, dan layar besar. Yang menentukan
 * siapa boleh menang tetap filter yang ikut terkirim ke POST /lottery/draw, dan
 * server menyaring ulang pool-nya sendiri di dalam transaksi.
 */
function filterPool(
  pool: LotteryPoolParticipant[],
  induk: string[],
): LotteryPoolParticipant[] {
  if (induk.length === 0) return pool;
  const wanted = new Set(induk);
  return pool.filter((p) => wanted.has(spInduk(p.sp_code)));
}

/** Sekelompok tombol pilihan tunggal. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  // id tidak boleh mengandung spasi: aria-labelledby memisahkan nilainya per
  // spasi, jadi "seg-Jumlah pemenang" terbaca sebagai dua id yang tak ada.
  const groupId = 'seg-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div>
      <span className="field-label mb-1.5 block" id={groupId}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex gap-1 rounded-xl border border-slate-300 bg-slate-100 p-1"
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              o.value === value
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LotteryControlPage() {
  const [pool, setPool] = useState<LotteryPoolParticipant[]>([]);
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState<LotteryWinner[]>([]);
  const [partialNote, setPartialNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());

  const [settings, setSettings] = useState<LotterySettings>(DEFAULT_LOTTERY_SETTINGS);
  const [presets, setPresets] = useState<LotteryPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [copyNote, setCopyNote] = useState<{ text: string; ok: boolean } | null>(null);

  // Apakah tab layar besar pernah menyapa pada sesi ini? Dipakai hanya untuk
  // memberi tahu operator, bukan untuk memblokir tombol: tab yang ditutup
  // diam-diam tidak bisa dideteksi tanpa heartbeat, dan menonaktifkan tombol
  // berdasarkan tebakan lebih menyesatkan daripada membiarkannya.
  const [stageSeen, setStageSeen] = useState(false);

  const [undoOpen, setUndoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTyped, setResetTyped] = useState('');

  const channelRef = useRef<LotteryChannel | null>(null);
  const toastTimer = useRef(0);
  const lastRequestRef = useRef(0);
  // Snapshot state terkini untuk dibaca dari dalam handler BroadcastChannel —
  // handler itu dipasang sekali saat mount, jadi ia tidak boleh menutup (closure)
  // nilai state dari render pertama.
  const stateRef = useRef({ pool, winners, muted, settings, drawing, busy });
  stateRef.current = { pool, winners, muted, settings, drawing, busy };

  // Muat pengaturan & preset sekali; keduanya murni lokal (localStorage).
  useEffect(() => {
    setSettings(loadSettings());
    setPresets(loadPresets());
  }, []);

  // ----- filter kelompok SP -------------------------------------------------

  const selectedInduk = settings.induk;
  const filterOn = selectedInduk.length > 0;

  /**
   * Kelompok SP di dalam pool beserta jumlah anggotanya, urut alami.
   *
   * Kelompok yang masih tercentang tapi sudah habis (semua anggotanya menang)
   * tetap ditampilkan dengan hitungan 0. Kalau dibuang dari daftar, centangnya
   * tetap berlaku di balik layar tanpa ada lagi kotak untuk melepasnya.
   */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const code of selectedInduk) counts.set(code, 0);
    for (const p of pool) {
      const induk = spInduk(p.sp_code);
      // spInduk() mengembalikan '—' untuk kode SP yang tidak terbaca. Kelompok
      // semu itu tidak boleh bisa dicentang: server menolaknya dengan 422.
      if (SP_INDUK_RE.test(induk)) counts.set(induk, (counts.get(induk) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([induk, count]) => ({ induk, count }))
      .sort((a, b) => compareSpCode(a.induk, b.induk));
  }, [pool, selectedInduk]);

  const activePool = useMemo(() => filterPool(pool, selectedInduk), [pool, selectedInduk]);

  /** Peserta yang kode SP-nya tidak terbaca — hanya ikut saat filter dimatikan. */
  const unfilterable = useMemo(
    () => pool.filter((p) => !SP_INDUK_RE.test(spInduk(p.sp_code))).length,
    [pool],
  );

  function toggleInduk(code: string) {
    const all = groups.map((g) => g.induk);
    const current = filterOn ? selectedInduk : all;
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    // Mengosongkan SELURUH centang tidak diizinkan: daftar kosong berarti "semua
    // kelompok ikut", jadi melepas centang terakhir justru akan melebarkan
    // undian — kebalikan dari yang dimaksud panitia saat menekannya.
    if (next.length === 0) return;
    // Semua tercentang sama artinya dengan tidak memfilter, dan disimpan sebagai
    // daftar kosong supaya kelompok yang baru mendaftar setelah ini ikut sendiri.
    updateSettings({
      induk: next.length === all.length ? [] : next.slice().sort(compareSpCode),
    });
  }

  function showToast(text: string, undo?: () => void) {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }

  const broadcastSnapshot = useCallback(() => {
    const s = stateRef.current;
    channelRef.current?.post({
      type: 'state-snapshot',
      // Layar besar menerima pool yang SUDAH tersaring: ia menampilkan sisa
      // peserta dan memutar nama dari daftar ini, jadi mengirim pool penuh akan
      // membuat proyektor memutar nama dari kelompok yang tidak ikut diundi.
      pool: filterPool(s.pool, s.settings.induk),
      winners: s.winners,
      settings: s.settings,
      muted: s.muted,
    });
  }, []);

  // Ambil ulang pool + riwayat dari sumber kebenaran (backend/mock), lalu
  // kembalikan nilainya agar pemanggil bisa langsung mem-broadcast snapshot
  // tanpa menunggu render berikutnya.
  const refresh = useCallback(async () => {
    const [p, w] = await Promise.all([getLotteryPool(), getLotteryWinners()]);
    setPool(p);
    setWinners(w);
    stateRef.current = { ...stateRef.current, pool: p, winners: w };
    return { pool: p, winners: w };
  }, []);

  const drawRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const channel = openLotteryChannel((msg) => {
      if (msg.type === 'request-snapshot') {
        setStageSeen(true);
        broadcastSnapshot();
        return;
      }
      if (msg.type === 'request-draw') {
        setStageSeen(true);
        // Layar besar hanya MEMINTA. Dua pagar sebelum dieksekusi: undian yang
        // sedang berjalan, dan jeda minimum — presenter remote gampang
        // tertekan dua kali, dan undian ganda tak sengaja tidak bisa ditarik
        // kembali tanpa drama di depan tamu. Transaksi Serializable di backend
        // adalah jaring terakhir, bukan pertahanan pertama.
        const s = stateRef.current;
        const now = Date.now();
        if (s.drawing || s.busy) return;
        if (filterPool(s.pool, s.settings.induk).length === 0) return;
        if (now - lastRequestRef.current < REQUEST_DRAW_COOLDOWN_MS) return;
        lastRequestRef.current = now;
        drawRef.current();
      }
    });
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
      stopAllLotterySound();
      window.clearTimeout(toastTimer.current);
    };
  }, [broadcastSnapshot]);

  useEffect(() => {
    let alive = true;
    refresh()
      .catch((e) => {
        if (alive) setError(errorMessage(e, 'Gagal memuat data undian.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  // Setelah muat awal selesai, beri tahu tab layar besar (bila sudah terbuka).
  useEffect(() => {
    if (!loading) broadcastSnapshot();
  }, [loading, broadcastSnapshot]);

  function updateSettings(patch: Partial<LotterySettings>) {
    const next = { ...stateRef.current.settings, ...patch };
    setSettings(next);
    stateRef.current = { ...stateRef.current, settings: next };
    saveSettings(next);
    broadcastSnapshot();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    stateRef.current = { ...stateRef.current, muted: next };
    if (next) stopAllLotterySound();
    broadcastSnapshot();
  }

  const SCREEN_LABEL: Record<string, string> = {
    idle: 'Layar dibersihkan',
    wall: 'Papan pemenang ditampilkan',
    replay: 'Pengumuman terakhir diulang',
  };

  /**
   * Buka tab layar besar.
   *
   * Sengaja TANPA 'noopener': tanpa itu window.open selalu mengembalikan null,
   * sehingga pemblokiran popup tidak bisa dibedakan dari keberhasilan — dan
   * tombol ini jadi terlihat rusak. Halaman tujuannya adalah halaman kita
   * sendiri di origin yang sama, jadi akses opener tidak menambah risiko.
   */
  function openStage() {
    const w = window.open(PRESENT_PATH, '_blank');
    if (!w) {
      setError(
        'Browser memblokir jendela baru. Izinkan popup untuk situs ini, lalu coba lagi — ' +
          'atau buka /admin/undian/layar secara manual di tab baru.',
      );
      return;
    }
    setError(null);
  }

  function sendScreen(mode: 'idle' | 'wall' | 'replay') {
    channelRef.current?.post({ type: 'screen', mode });
    // Perintah ini tidak mengubah apa pun di tab INI, jadi tanpa umpan balik
    // ia tak bisa dibedakan dari tombol rusak.
    showToast(
      stageSeen
        ? `${SCREEN_LABEL[mode]} di layar besar.`
        : 'Perintah dikirim, tapi tab layar besar belum terdeteksi — buka dulu lewat tombol di atas.',
    );
  }

  /**
   * Alur undian (lihat juga komentar di lotteryChannel.ts):
   *   1. broadcast 'draw-start' → kedua tab mulai memutar nama.
   *   2. POST /lottery/draw SEKALI — backend menentukan pemenang secara instan.
   *   3. tahan hasilnya sampai durasi berlalu DIHITUNG DARI langkah 1, bukan
   *      dari selesainya request; kalau tidak, jaringan lambat akan
   *      memperpanjang animasi dan membuat kedua tab tidak sinkron.
   *   4. ungkap pemenang + fanfare + confetti, lalu broadcast 'draw-result'.
   */
  const draw = useCallback(async () => {
    const s = stateRef.current;
    const { durationMs, effect, count, roundLabel, induk } = s.settings;
    if (s.drawing || s.busy || filterPool(s.pool, induk).length === 0) return;

    setError(null);
    setPartialNote(null);
    setRevealed([]);
    setDrawing(true);
    stateRef.current = { ...stateRef.current, drawing: true };
    channelRef.current?.post({ type: 'draw-start', count, durationMs });
    playDrumroll(durationMs, effect);
    const started = performance.now();

    try {
      const res = await drawLotteryWinner({ count, round_label: roundLabel, induk });
      const left = durationMs - (performance.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));

      setRevealed(res.winners);
      if (res.requested > res.winners.length) {
        setPartialNote(
          `Peserta tersisa tidak cukup — ${res.winners.length} dari ${res.requested} pemenang berhasil diundi.`,
        );
      }
      playFanfare(effect);
      channelRef.current?.post({
        type: 'draw-result',
        winners: res.winners,
        remaining: res.remaining,
        requested: res.requested,
      });

      await refresh();
      broadcastSnapshot();
    } catch (e) {
      stopAllLotterySound();
      setError(errorMessage(e, 'Undian gagal. Coba lagi.'));
      // Snapshot juga mengakhiri fase "berputar" di tab layar besar, supaya ia
      // tidak terus memutar nama setelah undian gagal.
      sendScreen('idle');
      broadcastSnapshot();
    } finally {
      setDrawing(false);
      stateRef.current = { ...stateRef.current, drawing: false };
    }
  }, [refresh, broadcastSnapshot]);

  drawRef.current = () => void draw();

  async function applyAndSync(action: () => Promise<unknown>, fallbackError: string) {
    setBusy(true);
    stateRef.current = { ...stateRef.current, busy: true };
    setError(null);
    try {
      await action();
      setRevealed([]);
      setPartialNote(null);
      await refresh();
      broadcastSnapshot();
      return true;
    } catch (e) {
      setError(errorMessage(e, fallbackError));
      return false;
    } finally {
      setBusy(false);
      stateRef.current = { ...stateRef.current, busy: false };
    }
  }

  async function confirmUndo() {
    const ok = await applyAndSync(undoLastLotteryDraw, 'Gagal membatalkan undian terakhir.');
    if (ok) {
      setUndoOpen(false);
      sendScreen('idle');
    }
  }

  async function returnWinner(w: LotteryWinner) {
    const ok = await applyAndSync(
      () => voidLotteryWinner(w.id, 'manual'),
      'Gagal mengembalikan pemenang ke undian.',
    );
    if (ok) showToast(`${w.full_name} kembali masuk ke undian.`);
  }

  async function confirmReset() {
    if (resetTyped.trim().toUpperCase() !== RESET_PHRASE) return;
    const ok = await applyAndSync(resetLottery, 'Gagal mereset undian.');
    if (ok) {
      setResetOpen(false);
      setResetTyped('');
      sendScreen('idle');
    }
  }

  // ----- preset -------------------------------------------------------------

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) return;
    const next = savePreset(name, settings);
    if (next === null) {
      showToast(
        presets.length >= MAX_LOTTERY_PRESETS && !presets.some((p) => p.name === name)
          ? `Hanya bisa menyimpan ${MAX_LOTTERY_PRESETS} preset. Hapus salah satu dulu.`
          : 'Gagal menyimpan preset. Penyimpanan browser mungkin penuh atau diblokir.',
      );
      return;
    }
    setPresets(next);
    setPresetName('');
    showToast(`Preset "${name}" disimpan.`);
  }

  function handleDeletePreset(p: LotteryPreset) {
    const before = presets;
    setPresets(deletePreset(p.name));
    // Menghapus preset di tengah acara mahal harganya, jadi selalu sediakan
    // jalan kembali alih-alih dialog konfirmasi yang memperlambat.
    showToast(`Preset "${p.name}" dihapus.`, () => {
      setPresets(restorePresets(before));
      setToast(null);
    });
  }

  function applyPreset(p: LotteryPreset) {
    const { name: _name, ...rest } = p;
    void _name;
    updateSettings(rest);
  }

  // ----- salin daftar -------------------------------------------------------

  async function copyWinners() {
    const text = winners
      .slice()
      .reverse()
      .map(
        (w, i) =>
          `${i + 1}. ${w.full_name} (${w.sp_code})${w.round_label ? ` — ${w.round_label}` : ''}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote({ text: `Disalin — ${winners.length} baris.`, ok: true });
    } catch {
      // Izin papan klip bisa ditolak browser. Katakan apa yang bisa dilakukan
      // berikutnya, jangan cuma "gagal".
      setCopyNote({
        text: 'Gagal menyalin. Izin papan klip mungkin ditolak — pilih daftarnya lalu salin manual.',
        ok: false,
      });
    }
  }

  if (loading) return <PageLoader label="Memuat data undian…" />;

  // "Kosong" selalu berarti kosong SETELAH filter: itulah daftar yang benar-benar
  // diundi, dan tombol undi harus mati saat daftar itu habis walau pool penuh.
  const empty = activePool.length === 0;
  const isCustomCount = !COUNT_PRESETS.includes(settings.count as (typeof COUNT_PRESETS)[number]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Undian Peserta</h1>
          <p className="text-sm text-slate-500">
            Undi satu atau beberapa pemenang dari peserta yang akan hadir. Peserta yang sudah menang
            otomatis keluar dari undian berikutnya.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={toggleMute} aria-pressed={muted}>
            {muted ? 'Suara: Mati' : 'Suara: Aktif'}
          </Button>
          <Button variant="secondary" size="sm" onClick={openStage}>
            Buka Tampilan Layar Besar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Terjadi kesalahan">
          {error}
        </Alert>
      )}

      <Card className="space-y-5">
        <div>
          <label className="field-label mb-1.5 block" htmlFor="round-label">
            Babak / hadiah
          </label>
          <Input
            id="round-label"
            value={settings.roundLabel}
            maxLength={60}
            autoComplete="off"
            placeholder="mis. Doorprize Kipas Angin"
            onChange={(e) => updateSettings({ roundLabel: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-500">
            Tampil di proyektor dan tersimpan di riwayat — jangan tulis nama atau nomor telepon di
            sini.
          </p>
        </div>

        <div>
          <span className="field-label mb-1.5 block">Preset babak</span>
          <div className="flex flex-wrap items-center gap-2">
            {presets.length === 0 ? (
              <span className="text-sm text-slate-500">Belum ada preset tersimpan.</span>
            ) : (
              presets.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-700"
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus preset ${p.name}`}
                    onClick={() => handleDeletePreset(p)}
                    className="border-l border-slate-300 px-2 text-slate-400 hover:bg-red-50 hover:text-red-700"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={presetName}
              maxLength={28}
              autoComplete="off"
              placeholder="Nama preset, mis. Hadiah Utama"
              onChange={(e) => setPresetName(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Simpan
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Menyimpan babak, jumlah, durasi, ukuran, dan efek sekaligus. Tersimpan di browser ini
            saja, bukan di server.
          </p>
        </div>

        {/* Filter kelompok SP. Ikut tersimpan di preset babak, sehingga satu
            preset bisa berarti "Doorprize SP1-SP3" lengkap dengan durasi dan
            jumlah pemenangnya. */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <span className="field-label">Kelompok SP yang ikut undian</span>
            <button
              type="button"
              onClick={() => updateSettings({ induk: [] })}
              disabled={!filterOn || drawing || busy}
              className="text-xs font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
            >
              Ikutkan semua kelompok
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada kelompok SP di dalam undian.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => {
                const checked = !filterOn || selectedInduk.includes(g.induk);
                // Centang terakhir dikunci, bukan diam-diam ditolak saat diklik.
                const last = checked && (filterOn ? selectedInduk.length : groups.length) === 1;
                return (
                  <label
                    key={g.induk}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      checked ? 'border-brand-300 bg-brand-50' : 'border-slate-300 bg-white'
                    } ${last ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-brand-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={drawing || busy || last}
                      onChange={() => toggleInduk(g.induk)}
                      className="h-4 w-4 rounded border-slate-400 text-brand-700 focus:ring-brand-600"
                    />
                    <span className="font-mono font-bold text-brand-700">{g.induk}</span>
                    <span className="ml-auto text-xs text-slate-500">{g.count} peserta</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {filterOn
              ? `Hanya ${selectedInduk.join(', ')} yang bisa terundi — ${activePool.length} dari ${pool.length} peserta.`
              : 'Semua kelompok ikut. Lepas centang untuk membatasi undian ke kelompok tertentu.'}
            {unfilterable > 0 &&
              ` ${unfilterable} peserta dengan kode SP tak terbaca hanya ikut saat semua kelompok diikutkan.`}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Segmented
              label="Jumlah pemenang"
              value={isCustomCount ? 'custom' : String(settings.count)}
              options={[
                ...COUNT_PRESETS.map((c) => ({ value: String(c), label: String(c) })),
                { value: 'custom', label: 'Lainnya' },
              ]}
              disabled={drawing || busy}
              onChange={(v) =>
                updateSettings({ count: v === 'custom' ? Math.max(2, settings.count) : Number(v) })
              }
            />
            {isCustomCount && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={MAX_LOTTERY_DRAW_COUNT}
                  value={settings.count}
                  aria-label="Jumlah pemenang"
                  className="w-24"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      updateSettings({
                        count: Math.max(1, Math.min(MAX_LOTTERY_DRAW_COUNT, Math.floor(n))),
                      });
                    }
                  }}
                />
                <span className="text-xs text-slate-500">
                  maksimal {MAX_LOTTERY_DRAW_COUNT} — lebih dari itu tidak terbaca dari kursi
                  belakang
                </span>
              </div>
            )}
          </div>

          <Segmented
            label="Waktu hingga pengumuman"
            value={String(settings.durationMs)}
            options={DRAW_DURATION_PRESETS.map((d) => ({
              value: String(d),
              label: DURATION_LABEL[d] ?? `${d / 1000} dtk`,
            }))}
            disabled={drawing || busy}
            onChange={(v) => updateSettings({ durationMs: Number(v) })}
          />

          <Segmented
            label="Ukuran nama di layar"
            value={settings.scale}
            options={(['sedang', 'besar', 'raksasa'] as LotteryNameScale[]).map((s) => ({
              value: s,
              label: SCALE_LABEL[s],
            }))}
            disabled={drawing || busy}
            onChange={(v) => updateSettings({ scale: v })}
          />

          <Segmented
            label="Efek pengumuman"
            value={settings.effect}
            options={[
              { value: 'none' as LotteryEffect, label: 'Tanpa efek' },
              { value: 'drumroll' as LotteryEffect, label: 'Drum roll' },
            ]}
            disabled={drawing || busy}
            onChange={(v) => updateSettings({ effect: v })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={empty ? 'slate' : 'green'}>
              {activePool.length} peserta di dalam undian
            </Badge>
            {filterOn && (
              <Badge color="amber">
                {selectedInduk.length} dari {groups.length} kelompok SP
              </Badge>
            )}
            <Badge color="blue">{winners.length} sudah menang</Badge>
            <Badge color={stageSeen ? 'green' : 'slate'}>
              {stageSeen ? 'Layar besar terhubung' : 'Layar besar belum terbuka'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Suara dimainkan dari tab ini, bukan dari tab layar besar.
          </p>
        </div>

        <LotteryReel
          pool={activePool}
          spinning={drawing}
          winners={revealed}
          durationMs={settings.durationMs}
        />

        {partialNote && <Alert variant="info" title="Undian sebagian">{partialNote}</Alert>}

        {empty ? (
          filterOn && pool.length > 0 ? (
            <Alert variant="info" title="Kelompok yang dicentang sudah habis">
              Semua peserta dari {selectedInduk.join(', ')} sudah mendapat giliran, tapi masih ada{' '}
              {pool.length} peserta di kelompok lain. Centang kelompok lain atau ikutkan semua
              kelompok untuk melanjutkan.
            </Alert>
          ) : (
            <Alert variant="info" title="Semua peserta sudah mendapat giliran">
              Tidak ada lagi peserta yang bisa diundi. Batalkan undian terakhir, kembalikan salah
              satu pemenang, atau reset undian bila ingin mengulang.
            </Alert>
          )
        ) : (
          <Button size="lg" fullWidth onClick={() => void draw()} loading={drawing} disabled={busy}>
            {drawing
              ? 'Mengundi…'
              : settings.count > 1
                ? `Undi ${settings.count} Pemenang`
                : 'Undi Sekarang'}
          </Button>
        )}

        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          <Button variant="outline" size="sm" onClick={() => sendScreen('wall')} disabled={drawing}>
            Tampilkan Papan Pemenang
          </Button>
          <Button variant="outline" size="sm" onClick={() => sendScreen('replay')} disabled={drawing}>
            Ulangi Pengumuman
          </Button>
          <Button variant="ghost" size="sm" onClick={() => sendScreen('idle')} disabled={drawing}>
            Bersihkan Layar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUndoOpen(true)}
            disabled={drawing || busy || winners.length === 0}
          >
            Batalkan Undian Terakhir
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Riwayat Pemenang</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyWinners()}
            disabled={winners.length === 0}
          >
            Salin daftar
          </Button>
        </div>
        {copyNote && (
          <p className={`mb-2 text-xs ${copyNote.ok ? 'text-brand-700' : 'text-red-700'}`}>
            {copyNote.text}
          </p>
        )}
        {winners.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada pemenang.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {winners.map((w, i) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    <span className="mr-2 text-slate-400">#{winners.length - i}</span>
                    {w.full_name}
                    {w.nickname && <span className="text-slate-500"> ({w.nickname})</span>}
                  </p>
                  <p className="font-mono text-sm text-brand-700">
                    {w.sp_code}
                    {w.round_label && <span className="text-slate-500"> · {w.round_label}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-slate-500">
                    {formatDateTime(w.drawn_at)}
                    {w.drawn_by_name && ` · oleh ${w.drawn_by_name}`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={drawing || busy}
                    onClick={() => void returnWinner(w)}
                  >
                    Kembalikan
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Reset dipindah keluar dari baris tombol operasional dan disembunyikan di
          balik <details>: aksinya permanen secara operasional, dan panitia yang
          gugup di depan tamu tidak boleh menemukannya bersebelahan dengan tombol
          yang dipakai tiap babak. */}
      <details className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <summary className="cursor-pointer text-sm font-bold text-red-800">Zona berbahaya</summary>
        <p className="mt-2 text-sm text-red-900">
          Mengosongkan seluruh daftar pemenang dan mengembalikan semua peserta ke undian. Tombol
          “Batalkan Undian Terakhir” tidak bisa memulihkannya.
        </p>
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          disabled={drawing || busy || winners.length === 0}
          onClick={() => {
            setResetTyped('');
            setResetOpen(true);
          }}
        >
          Reset Undian
        </Button>
      </details>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={toast.undo}
              className="font-bold text-brand-300 hover:underline"
            >
              Batalkan
            </button>
          )}
        </div>
      )}

      <Modal open={undoOpen} onClose={() => setUndoOpen(false)} title="Batalkan undian terakhir?">
        <p className="text-sm text-slate-600">
          Seluruh pemenang dari undian terakhir akan dihapus dari daftar dan kembali masuk ke
          undian.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setUndoOpen(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void confirmUndo()} loading={busy}>
            Ya, batalkan
          </Button>
        </div>
      </Modal>

      {/* Konfirmasi BERLAPIS: peringatan eksplisit + wajib mengetik ulang kata
          RESET. Aksinya mengosongkan seluruh daftar pemenang dan tidak bisa
          dipulihkan oleh tombol undo. */}
      <Modal
        open={resetOpen}
        onClose={() => {
          setResetOpen(false);
          setResetTyped('');
        }}
        title="Reset seluruh undian?"
      >
        <Alert variant="error" title="Daftar pemenang akan dikosongkan">
          Seluruh daftar pemenang ({winners.length} orang) akan dikosongkan dan{' '}
          <strong>tombol “Batalkan Undian Terakhir” tidak bisa memulihkannya</strong>. Semua peserta
          kembali masuk ke undian. Barisnya tetap tersimpan sebagai catatan, tapi tidak akan muncul
          lagi di mana pun.
        </Alert>
        <label className="field-label mt-4 block" htmlFor="reset-confirm">
          Ketik <span className="font-mono font-bold">{RESET_PHRASE}</span> untuk mengonfirmasi
        </label>
        <Input
          id="reset-confirm"
          value={resetTyped}
          onChange={(e) => setResetTyped(e.target.value)}
          autoComplete="off"
          placeholder={RESET_PHRASE}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setResetOpen(false);
              setResetTyped('');
            }}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirmReset()}
            loading={busy}
            disabled={resetTyped.trim().toUpperCase() !== RESET_PHRASE}
          >
            Kosongkan daftar pemenang
          </Button>
        </div>
      </Modal>
    </div>
  );
}
