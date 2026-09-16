import { describe, it, expect } from 'vitest';
import {
  evaluateRegistrationGate,
  isDeadlinePassed,
  parseDeadline,
} from './registrationGate';

const PAST = new Date('2026-08-01T16:59:00.000Z').toISOString();
const FUTURE = new Date('2099-01-01T00:00:00.000Z').toISOString();
const NOW = new Date('2026-09-16T10:00:00.000Z');

describe('parseDeadline', () => {
  it('mengembalikan null untuk nilai kosong', () => {
    expect(parseDeadline(null)).toBeNull();
    expect(parseDeadline(undefined)).toBeNull();
    expect(parseDeadline('')).toBeNull();
  });

  // Tenggat rusak diperlakukan sebagai "tanpa tenggat", bukan "sudah lewat":
  // menutup pendaftaran karena sebuah string rusak akan menghukum peserta atas
  // kesalahan data yang bukan perbuatan mereka.
  it('memperlakukan tanggal tak terurai sebagai tanpa tenggat, bukan sudah lewat', () => {
    expect(parseDeadline('bukan tanggal')).toBeNull();
    expect(isDeadlinePassed('bukan tanggal', NOW)).toBe(false);
    expect(evaluateRegistrationGate(
      { registration_open: true, registration_deadline: 'bukan tanggal' },
      NOW,
    ).open).toBe(true);
  });
});

describe('evaluateRegistrationGate', () => {
  it('terbuka saat saklar menyala dan tidak ada tenggat', () => {
    const g = evaluateRegistrationGate(
      { registration_open: true, registration_deadline: null },
      NOW,
    );
    expect(g).toEqual({
      open: true,
      reason: 'open',
      message: 'Pendaftaran sedang dibuka.',
    });
  });

  it('terbuka saat tenggat masih di masa depan', () => {
    expect(
      evaluateRegistrationGate({ registration_open: true, registration_deadline: FUTURE }, NOW).open,
    ).toBe(true);
  });

  it('tertutup manual saat saklar dimatikan', () => {
    const g = evaluateRegistrationGate(
      { registration_open: false, registration_deadline: FUTURE },
      NOW,
    );
    expect(g.open).toBe(false);
    expect(g.reason).toBe('closed_manual');
  });

  // INI bug yang dilaporkan: panitia mencentang "buka pendaftaran", menyimpan,
  // melihat "Tersimpan" — dan situs tetap tertutup karena gerbang kedua.
  it('tetap tertutup saat saklar menyala tapi tenggat sudah lewat', () => {
    const g = evaluateRegistrationGate(
      { registration_open: true, registration_deadline: PAST },
      NOW,
    );
    expect(g.open).toBe(false);
    expect(g.reason).toBe('past_deadline');
  });

  // Saklar diperiksa lebih dulu: kalau panitia sengaja menutup, alasan itulah
  // yang perlu ditampilkan, bukan tenggat yang kebetulan juga lewat.
  it('melaporkan closed_manual saat kedua gerbang menutup sekaligus', () => {
    expect(
      evaluateRegistrationGate({ registration_open: false, registration_deadline: PAST }, NOW)
        .reason,
    ).toBe('closed_manual');
  });

  it('tepat pada detik tenggat masih dianggap terbuka', () => {
    const exact = NOW.toISOString();
    expect(
      evaluateRegistrationGate({ registration_open: true, registration_deadline: exact }, NOW).open,
    ).toBe(true);
  });
});
