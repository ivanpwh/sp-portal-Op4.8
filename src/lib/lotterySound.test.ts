import { describe, it, expect, beforeEach } from 'vitest';
import { isMuted, setMuted, playDrumroll, playFanfare, stopAllLotterySound } from './lotterySound';

describe('mute undian', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('default tidak dibisukan', () => {
    expect(isMuted()).toBe(false);
  });

  it('bertahan di localStorage antar-pembacaan (dan antar-tab)', () => {
    setMuted(true);
    expect(localStorage.getItem('sp.lottery_muted')).toBe('true');
    expect(isMuted()).toBe(true);

    setMuted(false);
    expect(isMuted()).toBe(false);
  });
});

describe('fallback tanpa Web Audio', () => {
  // jsdom tidak menyediakan AudioContext. Undian TIDAK BOLEH gagal hanya karena
  // browser/lingkungan tidak mendukung suara — panitia tetap harus bisa mengundi.
  it('tidak melempar error saat AudioContext tidak tersedia', () => {
    expect(window.AudioContext).toBeUndefined();
    expect(() => playDrumroll(1000)).not.toThrow();
    expect(() => playFanfare()).not.toThrow();
    expect(() => stopAllLotterySound()).not.toThrow();
  });
});

describe('efek per babak', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Dua saklar independen: mute perangkat dan pilihan efek babak. Keduanya
  // harus bisa membungkam sendiri-sendiri — kalau salah satu jalur lolos,
  // drum roll akan berbunyi di babak yang sengaja dibuat senyap.
  it("effect 'none' tidak berbunyi walau tidak dibisukan", () => {
    expect(isMuted()).toBe(false);
    expect(() => playDrumroll(1000, 'none')).not.toThrow();
    expect(() => playFanfare('none')).not.toThrow();
  });

  it("effect 'drumroll' tetap tunduk pada mute perangkat", () => {
    setMuted(true);
    expect(() => playDrumroll(1000, 'drumroll')).not.toThrow();
    expect(() => playFanfare('drumroll')).not.toThrow();
  });
});
