import { describe, it, expect, beforeEach, vi } from 'vitest';
import { evaluateRegistrationGate } from './registrationGate';
import type { EventSettings } from '../types';

const LS_EVENT = 'sp.event_settings';

/**
 * Regresi untuk bug "pendaftaran tetap tertutup padahal sudah dibuka".
 *
 * Seed lama memaku `registration_deadline: '2026-08-01T16:59:00.000Z'`. Begitu
 * tanggal itu lewat, SETIAP pemasangan baru — setiap localStorage yang bersih,
 * setiap demo portofolio — lahir dengan pendaftaran tertutup tanpa ada yang
 * menutupnya, dan halaman pengaturan tidak memberi petunjuk apa pun.
 *
 * Uji ini akan gagal lagi kalau seseorang mengganti tanggal relatif dengan
 * tanggal mati, kapan pun di masa depan.
 */
describe('data seed mode demo', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  async function seededEvent(): Promise<EventSettings> {
    // Mengimpor modul memicu seed() di tingkat modul saat DEMO_MODE aktif.
    await import('./api.mock');
    const raw = localStorage.getItem(LS_EVENT);
    expect(raw, 'seed tidak menulis pengaturan acara').not.toBeNull();
    return JSON.parse(raw as string) as EventSettings;
  }

  it('tidak pernah lahir dengan pendaftaran tertutup', async () => {
    const ev = await seededEvent();
    const gate = evaluateRegistrationGate({
      registration_open: ev.registration_open,
      registration_deadline: ev.registration_deadline,
    });
    expect(gate.reason).toBe('open');
    expect(gate.open).toBe(true);
  });

  it('memberi tenggat pendaftaran di masa depan', async () => {
    const ev = await seededEvent();
    expect(ev.registration_deadline).toBeTruthy();
    expect(new Date(ev.registration_deadline as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('menaruh tanggal acara setelah tenggat pendaftaran', async () => {
    const ev = await seededEvent();
    // Kalau acaranya lebih dulu daripada tenggatnya, data contoh itu sendiri
    // tidak masuk akal dan tidak layak dipakai memamerkan portal.
    expect(new Date(ev.event_date).getTime()).toBeGreaterThan(
      new Date(ev.registration_deadline as string).getTime(),
    );
  });
});
