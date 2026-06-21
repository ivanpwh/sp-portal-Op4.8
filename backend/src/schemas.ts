// Zod schemas mirroring the Pydantic request models (schemas.py). Unknown keys
// are stripped (matching Pydantic's default), so e.g. sending a full Participant
// to a PATCH only applies the recognized fields.
import { z } from 'zod';

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

export const broadcastInputSchema = z.object({
  induk: z.string().nullish(),
  onlyAttending: z.boolean().default(true), // camelCase alias from the frontend
  channels: z.array(z.enum(['whatsapp', 'email'])),
});
