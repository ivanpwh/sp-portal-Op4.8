// ---------------------------------------------------------------------------
// SP Portal — apakah pendaftaran sedang terbuka?
//
// Ada DUA gerbang independen, dan keduanya harus lolos:
//
//   1. `registration_open` — saklar manual panitia.
//   2. tenggat — bila diisi dan sudah lewat, pendaftaran tertutup betapapun
//      saklarnya dinyalakan.
//
// Kombinasi "saklar menyala tapi tenggat sudah lewat" adalah jebakan nyata yang
// pernah terjadi: panitia mencentang "buka pendaftaran", menekan simpan, melihat
// "Tersimpan", lalu situs tetap tertutup tanpa penjelasan. Karena itu fungsi ini
// mengembalikan ALASAN, bukan sekadar boolean — supaya UI bisa mengatakan
// gerbang mana yang sedang menutup, bukan cuma bahwa pintunya terkunci.
//
// Dipakai oleh dua tempat yang wajib tidak boleh berbeda jawabannya:
//   - `api.mock.ts` → getRegistrationStatus() (sumber kebenaran mode demo)
//   - `EventSettingsPage` → pratinjau langsung sambil panitia mengedit
//
// Backend punya salinannya sendiri di `computeRegistrationStatus()`
// (`backend/src/services.ts`) karena tidak ada shared package di repo ini —
// lihat docs/KNOWN_GOTCHAS.md. Ubah satu, ubah yang lain.
// ---------------------------------------------------------------------------

import type { RegistrationStatus } from '../types';

export type RegistrationReason = RegistrationStatus['reason'];

export interface RegistrationGate {
  open: boolean;
  reason: RegistrationReason;
  message: string;
}

export interface RegistrationGateInput {
  registration_open: boolean;
  registration_deadline: string | null;
}

/**
 * Tenggat sebagai Date, atau null bila kosong/tidak bisa diurai.
 *
 * Nilai yang tidak valid diperlakukan sebagai "tanpa tenggat", BUKAN sebagai
 * "sudah lewat": menutup pendaftaran karena sebuah string rusak akan menghukum
 * peserta atas kesalahan data yang tidak mereka perbuat.
 */
export function parseDeadline(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isDeadlinePassed(raw: string | null | undefined, now: Date = new Date()): boolean {
  const d = parseDeadline(raw);
  return d !== null && d.getTime() < now.getTime();
}

export function evaluateRegistrationGate(
  input: RegistrationGateInput,
  now: Date = new Date(),
): RegistrationGate {
  if (!input.registration_open) {
    return {
      open: false,
      reason: 'closed_manual',
      message: 'Pendaftaran ditutup sementara oleh panitia.',
    };
  }
  if (isDeadlinePassed(input.registration_deadline, now)) {
    return {
      open: false,
      reason: 'past_deadline',
      message: 'Maaf, batas waktu pendaftaran telah berakhir.',
    };
  }
  return { open: true, reason: 'open', message: 'Pendaftaran sedang dibuka.' };
}
