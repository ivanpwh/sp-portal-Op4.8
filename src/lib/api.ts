// ---------------------------------------------------------------------------
// SP Portal — Frontend data layer.
//
// This is a localStorage-backed MOCK of the FastAPI backend described in the
// PRD, so the UI is fully runnable/demoable without a server. Every function
// here maps 1:1 to a backend endpoint; to go live, replace the bodies with
// `fetch(import.meta.env.VITE_API_URL + ...)` calls returning the same shapes.
// ---------------------------------------------------------------------------

import type {
  Committee,
  EventSettings,
  NotificationChannel,
  NotificationLog,
  NotificationType,
  Registrant,
  RegistrationInput,
  RegistrationStatus,
  Stats,
} from '../types';
import { normalizeWhatsApp } from './format';

const LS = {
  registrants: 'sp.registrants',
  committees: 'sp.committees',
  event: 'sp.event_settings',
  logs: 'sp.notification_logs',
  session: 'sp.session',
  seeded: 'sp.seeded.v1',
};

// ----- low level storage helpers -------------------------------------------
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid(): string {
  return (crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
}
function token(): string {
  return Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 10)).join('');
}
function nowISO(): string {
  return new Date().toISOString();
}
// Simulate network latency so loading states are exercised.
function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// Public, human-readable check-in code derived from the manage token.
export function shortCode(r: Pick<Registrant, 'manage_token'>): string {
  return ('SP-' + r.manage_token.slice(0, 6)).toUpperCase();
}

// ----- seeding --------------------------------------------------------------
function seed(): void {
  if (read(LS.seeded, false)) return;

  const event: EventSettings = {
    id: uid(),
    event_name: 'Reuni Akbar Keluarga Soero Pramono 2026',
    event_date: '2026-08-17T09:00:00.000Z',
    location: 'Pendopo Joglo Soero Pramono',
    address: 'Jl. Kenangan No. 17, Yogyakarta',
    maps_query: 'Tugu Yogyakarta',
    max_capacity: 500,
    registration_deadline: '2026-08-01T16:59:00.000Z',
    registration_open: true,
    updated_at: nowISO(),
  };

  // Default super-admin. Password is mock-hashed (see verifyPassword).
  const committees: Committee[] = [
    {
      id: uid(),
      name: 'Panitia Inti',
      email: 'admin@spportal.id',
      role: 'super_admin',
      is_active: true,
      created_at: nowISO(),
    },
  ];
  const passwords: Record<string, string> = { 'admin@spportal.id': 'admin123' };

  const branches = ['Trah Anak ke-1', 'Trah Anak ke-2', 'Trah Anak ke-3', 'Trah Anak ke-4'];
  const sample: Registrant[] = Array.from({ length: 8 }).map((_, i) => {
    const t = token();
    const checked = i % 4 === 0;
    return {
      id: uid(),
      full_name: ['Budi Santoso', 'Siti Aminah', 'Joko Widodo', 'Rina Wati', 'Agus Salim', 'Dewi Lestari', 'Hendra Gunawan', 'Maya Putri'][i],
      birth_place_date: `Yogyakarta, ${5 + i} Januari 19${60 + i}`,
      whatsapp_number: '628' + (1000000000 + i * 13579),
      email: `peserta${i + 1}@example.com`,
      last_occupation: ['Guru', 'Wiraswasta', 'PNS', 'Ibu Rumah Tangga', 'Pensiunan', 'Dokter', 'Petani', 'Mahasiswa'][i],
      family_branch: branches[i % branches.length],
      group_size: (i % 4) + 1,
      group_details: i % 2 === 0 ? 'Bawa istri dan 1 anak' : 'Datang sendiri',
      accommodation: i % 3 === 0 ? 'Rumah Keluarga' : 'Hotel / Penginapan',
      sp_code: i % 2 === 0 ? 'SP' + (100 + i) : undefined,
      attendance_status: i === 7 ? 'cancelled' : 'will_attend',
      privacy_consent: true,
      manage_token: t,
      is_checked_in: checked,
      checked_in_at: checked ? nowISO() : null,
      registered_at: new Date(Date.now() - (8 - i) * 86400000).toISOString(),
      updated_at: null,
    };
  });

  write(LS.event, event);
  write(LS.committees, committees);
  write('sp.passwords', passwords);
  write(LS.registrants, sample);
  write(LS.logs, [] as NotificationLog[]);
  write(LS.seeded, true);
}
seed();

