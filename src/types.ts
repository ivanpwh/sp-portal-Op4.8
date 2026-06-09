// Domain types for SP Portal v3.1 — snake_case kept on the wire to mirror the
// FastAPI/PRD schema. Core model: one RegistrationSession groups many Participant
// rows entered directly (no separate "pendata"). Every participant carries a
// required SP code whose first token identifies its "SP Induk" (family head line).

export type CommitteeRole = 'super_admin' | 'committee';

export interface Committee {
  id: string;
  name: string;
  email: string;
  role: CommitteeRole;
  is_active: boolean;
  created_at: string;
}

export type AttendanceStatus = 'will_attend' | 'cancelled';

// ---------------------------------------------------------------------------
// Core model (PRD v3.1 §3)
// ---------------------------------------------------------------------------

// One registration action grouping people registered together. There is no
// separate "pendata" identity — participants are entered directly. A session
// shares one manage token + one check-in code (QR).
export interface RegistrationSession {
  id: string;
  manage_token: string; // token unik untuk kelola mandiri
  privacy_consent: boolean; // wajib true
  registered_at: string; // ISO 8601
  updated_at: string | null; // ISO 8601
}

// Each individual registered to attend. Belongs to exactly one session.
export interface Participant {
  id: string;
  session_id: string;
  full_name: string;
  nickname: string; // nama panggilan — opsional (boleh kosong)
  sp_code: string; // WAJIB — mis. "SP4.1.3A"
  birth_date: string; // tanggal lahir, atau umur bila tak tahu
  address: string; // region domisili: "Provinsi, Kab/Kota, Kecamatan" via RegionPicker
  address_detail: string; // alamat lengkap bebas — opsional (boleh kosong)
  last_occupation: string; // opsional (boleh kosong)
  accommodation: string; // rencana lokasi menginap — opsional (boleh kosong)
  email: string | null; // opsional per peserta
  whatsapp_number: string | null; // opsional per peserta
  attendance_status: AttendanceStatus;
  is_checked_in: boolean;
  checked_in_at: string | null;
}

// A session bundled with its participants — the shape most views consume.
export interface SessionWithParticipants extends RegistrationSession {
  participants: Participant[];
}

// A participant flattened with its session context (grouping & check-in views).
export interface ParticipantWithSession extends Participant {
  manage_token: string;
  registered_at: string;
}

// ---------------------------------------------------------------------------
// Input payloads
// ---------------------------------------------------------------------------

export interface ParticipantInput {
  full_name: string;
  nickname?: string; // opsional
  sp_code: string;
  birth_date: string;
  address: string;
  address_detail?: string; // opsional
  last_occupation?: string; // opsional
  accommodation?: string; // opsional
  email?: string;
  whatsapp_number?: string;
}

// Payload the public registration form submits — participants entered directly.
export interface RegistrationInput {
  privacy_consent: boolean;
  participants: ParticipantInput[];
  // Honeypot anti-spam field — must stay empty for a real human.
  website?: string;
}

// ---------------------------------------------------------------------------
// Event / notifications / stats
// ---------------------------------------------------------------------------

export interface EventSettings {
  id: string;
  event_name: string;
  tagline: string;
  event_date: string;
  location: string;
  address: string;
  maps_query: string;
  registration_deadline: string | null; // null = tanpa batas
  registration_open: boolean;
  updated_at: string;
}

export type NotificationType =
  | 'participant_confirmation'
  | 'committee_blast'
  | 'reminder';
export type NotificationChannel = 'whatsapp' | 'email';
export type NotificationStatus = 'sent' | 'failed' | 'dry_run';

export interface NotificationLog {
  id: string;
  session_id: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  error_message: string | null;
  created_at: string;
}

// Computed registration availability for the public area (no quota in v3.x).
export interface RegistrationStatus {
  open: boolean;
  reason: 'open' | 'closed_manual' | 'past_deadline';
  message: string;
  total_sessions: number;
  total_people: number;
  deadline: string | null;
}

export interface SpIndukStat {
  induk: string; // mis. "SP4"
  sessions: number; // jumlah sesi yang menyentuh induk ini
  people: number; // jumlah peserta dalam induk ini
}

export interface Stats {
  total_sessions: number;
  total_people: number;
  total_cancelled: number;
  total_checked_in: number;
  by_sp_induk: SpIndukStat[];
  trend: { date: string; count: number }[];
}

// A group of participants sharing one SP Induk (grouping admin page, FR-ADM §5.4).
export interface SpIndukGroup {
  induk: string;
  participants: ParticipantWithSession[];
}
