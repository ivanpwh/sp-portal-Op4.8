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
  // Region domisili via RegionPicker: "Provinsi, Kab/Kota, Kecamatan, Kelurahan".
  // Data lama berhenti di kecamatan (3 segmen) dan TETAP SAH — jangan pernah
  // mem-parsing ini dengan split(','), ada nama desa yang memuat koma; pakai
  // resolveKecamatan() di src/lib/region.ts.
  address: string;
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
  // Dikirim pada percobaan KEDUA setelah peringatan Kode SP ganda. Server
  // menolak sekali dengan 409, lalu menerima kiriman ulang yang membawa ini.
  acknowledge_duplicate?: boolean;
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
  // Fitur kode/QR check-in untuk peserta. Bila false, kode & QR check-in
  // disembunyikan dari halaman publik (sukses & kelola); check-in oleh
  // panitia di area admin tetap berfungsi. Default: true.
  qr_checkin_enabled: boolean;
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

// ---------------------------------------------------------------------------
// Public participants view (FR-PUB-06) — the only shape exposed without login.
// Carries the minimum needed fields (name, SP code, contact) and NEVER any
// token / session ID, so nothing sensitive leaks to the public page.
// ---------------------------------------------------------------------------
export interface PublicParticipant {
  full_name: string;
  nickname: string;
  sp_code: string;
  whatsapp_number: string | null;
  email: string | null;
}

export interface PublicSpIndukGroup {
  induk: string;
  participants: PublicParticipant[];
}

// ---------------------------------------------------------------------------
// Undian (lottery) — mirrors backend/src/serializers.ts:lotteryDrawDict and
// services.ts:LotteryPoolEntry.
//
// Kedua bentuk di bawah SENGAJA hanya membawa identitas yang sudah publik lewat
// GET /api/participants/public (full_name, nickname, sp_code). Nama pemenang
// ditampilkan di layar besar publik saat acara, jadi TIDAK BOLEH ada
// whatsapp_number / email / birth_date / address di sini — jangan tambahkan.
// ---------------------------------------------------------------------------

// Satu peserta yang masih berhak diundi (belum pernah menang).
export interface LotteryPoolParticipant {
  id: string;
  full_name: string;
  nickname: string;
  sp_code: string;
}

// Satu baris riwayat pemenang. full_name/nickname/sp_code adalah SNAPSHOT saat
// menang — tetap utuh walau Participant-nya kemudian diedit/dihapus, karena
// participant_id hanya soft reference (tanpa FK, sama seperti
// NotificationLog.session_id).
export interface LotteryWinner {
  id: string;
  participant_id: string;
  full_name: string;
  nickname: string;
  sp_code: string;
  drawn_at: string; // ISO 8601
  drawn_by_name: string; // nama panitia yang menekan tombol undi
  round_label: string; // babak/hadiah saat dia menang, mis. "Hadiah Utama"
  // Kolom voided_at / voided_by_name / void_reason SENGAJA tidak ada di sini.
  // Pembatalan dicatat di basis data sebagai jejak audit dan tidak pernah
  // diserialisasi ke klien — GET /lottery/winners hanya mengembalikan pemenang
  // yang masih aktif.
}

// Batas atas jumlah pemenang per undian. Dicerminkan oleh lotteryDrawSchema
// (backend) dan services.MAX_DRAW_COUNT — ubah ketiganya bersamaan.
export const MAX_LOTTERY_DRAW_COUNT = 20;

export interface LotteryDrawOptions {
  count?: number;
  round_label?: string;
  /**
   * Kelompok SP Induk yang ikut diundi pada undian ini, mis. ['SP1','SP2'].
   * KOSONG = seluruh kelompok ikut — itulah perilaku sebelum filter ini ada,
   * dan tetap jadi bawaan bila field-nya tidak dikirim.
   */
  induk?: string[];
}

// Hasil POST /api/admin/lottery/draw.
export interface LotteryDrawResult {
  // Alias dari winners[0], dipertahankan sementara agar pemanggil lama tetap
  // benar. Untuk kode baru pakai `winners`.
  winner: LotteryWinner;
  winners: LotteryWinner[];
  remaining: number;
  // Jumlah yang DIMINTA. requested > winners.length berarti pool habis di
  // tengah undian — itu undian sebagian, bukan galat.
  requested: number;
}

export type LotteryVoidReason = 'undo' | 'manual' | 'reset';

// ---------------------------------------------------------------------------
// Pengaturan babak undian.
//
// camelCase, bukan snake_case, karena bentuk ini TIDAK PERNAH menyentuh API —
// ia hidup di localStorage tab kontrol dan disiarkan ke tab layar besar lewat
// BroadcastChannel. Hanya `roundLabel` dan `count` yang berpengaruh ke server,
// dan keduanya dikirim terpisah sebagai LotteryDrawOptions.
// ---------------------------------------------------------------------------

export type LotteryEffect = 'none' | 'drumroll';
export type LotteryNameScale = 'sedang' | 'besar' | 'raksasa';

export interface LotterySettings {
  roundLabel: string;
  count: number;
  /** 0 = langsung tampilkan hasil, tanpa animasi reel. */
  durationMs: number;
  scale: LotteryNameScale;
  effect: LotteryEffect;
  /**
   * Kelompok SP Induk yang ikut diundi pada babak ini. KOSONG = semua kelompok.
   *
   * Ikut tersimpan di preset babak (LotteryPreset), sehingga satu preset bisa
   * berarti "Doorprize SP1-SP3". Nilai ini hanya kenyamanan lokal — yang
   * menentukan siapa boleh menang tetap filter yang dikirim ke server saat
   * mengundi (lihat LotteryDrawOptions.induk).
   */
  induk: string[];
}

/** Satu preset babak yang disimpan panitia sebelum acara. */
export interface LotteryPreset extends LotterySettings {
  name: string;
}