// ----- notification logging (with simulated reliability) --------------------
function logNotification(
  registrant_id: string | null,
  type: NotificationType,
  channel: NotificationChannel,
): NotificationLog {
  // ~6% simulated failure to exercise the reliability/retry UI.
  const failed = Math.random() < 0.06;
  const entry: NotificationLog = {
    id: uid(),
    registrant_id,
    type,
    channel,
    status: failed ? 'failed' : 'sent',
    error_message: failed ? 'Gateway timeout (simulasi)' : null,
    created_at: nowISO(),
  };
  const logs = read<NotificationLog[]>(LS.logs, []);
  logs.unshift(entry);
  write(LS.logs, logs);
  return entry;
}

// ===========================================================================
// PUBLIC API
// ===========================================================================

export function getEventSettings(): Promise<EventSettings> {
  return delay(read<EventSettings>(LS.event, {} as EventSettings));
}

export function getRegistrationStatus(): Promise<RegistrationStatus> {
  const ev = read<EventSettings>(LS.event, {} as EventSettings);
  const regs = read<Registrant[]>(LS.registrants, []);
  const active = regs.filter((r) => r.attendance_status === 'will_attend');
  const total_people = active.reduce((s, r) => s + (r.group_size || 1), 0);

  let open = true;
  let reason: RegistrationStatus['reason'] = 'open';
  let message = 'Pendaftaran sedang dibuka.';

  if (!ev.registration_open) {
    open = false;
    reason = 'closed_manual';
    message = 'Pendaftaran ditutup sementara oleh panitia.';
  } else if (ev.registration_deadline && new Date(ev.registration_deadline) < new Date()) {
    open = false;
    reason = 'past_deadline';
    message = 'Maaf, batas waktu pendaftaran telah berakhir.';
  } else if (ev.max_capacity != null && active.length >= ev.max_capacity) {
    open = false;
    reason = 'quota_full';
    message = 'Maaf, kuota peserta sudah penuh.';
  }

  return delay({
    open,
    reason,
    message,
    total_registered: active.length,
    total_people,
    capacity: ev.max_capacity,
    deadline: ev.registration_deadline,
  });
}

export class DuplicateError extends Error {
  constructor(public registrant: Registrant) {
    super('Nomor WhatsApp atau email sudah terdaftar.');
    this.name = 'DuplicateError';
  }
}
export class RegistrationClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}

export async function submitRegistration(input: RegistrationInput): Promise<Registrant> {
  // Honeypot: silently reject bots (pretend success would also be valid; we throw).
  if (input.website && input.website.trim() !== '') {
    throw new Error('Pengiriman ditolak.');
  }

  const status = await getRegistrationStatus();
  if (!status.open) throw new RegistrationClosedError(status.message);

  const regs = read<Registrant[]>(LS.registrants, []);
  const wa = normalizeWhatsApp(input.whatsapp_number);
  const email = input.email.trim().toLowerCase();

  // Duplicate prevention by WhatsApp/email.
  const dup = regs.find(
    (r) =>
      r.attendance_status !== 'cancelled' &&
      (r.whatsapp_number === wa || r.email.toLowerCase() === email),
  );
  if (dup) throw new DuplicateError(dup);

  const r: Registrant = {
    id: uid(),
    full_name: input.full_name.trim(),
    birth_place_date: input.birth_place_date.trim(),
    whatsapp_number: wa,
    email,
    last_occupation: input.last_occupation.trim(),
    family_branch: input.family_branch,
    group_size: Math.max(1, Number(input.group_size) || 1),
    group_details: input.group_details.trim(),
    accommodation: input.accommodation.trim(),
    sp_code: input.sp_code?.trim() || undefined,
    attendance_status: 'will_attend',
    privacy_consent: !!input.privacy_consent,
    manage_token: token(),
    is_checked_in: false,
    checked_in_at: null,
    registered_at: nowISO(),
    updated_at: null,
  };
  regs.unshift(r);
  write(LS.registrants, regs);

  // Fire-and-forget notifications (async/background in the real backend).
  logNotification(r.id, 'committee_blast', 'whatsapp');
  logNotification(r.id, 'committee_blast', 'email');
  logNotification(r.id, 'participant_confirmation', 'whatsapp');
  logNotification(r.id, 'participant_confirmation', 'email');

  return delay(r);
}

// ----- self-service (manage by token) --------------------------------------
export function getRegistrantByToken(tok: string): Promise<Registrant | null> {
  const regs = read<Registrant[]>(LS.registrants, []);
  return delay(regs.find((r) => r.manage_token === tok) ?? null);
}

