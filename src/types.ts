// Domain types mirroring the PRD database schema (snake_case kept on the wire,
// but exposed here as the shapes the frontend consumes).

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

export interface Registrant {
  id: string;
  full_name: string;
  birth_place_date: string;
  whatsapp_number: string;
  email: string;
  last_occupation: string;
  family_branch: string;
  group_size: number;
  group_details: string;
  accommodation: string;
  sp_code?: string;
  attendance_status: AttendanceStatus;
  privacy_consent: boolean;
  manage_token: string;
  is_checked_in: boolean;
  checked_in_at: string | null;
  registered_at: string;
  updated_at: string | null;
}

// Payload the public registration form submits.
export interface RegistrationInput {
  full_name: string;
  birth_place_date: string;
  whatsapp_number: string;
  email: string;
  last_occupation: string;
  family_branch: string;
  group_size: number;
  group_details: string;
  accommodation: string;
  sp_code?: string;
  privacy_consent: boolean;
  // Honeypot anti-spam field — must stay empty for a real human.
  website?: string;
}

export interface EventSettings {
  id: string;
  event_name: string;
  event_date: string;
  location: string;
  address: string;
  maps_query: string;
  max_capacity: number | null;
  registration_deadline: string | null;
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
  registrant_id: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  error_message: string | null;
  created_at: string;
}

// Computed registration availability for the public area.
export interface RegistrationStatus {
  open: boolean;
  reason: 'open' | 'closed_manual' | 'quota_full' | 'past_deadline';
  message: string;
  total_registered: number;
  total_people: number;
  capacity: number | null;
  deadline: string | null;
}

export interface Stats {
  total_registrants: number;
  total_people: number;
  total_cancelled: number;
  total_checked_in: number;
  by_branch: { branch: string; count: number; people: number }[];
  trend: { date: string; count: number }[];
}
