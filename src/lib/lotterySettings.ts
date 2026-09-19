// ---------------------------------------------------------------------------
// SP Portal — pengaturan babak undian + preset, disimpan di browser.
//
// SEMUA yang ada di sini hanyalah KENYAMANAN LOKAL. Pemenang, pool, dan jejak
// audit hidup di basis data dan tidak pernah diputuskan dari sini — jangan
// pernah memakai localStorage untuk menentukan siapa yang sudah menang. Di
// situlah bedanya portal ini dengan alat undian tanpa server.
//
// Setiap akses dibungkus try/catch: mode privat, kuota penuh, atau kebijakan
// situs bisa membuat storage melempar. Undian harus tetap bisa berjalan tanpa
// preset — gagal menyimpan preferensi tidak boleh menggagalkan acara.
// ---------------------------------------------------------------------------

import type { LotteryPreset, LotterySettings } from '../types';
import { DEFAULT_DRAW_ANIMATION_MS } from '../components/LotteryReel';
import { MAX_INDUK_FILTER, SP_INDUK_RE, normalizeIndukList } from './format';

const LS_SETTINGS = 'sp.lottery_settings';
const LS_PRESETS = 'sp.lottery_presets';

/** Lebih dari ini dan barisan tombol preset berubah jadi dinding yang harus dibaca. */
export const MAX_LOTTERY_PRESETS = 6;

export const DEFAULT_LOTTERY_SETTINGS: LotterySettings = {
  roundLabel: '',
  count: 1,
  durationMs: DEFAULT_DRAW_ANIMATION_MS,
  scale: 'besar',
  effect: 'drumroll',
  // Kosong = seluruh kelompok SP ikut diundi. Bawaan ini penting: panitia yang
  // belum pernah menyentuh filter tidak boleh mendapati undiannya menyempit.
  induk: [],
};

/**
 * Bersihkan filter kelompok yang terbaca dari storage.
 *
 * Entri yang bukan SP Induk DIBUANG di sini — beda dari normalizeIndukList yang
 * membiarkannya lewat. Isi kunci ini hanya pernah ditulis oleh daftar kelompok
 * di halaman kontrol, jadi entri asing berarti storage sudah rusak atau diedit
 * tangan; mengirimkannya ke server hanya menghasilkan 422 di tengah acara.
 * Kalau semuanya terbuang, filter kembali kosong = semua kelompok ikut, dan
 * halaman kontrol menampilkan keadaan itu apa adanya.
 */
function normalizeIndukSetting(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return normalizeIndukList(raw.map((v) => String(v)))
    .filter((c) => SP_INDUK_RE.test(c))
    .slice(0, MAX_INDUK_FILTER);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Bersihkan apa pun yang terbaca dari storage menjadi LotterySettings yang sah.
 *
 * Isinya bisa berasal dari versi aplikasi yang lebih lama, dari tab lain, atau
 * dari orang yang mengedit localStorage sendiri. Nilai yang tidak dikenal
 * dikembalikan ke bawaan alih-alih dibiarkan lolos ke layar besar.
 */
export function normalizeSettings(raw: unknown): LotterySettings {
  const v = (raw ?? {}) as Partial<LotterySettings>;
  const count = Number(v.count);
  const durationMs = Number(v.durationMs);
  return {
    roundLabel: typeof v.roundLabel === 'string' ? v.roundLabel.slice(0, 60) : '',
    count: Number.isFinite(count) ? Math.max(1, Math.min(20, Math.floor(count))) : 1,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.min(60000, durationMs)) : DEFAULT_DRAW_ANIMATION_MS,
    scale: v.scale === 'sedang' || v.scale === 'raksasa' ? v.scale : 'besar',
    effect: v.effect === 'none' ? 'none' : 'drumroll',
    induk: normalizeIndukSetting(v.induk),
  };
}

export function loadSettings(): LotterySettings {
  return normalizeSettings(readJson<unknown>(LS_SETTINGS, null));
}

export function saveSettings(settings: LotterySettings): void {
  writeJson(LS_SETTINGS, settings);
}

export function loadPresets(): LotteryPreset[] {
  const rows = readJson<unknown[]>(LS_PRESETS, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is { name: unknown } => typeof r === 'object' && r !== null && 'name' in r)
    .filter((r) => typeof r.name === 'string' && r.name.trim() !== '')
    .slice(0, MAX_LOTTERY_PRESETS)
    .map((r) => ({ ...normalizeSettings(r), name: String(r.name).slice(0, 28) }));
}

/**
 * Simpan (atau timpa) satu preset bernama.
 *
 * Mengembalikan daftar baru, atau null bila gagal — pemanggil harus memberi tahu
 * panitia alih-alih diam saja, karena preset yang dikira tersimpan lalu hilang
 * saat acara jauh lebih menjengkelkan daripada pesan galat.
 */
export function savePreset(name: string, settings: LotterySettings): LotteryPreset[] | null {
  const clean = name.trim().slice(0, 28);
  if (!clean) return null;
  const list = loadPresets();
  const at = list.findIndex((p) => p.name === clean);
  if (at === -1 && list.length >= MAX_LOTTERY_PRESETS) return null;
  const next = { ...normalizeSettings(settings), name: clean };
  const updated = at === -1 ? [...list, next] : list.map((p, i) => (i === at ? next : p));
  return writeJson(LS_PRESETS, updated) ? updated : null;
}

export function deletePreset(name: string): LotteryPreset[] {
  const updated = loadPresets().filter((p) => p.name !== name);
  writeJson(LS_PRESETS, updated);
  return updated;
}

/** Kembalikan daftar preset apa adanya — dipakai untuk membatalkan penghapusan. */
export function restorePresets(list: LotteryPreset[]): LotteryPreset[] {
  writeJson(LS_PRESETS, list);
  return list;
}