export async function updateRegistrationByToken(
  tok: string,
  patch: Partial<RegistrationInput>,
): Promise<Registrant> {
  const regs = read<Registrant[]>(LS.registrants, []);
  const idx = regs.findIndex((r) => r.manage_token === tok);
  if (idx < 0) throw new Error('Data pendaftaran tidak ditemukan.');
  const cur = regs[idx];
  const next: Registrant = {
    ...cur,
    full_name: patch.full_name?.trim() ?? cur.full_name,
    birth_place_date: patch.birth_place_date?.trim() ?? cur.birth_place_date,
    whatsapp_number: patch.whatsapp_number ? normalizeWhatsApp(patch.whatsapp_number) : cur.whatsapp_number,
    email: patch.email?.trim().toLowerCase() ?? cur.email,
    last_occupation: patch.last_occupation?.trim() ?? cur.last_occupation,
    family_branch: patch.family_branch ?? cur.family_branch,
    group_size: patch.group_size != null ? Math.max(1, Number(patch.group_size)) : cur.group_size,
    group_details: patch.group_details?.trim() ?? cur.group_details,
    accommodation: patch.accommodation?.trim() ?? cur.accommodation,
    sp_code: patch.sp_code !== undefined ? patch.sp_code?.trim() || undefined : cur.sp_code,
    updated_at: nowISO(),
  };
  regs[idx] = next;
  write(LS.registrants, regs);
  logNotification(next.id, 'committee_blast', 'whatsapp'); // notify panitia of change
  return delay(next);
}

export async function cancelRegistrationByToken(tok: string): Promise<Registrant> {
  const regs = read<Registrant[]>(LS.registrants, []);
  const idx = regs.findIndex((r) => r.manage_token === tok);
  if (idx < 0) throw new Error('Data pendaftaran tidak ditemukan.');
  regs[idx] = { ...regs[idx], attendance_status: 'cancelled', updated_at: nowISO() };
  write(LS.registrants, regs);
  logNotification(regs[idx].id, 'committee_blast', 'whatsapp');
  return delay(regs[idx]);
}

// ===========================================================================
// ADMIN API (would be JWT-protected on the backend)
// ===========================================================================

export interface Session {
  token: string;
  committee: Committee;
}

// Mock password store + naive "hash" check.
function verifyPassword(email: string, password: string): boolean {
  const pws = read<Record<string, string>>('sp.passwords', {});
  return pws[email] === password;
}

export async function login(email: string, password: string): Promise<Session> {
  const committees = read<Committee[]>(LS.committees, []);
  const c = committees.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!c || !verifyPassword(c.email, password)) {
    throw new Error('Email atau kata sandi salah.');
  }
  if (!c.is_active) throw new Error('Akun panitia ini telah dinonaktifkan.');
  const session: Session = { token: 'jwt.' + uid(), committee: c };
  write(LS.session, session);
  return delay(session, 250);
}

export function getSession(): Session | null {
  return read<Session | null>(LS.session, null);
}
export function logout(): void {
  localStorage.removeItem(LS.session);
}

export function listRegistrants(): Promise<Registrant[]> {
  return delay(read<Registrant[]>(LS.registrants, []));
}

export function getRegistrant(id: string): Promise<Registrant | null> {
  const regs = read<Registrant[]>(LS.registrants, []);
  return delay(regs.find((r) => r.id === id) ?? null);
}

export async function adminUpdateRegistrant(
  id: string,
  patch: Partial<Registrant>,
): Promise<Registrant> {
  const regs = read<Registrant[]>(LS.registrants, []);
  const idx = regs.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error('Pendaftar tidak ditemukan.');
  regs[idx] = { ...regs[idx], ...patch, updated_at: nowISO() };
  write(LS.registrants, regs);
  return delay(regs[idx]);
}

export async function deleteRegistrant(id: string): Promise<void> {
  const regs = read<Registrant[]>(LS.registrants, []).filter((r) => r.id !== id);
  write(LS.registrants, regs);
  await delay(null, 200);
}

export async function checkIn(id: string, value = true): Promise<Registrant> {
  return adminUpdateRegistrant(id, {
    is_checked_in: value,
    checked_in_at: value ? nowISO() : null,
  });
}

export function findForCheckIn(query: string): Promise<Registrant[]> {
  const q = query.trim().toLowerCase();
  const regs = read<Registrant[]>(LS.registrants, []).filter(
    (r) => r.attendance_status !== 'cancelled',
  );
  if (!q) return delay(regs);
  return delay(
    regs.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        shortCode(r).toLowerCase().includes(q) ||
        r.manage_token.toLowerCase().includes(q) ||
        r.whatsapp_number.includes(q),
    ),
  );
}

