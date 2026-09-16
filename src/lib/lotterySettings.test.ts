import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_LOTTERY_SETTINGS,
  MAX_LOTTERY_PRESETS,
  deletePreset,
  loadPresets,
  loadSettings,
  normalizeSettings,
  restorePresets,
  savePreset,
  saveSettings,
} from './lotterySettings';
import { DRAW_DURATION_PRESETS } from '../components/LotteryReel';
import type { LotterySettings } from '../types';

const SETTINGS: LotterySettings = {
  roundLabel: 'Hadiah Utama',
  count: 3,
  durationMs: 10000,
  scale: 'raksasa',
  effect: 'none',
};

beforeEach(() => {
  localStorage.clear();
});

describe('durasi bawaan', () => {
  // Regresi: dulu bawaannya 4200 ms sementara pilihannya 0/3/5/10 detik, jadi
  // panel kontrol terbuka tanpa satu pun tombol durasi tersorot — kontrol yang
  // berfungsi tapi terlihat rusak.
  it('adalah salah satu pilihan yang ditawarkan panel kontrol', () => {
    expect(DRAW_DURATION_PRESETS).toContain(DEFAULT_LOTTERY_SETTINGS.durationMs);
  });

  it('dipakai juga sebagai fallback normalisasi', () => {
    expect(normalizeSettings({ durationMs: 'bukan angka' }).durationMs).toBe(
      DEFAULT_LOTTERY_SETTINGS.durationMs,
    );
    expect(DRAW_DURATION_PRESETS).toContain(normalizeSettings({}).durationMs);
  });
});

describe('normalizeSettings', () => {
  // Isi localStorage bisa berasal dari versi aplikasi lama, dari tab lain, atau
  // dari orang yang mengeditnya sendiri. Apa pun yang masuk, yang keluar harus
  // aman untuk dikirim ke layar besar di depan tamu.
  it('mengembalikan bawaan untuk masukan kosong', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_LOTTERY_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_LOTTERY_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_LOTTERY_SETTINGS);
  });

  it('menjepit jumlah pemenang ke rentang 1..20', () => {
    expect(normalizeSettings({ count: 0 }).count).toBe(1);
    expect(normalizeSettings({ count: -5 }).count).toBe(1);
    expect(normalizeSettings({ count: 999 }).count).toBe(20);
    expect(normalizeSettings({ count: 4.9 }).count).toBe(4);
  });

  it('menolak nilai skala dan efek yang tidak dikenal', () => {
    expect(normalizeSettings({ scale: 'raksasa' }).scale).toBe('raksasa');
    expect(normalizeSettings({ scale: 'gigantic' }).scale).toBe('besar');
    expect(normalizeSettings({ effect: 'none' }).effect).toBe('none');
    expect(normalizeSettings({ effect: 'explosion' }).effect).toBe('drumroll');
  });

  it('memotong label babak di 60 karakter', () => {
    const long = 'x'.repeat(200);
    expect(normalizeSettings({ roundLabel: long }).roundLabel).toHaveLength(60);
    expect(normalizeSettings({ roundLabel: 42 }).roundLabel).toBe('');
  });

  it('menolak durasi yang bukan angka atau di luar akal', () => {
    expect(normalizeSettings({ durationMs: 0 }).durationMs).toBe(0);
    expect(normalizeSettings({ durationMs: -1 }).durationMs).toBe(0);
    expect(normalizeSettings({ durationMs: 999999 }).durationMs).toBe(60000);
    expect(normalizeSettings({ durationMs: 'lama' }).durationMs).toBe(
      DEFAULT_LOTTERY_SETTINGS.durationMs,
    );
  });
});

describe('loadSettings / saveSettings', () => {
  it('bolak-balik lewat localStorage', () => {
    saveSettings(SETTINGS);
    expect(loadSettings()).toEqual(SETTINGS);
  });

  it('kembali ke bawaan saat isi storage rusak', () => {
    localStorage.setItem('sp.lottery_settings', '{bukan json');
    expect(loadSettings()).toEqual(DEFAULT_LOTTERY_SETTINGS);
  });
});

describe('preset', () => {
  it('menyimpan, memuat, dan menimpa preset bernama sama', () => {
    savePreset('Hadiah Utama', SETTINGS);
    expect(loadPresets()).toHaveLength(1);

    savePreset('Hadiah Utama', { ...SETTINGS, count: 5 });
    const list = loadPresets();
    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(5);
  });

  it('menolak nama kosong', () => {
    expect(savePreset('   ', SETTINGS)).toBeNull();
    expect(loadPresets()).toHaveLength(0);
  });

  it(`berhenti di ${MAX_LOTTERY_PRESETS} preset`, () => {
    for (let i = 0; i < MAX_LOTTERY_PRESETS; i++) savePreset(`P${i}`, SETTINGS);
    expect(loadPresets()).toHaveLength(MAX_LOTTERY_PRESETS);
    // Yang ke-(n+1) ditolak, bukan diam-diam membuang yang lama.
    expect(savePreset('Kelebihan', SETTINGS)).toBeNull();
    expect(loadPresets().map((p) => p.name)).not.toContain('Kelebihan');
  });

  it('menghapus preset dan bisa dipulihkan kembali', () => {
    savePreset('Satu', SETTINGS);
    savePreset('Dua', SETTINGS);
    const before = loadPresets();

    expect(deletePreset('Satu').map((p) => p.name)).toEqual(['Dua']);
    // Pemulihan inilah yang menopang tombol "Batalkan" di toast.
    expect(restorePresets(before).map((p) => p.name)).toEqual(['Satu', 'Dua']);
    expect(loadPresets().map((p) => p.name)).toEqual(['Satu', 'Dua']);
  });

  it('membuang baris preset yang cacat alih-alih ikut memuatnya', () => {
    localStorage.setItem(
      'sp.lottery_presets',
      JSON.stringify([{ name: 'Sah', count: 2 }, { count: 3 }, null, 'bukan objek']),
    );
    const list = loadPresets();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Sah');
  });
});

describe('storage yang menolak', () => {
  // Mode privat, kuota penuh, atau kebijakan situs bisa membuat localStorage
  // melempar. Undian harus tetap jalan tanpa preset — gagal menyimpan preferensi
  // tidak boleh menggagalkan acara.
  const realSet = Storage.prototype.setItem;
  const realGet = Storage.prototype.getItem;

  afterEach(() => {
    Storage.prototype.setItem = realSet;
    Storage.prototype.getItem = realGet;
  });

  it('tidak melempar saat penulisan ditolak', () => {
    Storage.prototype.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveSettings(SETTINGS)).not.toThrow();
    expect(savePreset('Satu', SETTINGS)).toBeNull();
  });

  it('tidak melempar saat pembacaan ditolak', () => {
    Storage.prototype.getItem = vi.fn(() => {
      throw new DOMException('SecurityError');
    });
    expect(loadSettings()).toEqual(DEFAULT_LOTTERY_SETTINGS);
    expect(loadPresets()).toEqual([]);
  });
});
