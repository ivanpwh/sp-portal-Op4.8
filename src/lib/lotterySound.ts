// ---------------------------------------------------------------------------
// SP Portal — suara undian (Web Audio API, TANPA file audio eksternal).
//
// Semua bunyi disintesis di browser lewat OscillatorNode/AudioBufferSourceNode,
// jadi tidak ada aset yang perlu di-bundle atau di-fetch saat acara berlangsung
// (koneksi di lokasi acara tidak bisa diandalkan).
//
// PENTING — kebijakan autoplay: browser modern menolak memulai AudioContext
// sebelum ada gesture pengguna. AudioContext di sini karena itu LAZY: baru
// dibuat saat fungsi play dipanggil pertama kali, yang selalu berasal dari klik
// tombol "Undi Sekarang". Jangan memanggil fungsi mana pun di file ini dari
// efek mount halaman.
// ---------------------------------------------------------------------------

import type { LotteryEffect } from '../types';

const LS_MUTED = 'sp.lottery_muted';

/**
 * Dua saklar berbeda, sengaja tidak digabung:
 *
 * - `muted` adalah preferensi PERANGKAT ini (tersimpan di localStorage) —
 *   dipakai saat panitia berlatih di ruang kerja atau mikrofon sedang dipakai.
 * - `effect` adalah pilihan BABAK — hadiah utama pakai drum roll, hadiah
 *   hiburan yang diundi berturut-turut lebih baik tanpa efek sama sekali.
 *
 * Keduanya bisa membungkam suara, dan keduanya harus diperiksa di setiap fungsi
 * play agar tidak ada jalur yang lolos.
 */
function silent(effect: LotteryEffect): boolean {
  return effect === 'none' || isMuted();
}

let ctx: AudioContext | null = null;

/** Satu AudioContext per halaman, dibuat saat dibutuhkan. null bila browser tidak mendukung. */
function audio(): AudioContext | null {
  if (ctx) {
    // Tab yang lama tidak aktif bisa membuat context ter-suspend.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(LS_MUTED) === 'true';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(LS_MUTED, String(muted));
  } catch {
    // localStorage bisa ditolak (mode privat) — mute cukup berlaku untuk sesi ini.
  }
}

/** Noise pendek untuk satu "tik" drumroll; dibuat sekali lalu dipakai ulang. */
let noiseBuffer: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const frames = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Peluruhan cepat → terdengar seperti pukulan snare pendek, bukan desis.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  }
  noiseBuffer = buf;
  return buf;
}

/** Sumber bunyi yang sudah dijadwalkan, agar bisa dihentikan bila undian dibatalkan. */
let scheduled: AudioScheduledSourceNode[] = [];

function track(node: AudioScheduledSourceNode): void {
  scheduled.push(node);
  node.addEventListener('ended', () => {
    scheduled = scheduled.filter((n) => n !== node);
  });
}

/** Hentikan semua bunyi yang sedang/akan berbunyi (mis. saat halaman ditinggalkan). */
export function stopAllLotterySound(): void {
  for (const node of scheduled) {
    try {
      node.stop();
    } catch {
      // sudah berhenti — abaikan
    }
  }
  scheduled = [];
}

/**
 * Drumroll selama `durationMs`: rentetan tik yang temponya MENINGKAT mendekati
 * akhir (efek suspense). Sinkronkan durasinya dengan durasi animasi reel.
 *
 * Seluruh tik dijadwalkan sekaligus di timeline AudioContext, bukan lewat
 * setInterval — timer JavaScript tersendat saat React me-render tiap frame,
 * dan drumroll yang tersendat terdengar rusak.
 */
export function playDrumroll(durationMs: number, effect: LotteryEffect = 'drumroll'): void {
  if (silent(effect)) return;
  const c = audio();
  if (!c) return;

  const buf = noise(c);
  const total = durationMs / 1000;
  const startGap = 0.14; // jeda antar-tik di awal (lambat)
  const endGap = 0.035; // jeda antar-tik di akhir (rapat)

  for (let t = 0; t < total; ) {
    const progress = t / total;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    // Makin dekat akhir, makin keras — menegaskan puncak ketegangan.
    gain.gain.value = 0.12 + 0.18 * progress;
    src.connect(gain).connect(c.destination);
    src.start(c.currentTime + t);
    track(src);
    t += startGap + (endGap - startGap) * progress;
  }
}

/** Arpeggio mayor naik 4 nada — dipicu tepat saat reel berhenti di pemenang. */
export function playFanfare(effect: LotteryEffect = 'drumroll'): void {
  if (silent(effect)) return;
  const c = audio();
  if (!c) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const at = c.currentTime + i * 0.12;
    const dur = i === notes.length - 1 ? 0.75 : 0.22; // nada terakhir ditahan
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = c.createGain();
    // Envelope attack-decay; setValueAtTime dulu agar ramp punya titik awal.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    track(osc);
  });
}