// ----- stats ----------------------------------------------------------------
export function getStats(): Promise<Stats> {
  const regs = read<Registrant[]>(LS.registrants, []);
  const active = regs.filter((r) => r.attendance_status === 'will_attend');

  const branchMap = new Map<string, { count: number; people: number }>();
  for (const r of active) {
    const cur = branchMap.get(r.family_branch) ?? { count: 0, people: 0 };
    cur.count += 1;
    cur.people += r.group_size || 1;
    branchMap.set(r.family_branch, cur);
  }

  const trendMap = new Map<string, number>();
  for (const r of regs) {
    const day = r.registered_at.slice(0, 10);
    trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
  }

  return delay({
    total_registrants: active.length,
    total_people: active.reduce((s, r) => s + (r.group_size || 1), 0),
    total_cancelled: regs.filter((r) => r.attendance_status === 'cancelled').length,
    total_checked_in: regs.filter((r) => r.is_checked_in).length,
    by_branch: Array.from(branchMap.entries())
      .map(([branch, v]) => ({ branch, ...v }))
      .sort((a, b) => b.count - a.count),
    trend: Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}

// ----- CSV export (UTF-8 BOM, Excel-ready) ----------------------------------
export function exportCsv(): string {
  const regs = read<Registrant[]>(LS.registrants, []);
  const headers = [
    'full_name', 'birth_place_date', 'whatsapp_number', 'email', 'last_occupation',
    'family_branch', 'group_size', 'group_details', 'accommodation', 'sp_code',
    'attendance_status', 'is_checked_in', 'checked_in_at', 'registered_at',
  ];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = regs.map((r) =>
    headers.map((h) => esc((r as unknown as Record<string, unknown>)[h])).join(','),
  );
  return '﻿' + [headers.join(','), ...rows].join('\r\n');
}

// ----- broadcast reminders --------------------------------------------------
export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  logs: NotificationLog[];
}

export async function broadcastReminder(opts: {
  branch?: string;
  onlyAttending?: boolean;
  channels: NotificationChannel[];
}): Promise<BroadcastResult> {
  let regs = read<Registrant[]>(LS.registrants, []);
  if (opts.onlyAttending) regs = regs.filter((r) => r.attendance_status === 'will_attend');
  if (opts.branch && opts.branch !== 'all') regs = regs.filter((r) => r.family_branch === opts.branch);

  const logs: NotificationLog[] = [];
  for (const r of regs) {
    for (const ch of opts.channels) logs.push(logNotification(r.id, 'reminder', ch));
  }
  return delay(
    {
      total: regs.length,
      sent: logs.filter((l) => l.status === 'sent').length,
      failed: logs.filter((l) => l.status === 'failed').length,
      logs,
    },
    700,
  );
}

export function listLogs(): Promise<NotificationLog[]> {
  return delay(read<NotificationLog[]>(LS.logs, []));
}

export async function retryLog(id: string): Promise<NotificationLog> {
  const logs = read<NotificationLog[]>(LS.logs, []);
  const idx = logs.findIndex((l) => l.id === id);
  if (idx < 0) throw new Error('Log tidak ditemukan.');
  const ok = Math.random() < 0.8;
  logs[idx] = {
    ...logs[idx],
    status: ok ? 'sent' : 'failed',
    error_message: ok ? null : 'Masih gagal (simulasi)',
    created_at: nowISO(),
  };
  write(LS.logs, logs);
  return delay(logs[idx], 400);
}

// ----- event settings (admin) ----------------------------------------------
export async function updateEventSettings(patch: Partial<EventSettings>): Promise<EventSettings> {
  const cur = read<EventSettings>(LS.event, {} as EventSettings);
  const next = { ...cur, ...patch, updated_at: nowISO() };
  write(LS.event, next);
  return delay(next);
}

// ----- committees (super-admin) ---------------------------------------------
export function listCommittees(): Promise<Committee[]> {
  return delay(read<Committee[]>(LS.committees, []));
}

export async function createCommittee(input: {
  name: string;
  email: string;
  password: string;
  role: Committee['role'];
}): Promise<Committee> {
  const committees = read<Committee[]>(LS.committees, []);
  if (committees.some((c) => c.email.toLowerCase() === input.email.toLowerCase())) {
    throw new Error('Email panitia sudah digunakan.');
  }
  const c: Committee = {
    id: uid(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    is_active: true,
    created_at: nowISO(),
  };
  committees.push(c);
  write(LS.committees, committees);
  const pws = read<Record<string, string>>('sp.passwords', {});
  pws[c.email] = input.password;
  write('sp.passwords', pws);
  return delay(c);
}

export async function setCommitteeActive(id: string, active: boolean): Promise<Committee> {
  const committees = read<Committee[]>(LS.committees, []);
  const idx = committees.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error('Akun tidak ditemukan.');
  committees[idx] = { ...committees[idx], is_active: active };
  write(LS.committees, committees);
  return delay(committees[idx]);
}
