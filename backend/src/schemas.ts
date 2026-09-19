// Zod schemas mirroring the Pydantic request models (schemas.py). Unknown keys
// are stripped (matching Pydantic's default), so e.g. sending a full Participant
// to a PATCH only applies the recognized fields.
import { z } from 'zod';
import { MAX_INDUK_FILTER, SP_INDUK_RE, normalizeSpCode } from './utils';

export const participantInputSchema = z.object({
  full_name: z.string(),
  nickname: z.string().nullish(),
  sp_code: z.string(),
  birth_date: z.string().nullish(),
  address: z.string().nullish(),
  address_detail: z.string().nullish(),
  last_occupation: z.string().nullish(),
  accommodation: z.string().nullish(),
  email: z.string().nullish(),
  whatsapp_number: z.string().nullish(),
});

export const registrationInputSchema = z.object({
  privacy_consent: z.boolean().default(false),
  participants: z.array(participantInputSchema).default([]),
  website: z.string().nullish(), // honeypot — must stay empty
  // Pendaftaran dengan Kode SP yang sudah terdaftar DITOLAK sekali dengan 409,
  // lalu diterima bila dikirim ulang dengan bendera ini. Peringatan, bukan
  // larangan: dua orang berbeda bisa saja keliru memakai kode yang sama, dan
  // memblokir mereka di hari terakhir pendaftaran lebih merugikan daripada satu
  // baris ganda yang bisa dirapikan panitia.
  //
  // Ditegakkan di SERVER, bukan hanya di layar: peringatan yang cuma ada di
  // komponen akan terlewat oleh siapa pun yang memuat ulang atau memakai
  // klien lain.
  acknowledge_duplicate: z.boolean().default(false),
});

export const participantUpdateItemSchema = participantInputSchema.extend({
  id: z.string().nullish(),
});

export const sessionFullUpdateSchema = z.object({
  participants: z.array(participantUpdateItemSchema).nullish(),
});

export const participantPatchSchema = z.object({
  full_name: z.string().optional(),
  nickname: z.string().optional(),
  sp_code: z.string().optional(),
  birth_date: z.string().optional(),
  address: z.string().optional(),
  address_detail: z.string().optional(),
  last_occupation: z.string().optional(),
  accommodation: z.string().optional(),
  email: z.string().nullable().optional(),
  whatsapp_number: z.string().nullable().optional(),
  attendance_status: z.enum(['will_attend', 'cancelled']).optional(),
  is_checked_in: z.boolean().optional(),
  checked_in_at: z.string().nullable().optional(),
});

export const checkinInputSchema = z.object({
  value: z.boolean().default(true),
});

export const statusInputSchema = z.object({
  status: z.enum(['will_attend', 'cancelled']),
});

export const eventSettingsPatchSchema = z.object({
  event_name: z.string().optional(),
  tagline: z.string().optional(),
  event_date: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  maps_query: z.string().optional(),
  registration_deadline: z.string().nullable().optional(),
  registration_open: z.boolean().optional(),
  qr_checkin_enabled: z.boolean().optional(),
});

export const loginInputSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const committeeCreateSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  role: z.enum(['super_admin', 'committee']).default('committee'),
});

export const committeeUpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.enum(['super_admin', 'committee']).optional(),
  password: z.string().optional(),
});

export const committeeToggleSchema = z.object({
  is_active: z.boolean(),
});

// Undian. Both bodies are optional in practice — an empty POST still draws one
// winner with no round label, which is what the old contract did.
export const lotteryDrawSchema = z.object({
  count: z.number().int().min(1).max(20).default(1),
  // Kelompok SP Induk yang ikut diundi. Array kosong / field tidak dikirim =
  // SEMUA kelompok ikut, jadi pemanggil lama tetap dapat perilaku lama.
  //
  // Bentuk yang salah DITOLAK (422), bukan dibuang diam-diam: membuang entri
  // tak sah dari ['SP1.2'] menghasilkan array kosong, dan array kosong berarti
  // "semua kelompok" — panitia akan mengira sudah menyaring padahal tidak.
  induk: z
    .array(
      z
        .string()
        .transform((s) => normalizeSpCode(s))
        .refine((s) => SP_INDUK_RE.test(s), {
          message: 'Harus berupa SP Induk seperti SP1 atau SP12, bukan kode SP lengkap.',
        }),
    )
    .max(MAX_INDUK_FILTER)
    .default([]),
  // Shown on the projector to a whole room, so it is length-capped and must
  // never be used for names or phone numbers (see CLAUDE.md).
  round_label: z.string().trim().max(60).default(''),
});

export const lotteryVoidSchema = z.object({
  reason: z.enum(['undo', 'manual', 'reset']).default('manual'),
});

export const broadcastInputSchema = z.object({
  induk: z.string().nullish(),
  onlyAttending: z.boolean().default(true), // camelCase alias from the frontend
  channels: z.array(z.enum(['whatsapp', 'email'])),
});
