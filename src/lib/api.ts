// ---------------------------------------------------------------------------
// SP Portal — Frontend data layer (v3.1).
//
// localStorage-backed MOCK of the FastAPI backend in the PRD, so the UI is fully
// runnable without a server. Core model: a RegistrationSession groups many
// Participant rows entered directly (no separate "pendata"). Every function maps
// ~1:1 to a backend endpoint; to go live, replace the bodies with
// `fetch(import.meta.env.VITE_API_URL + ...)`.
// ---------------------------------------------------------------------------

import type {
  Committee,
  EventSettings,
  NotificationChannel,
  NotificationLog,
  NotificationType,
  Participant,
  ParticipantInput,
  ParticipantWithSession,
  RegistrationInput,
  RegistrationSession,
  RegistrationStatus,
  SessionWithParticipants,
  SpIndukGroup,
  Stats,
} from '../types';
import { calculateAge, compareSpCode, normalizeSpCode, normalizeWhatsApp, spInduk } from './format';

const LS = {
  sessions: 'sp.sessions',
  participants: 'sp.participants',
  committees: 'sp.committees',
  event: 'sp.event_settings',
  logs: 'sp.notification_logs',
  session: 'sp.session', // auth session (login)
  passwords: 'sp.passwords',
  seeded: 'sp.seeded.v3_2',
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

// Public, human-readable check-in code derived from the session manage token.
export function shortCode(s: Pick<RegistrationSession, 'manage_token'>): string {
  return ('SP-' + s.manage_token.slice(0, 6)).toUpperCase();
}

// ----- composition helpers --------------------------------------------------
function participantsOf(sessionId: string, all?: Participant[]): Participant[] {
  const list = all ?? read<Participant[]>(LS.participants, []);
  return list.filter((p) => p.session_id === sessionId).sort((a, b) => compareSpCode(a.sp_code, b.sp_code));
}
function withParticipants(s: RegistrationSession, all?: Participant[]): SessionWithParticipants {
  return { ...s, participants: participantsOf(s.id, all) };
}
function flatten(p: Participant, s: RegistrationSession): ParticipantWithSession {
  return { ...p, manage_token: s.manage_token, registered_at: s.registered_at };
}
function sessionActive(s: RegistrationSession, all?: Participant[]): boolean {
  return participantsOf(s.id, all).some((p) => p.attendance_status === 'will_attend');
}

// ----- seeding --------------------------------------------------------------
function seed(): void {
  if (read(LS.seeded, false)) return;

  const event: EventSettings = {
    id: uid(),
    event_name: 'Reuni Akbar Keluarga Soero Pramono 2026',
    event_date: '2026-08-17T09:00:00.000Z',
    location: 'Sajian Kembang Turi',
    address: 'Sleman, Yogyakarta',
    maps_query: 'Sajian Kembang Turi',
    registration_deadline: '2026-08-01T16:59:00.000Z',
    registration_open: true,
    updated_at: nowISO(),
  };

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

  const sessions: RegistrationSession[] = [];
  const participants: Participant[] = [];

  function addSession(
    parts: Array<Partial<Participant> & { full_name: string; sp_code: string }>,
    opts: { daysAgo?: number; cancelled?: boolean } = {},
  ) {
    const id = uid();
    sessions.push({
      id,
      manage_token: token(),
      privacy_consent: true,
      registered_at: new Date(Date.now() - (opts.daysAgo ?? 1) * 86400000).toISOString(),
      updated_at: null,
    });
    for (const p of parts) {
      const checked = !!p.is_checked_in;
      participants.push({
        id: uid(),
        session_id: id,
        full_name: p.full_name,
        sp_code: normalizeSpCode(p.sp_code),
        birth_date: p.birth_date ?? '',
        address: p.address ?? '',
        last_occupation: p.last_occupation ?? '',
        accommodation: p.accommodation ?? '',
        email: p.email ?? null,
        whatsapp_number: p.whatsapp_number ?? null,
        attendance_status: opts.cancelled ? 'cancelled' : p.attendance_status ?? 'will_attend',
        is_checked_in: checked,
        checked_in_at: checked ? nowISO() : null,
      });
    }
  }

  addSession(
    [
      { full_name: 'Yoso Pramono', sp_code: 'SP4', birth_date: '1958-05-05', address: 'Yogyakarta', last_occupation: 'Guru', accommodation: 'Hotel / Penginapan', is_checked_in: true, whatsapp_number: '6281200000001' },
      { full_name: 'Yuli Hastuti', sp_code: 'SP4A', birth_date: '1960-06-12', address: 'Yogyakarta', last_occupation: 'Ibu Rumah Tangga', accommodation: 'Hotel / Penginapan', is_checked_in: true },
    ],
    { daysAgo: 8 },
  );
  addSession(
    [
      { full_name: 'Hesti Wulandari', sp_code: 'SP4.1.3', birth_date: '1985-03-03', address: 'Solo', last_occupation: 'Wiraswasta', accommodation: 'Rumah Keluarga', whatsapp_number: '6281200000002' },
      { full_name: 'Andi Saputra', sp_code: 'SP4.1.3A', birth_date: '1983-09-09', address: 'Solo' },
    ],
    { daysAgo: 7 },
  );
  addSession(
    [
      { full_name: 'Slamet Riyadi', sp_code: 'SP1', birth_date: '1950-01-01', address: 'Magelang', last_occupation: 'Pensiunan', accommodation: 'Rumah Sendiri (warga lokal)', is_checked_in: true },
      { full_name: 'Bagus Nugroho', sp_code: 'SP1.2', birth_date: '1978-08-17', address: 'Magelang' },
    ],
    { daysAgo: 6 },
  );
  addSession(
    [
      { full_name: 'Dewi Anggraini', sp_code: 'SP2', birth_date: '1962-02-20', address: 'Semarang', last_occupation: 'Dokter', accommodation: 'Hotel / Penginapan', email: 'dewi.a@example.com' },
      { full_name: 'Putri Maharani', sp_code: 'SP2.1', birth_date: '1990-11-11', address: 'Jakarta' },
      { full_name: 'Reza Pratama', sp_code: 'SP2.1A', birth_date: '1988-07-07', address: 'Jakarta', accommodation: 'Hotel / Penginapan' },
    ],
    { daysAgo: 4 },
  );
  addSession(
    [{ full_name: 'Agus Salim', sp_code: 'SP3', birth_date: '1965-12-30', address: 'Purworejo' }],
    { daysAgo: 3, cancelled: true },
  );
  addSession(
    [
      { full_name: 'Kartika Sari', sp_code: 'SP4.5', birth_date: '1970-04-25', address: 'Yogyakarta', last_occupation: 'Perawat', accommodation: 'Rumah Keluarga' },
      { full_name: 'Bambang Wijaya', sp_code: 'SP4.5A', birth_date: '1968-02-14', address: 'Yogyakarta' },
      { full_name: 'Fajar Ramadhan', sp_code: 'SP4.2', birth_date: '1992-10-02', address: 'Sleman', last_occupation: 'Desainer' },
    ],
    { daysAgo: 1 },
  );

  write(LS.event, event);
  write(LS.committees, committees);
  write(LS.passwords, passwords);
  write(LS.sessions, sessions);
  write(LS.participants, participants);
  write(LS.logs, [] as NotificationLog[]);
  write(LS.seeded, true);
}
seed();

// ----- notification logging (with simulated reliability) --------------------
function logNotification(
  session_id: string | null,
  type: NotificationType,
  channel: NotificationChannel,
): NotificationLog {
  // ~6% simulated failure to exercise the reliability/retry UI.
  const failed = Math.random() < 0.06;
  const entry: NotificationLog = {
    id: uid(),
    session_id,
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
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const all = read<Participant[]>(LS.participants, []);
  const activeSessions = sessions.filter((s) => sessionActive(s, all));
  const total_people = all.filter((p) => p.attendance_status === 'will_attend').length;

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
  }

  return delay({
    open,
    reason,
    message,
    total_sessions: activeSessions.length,
    total_people,
    deadline: ev.registration_deadline,
  });
}

export class RegistrationClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationClosedError';
  }
}

function buildParticipant(session_id: string, input: ParticipantInput): Participant {
  return {
    id: uid(),
    session_id,
    full_name: input.full_name.trim(),
    sp_code: normalizeSpCode(input.sp_code),
    birth_date: input.birth_date.trim(),
    address: input.address.trim(),
    last_occupation: input.last_occupation?.trim() ?? '',
    accommodation: input.accommodation?.trim() ?? '',
    email: input.email?.trim().toLowerCase() || null,
    whatsapp_number: input.whatsapp_number ? normalizeWhatsApp(input.whatsapp_number) : null,
    attendance_status: 'will_attend',
    is_checked_in: false,
    checked_in_at: null,
  };
}

export async function submitRegistration(input: RegistrationInput): Promise<SessionWithParticipants> {
  // Honeypot: silently reject bots.
  if (input.website && input.website.trim() !== '') {
    throw new Error('Pengiriman ditolak.');
  }

  const status = await getRegistrationStatus();
  if (!status.open) throw new RegistrationClosedError(status.message);

  if (!input.participants || input.participants.length === 0) {
    throw new Error('Minimal satu peserta harus didaftarkan.');
  }

  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const allParts = read<Participant[]>(LS.participants, []);

  const session: RegistrationSession = {
    id: uid(),
    manage_token: token(),
    privacy_consent: !!input.privacy_consent,
    registered_at: nowISO(),
    updated_at: null,
  };
  const newParts = input.participants.map((p) => buildParticipant(session.id, p));

  sessions.unshift(session);
  write(LS.sessions, sessions);
  write(LS.participants, [...newParts, ...allParts]);

  // Fire-and-forget notifications (async/background in the real backend).
  logNotification(session.id, 'committee_blast', 'whatsapp');
  logNotification(session.id, 'committee_blast', 'email');
  logNotification(session.id, 'participant_confirmation', 'whatsapp');
  logNotification(session.id, 'participant_confirmation', 'email');

  return delay(withParticipants(session));
}

// ----- self-service (manage by token) --------------------------------------
export function getSessionByToken(tok: string): Promise<SessionWithParticipants | null> {
  const s = read<RegistrationSession[]>(LS.sessions, []).find((x) => x.manage_token === tok);
  return delay(s ? withParticipants(s) : null);
}

// One comprehensive self-service update: the full participant set. Participants
// WITH an id are updated; WITHOUT id are added; existing ones omitted from the
// list are removed. Status/check-in are preserved on update.
export interface SessionFullUpdate {
  participants?: Array<ParticipantInput & { id?: string }>;
}

export async function updateSessionByToken(
  tok: string,
  patch: SessionFullUpdate,
): Promise<SessionWithParticipants> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const idx = sessions.findIndex((s) => s.manage_token === tok);
  if (idx < 0) throw new Error('Data pendaftaran tidak ditemukan.');
  const cur = sessions[idx];
  sessions[idx] = { ...cur, updated_at: nowISO() };
  write(LS.sessions, sessions);

  if (patch.participants) {
    const all = read<Participant[]>(LS.participants, []);
    const others = all.filter((p) => p.session_id !== cur.id);
    const existing = new Map(all.filter((p) => p.session_id === cur.id).map((p) => [p.id, p]));
    const rebuilt: Participant[] = patch.participants.map((inp) => {
      const prev = inp.id ? existing.get(inp.id) : undefined;
      if (prev) {
        return {
          ...prev,
          full_name: inp.full_name.trim(),
          sp_code: normalizeSpCode(inp.sp_code),
          birth_date: inp.birth_date.trim(),
          address: inp.address.trim(),
          last_occupation: inp.last_occupation?.trim() ?? '',
          accommodation: inp.accommodation?.trim() ?? '',
          email: inp.email?.trim().toLowerCase() || null,
          whatsapp_number: inp.whatsapp_number ? normalizeWhatsApp(inp.whatsapp_number) : null,
        };
      }
      return buildParticipant(cur.id, inp);
    });
    write(LS.participants, [...others, ...rebuilt]);
  }

  logNotification(cur.id, 'committee_blast', 'whatsapp'); // notify panitia of change
  return delay(withParticipants(sessions[idx]));
}

export async function cancelRegistrationByToken(tok: string): Promise<SessionWithParticipants> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const idx = sessions.findIndex((s) => s.manage_token === tok);
  if (idx < 0) throw new Error('Data pendaftaran tidak ditemukan.');
  const cur = sessions[idx];
  sessions[idx] = { ...cur, updated_at: nowISO() };
  write(LS.sessions, sessions);

  const all = read<Participant[]>(LS.participants, []);
  for (const p of all) {
    if (p.session_id === cur.id) p.attendance_status = 'cancelled';
  }
  write(LS.participants, all);

  logNotification(cur.id, 'committee_blast', 'whatsapp');
  return delay(withParticipants(sessions[idx]));
}

// ===========================================================================
// ADMIN API (would be JWT-protected on the backend)
// ===========================================================================

export interface Session {
  token: string;
  committee: Committee;
}

function verifyPassword(email: string, password: string): boolean {
  const pws = read<Record<string, string>>(LS.passwords, {});
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

// ----- sessions & participants (admin) --------------------------------------
export function listSessions(): Promise<SessionWithParticipants[]> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const all = read<Participant[]>(LS.participants, []);
  return delay(sessions.map((s) => withParticipants(s, all)));
}

export function getSessionById(id: string): Promise<SessionWithParticipants | null> {
  const s = read<RegistrationSession[]>(LS.sessions, []).find((x) => x.id === id);
  return delay(s ? withParticipants(s) : null);
}

export async function deleteSession(id: string): Promise<void> {
  write(LS.sessions, read<RegistrationSession[]>(LS.sessions, []).filter((s) => s.id !== id));
  write(LS.participants, read<Participant[]>(LS.participants, []).filter((p) => p.session_id !== id));
  await delay(null, 200);
}

export async function addParticipant(session_id: string, input: ParticipantInput): Promise<Participant> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  if (!sessions.some((s) => s.id === session_id)) throw new Error('Sesi tidak ditemukan.');
  const all = read<Participant[]>(LS.participants, []);
  const p = buildParticipant(session_id, input);
  write(LS.participants, [...all, p]);
  return delay(p);
}

export async function updateParticipant(id: string, patch: Partial<Participant>): Promise<Participant> {
  const all = read<Participant[]>(LS.participants, []);
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Peserta tidak ditemukan.');
  const sp_code = patch.sp_code != null ? normalizeSpCode(patch.sp_code) : all[idx].sp_code;
  all[idx] = { ...all[idx], ...patch, sp_code };
  write(LS.participants, all);
  return delay(all[idx]);
}

export async function deleteParticipant(id: string): Promise<void> {
  write(LS.participants, read<Participant[]>(LS.participants, []).filter((p) => p.id !== id));
  await delay(null, 200);
}

export async function checkInParticipant(id: string, value = true): Promise<Participant> {
  return updateParticipant(id, { is_checked_in: value, checked_in_at: value ? nowISO() : null });
}

export async function setParticipantStatus(
  id: string,
  status: Participant['attendance_status'],
): Promise<Participant> {
  return updateParticipant(id, { attendance_status: status });
}

// ----- check-in search (returns participants with session context) ----------
export function findForCheckIn(query: string): Promise<ParticipantWithSession[]> {
  const q = query.trim().toLowerCase();
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const all = read<Participant[]>(LS.participants, [])
    .filter((p) => p.attendance_status !== 'cancelled')
    .map((p) => {
      const s = byId.get(p.session_id);
      return s ? flatten(p, s) : null;
    })
    .filter((x): x is ParticipantWithSession => x !== null)
    .sort((a, b) => compareSpCode(a.sp_code, b.sp_code));

  if (!q) return delay(all);
  return delay(
    all.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.sp_code.toLowerCase().includes(q) ||
        shortCode(p).toLowerCase().includes(q) ||
        (p.whatsapp_number ?? '').includes(q),
    ),
  );
}

// ----- SP Induk grouping (FR-ADM §5.4) --------------------------------------
export function listSpInduk(): Promise<string[]> {
  const all = read<Participant[]>(LS.participants, []);
  const set = new Set(all.map((p) => spInduk(p.sp_code)));
  return delay(Array.from(set).sort(compareSpCode));
}

export function getGroupedBySpInduk(opts: { onlyAttending?: boolean } = {}): Promise<SpIndukGroup[]> {
  const onlyAttending = opts.onlyAttending ?? true;
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let parts = read<Participant[]>(LS.participants, []);
  if (onlyAttending) parts = parts.filter((p) => p.attendance_status === 'will_attend');

  const groups = new Map<string, ParticipantWithSession[]>();
  for (const p of parts) {
    const s = byId.get(p.session_id);
    if (!s) continue;
    const induk = spInduk(p.sp_code);
    const arr = groups.get(induk) ?? [];
    arr.push(flatten(p, s));
    groups.set(induk, arr);
  }
  const result: SpIndukGroup[] = Array.from(groups.entries())
    .map(([induk, participants]) => ({
      induk,
      participants: participants.sort((a, b) => compareSpCode(a.sp_code, b.sp_code)),
    }))
    .sort((a, b) => compareSpCode(a.induk, b.induk));
  return delay(result);
}

// ----- stats ----------------------------------------------------------------
export function getStats(): Promise<Stats> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const all = read<Participant[]>(LS.participants, []);
  const active = all.filter((p) => p.attendance_status === 'will_attend');

  const indukMap = new Map<string, { people: number; sessions: Set<string> }>();
  for (const p of active) {
    const induk = spInduk(p.sp_code);
    const cur = indukMap.get(induk) ?? { people: 0, sessions: new Set<string>() };
    cur.people += 1;
    cur.sessions.add(p.session_id);
    indukMap.set(induk, cur);
  }

  const trendMap = new Map<string, number>();
  for (const s of sessions) {
    const day = s.registered_at.slice(0, 10);
    trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
  }

  return delay({
    total_sessions: sessions.filter((s) => sessionActive(s, all)).length,
    total_people: active.length,
    total_cancelled: all.filter((p) => p.attendance_status === 'cancelled').length,
    total_checked_in: all.filter((p) => p.is_checked_in).length,
    by_sp_induk: Array.from(indukMap.entries())
      .map(([induk, v]) => ({ induk, sessions: v.sessions.size, people: v.people }))
      .sort((a, b) => compareSpCode(a.induk, b.induk)),
    trend: Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  });
}

// ----- CSV export (UTF-8 BOM, Excel-ready) ----------------------------------
const CSV_HEADERS = [
  'full_name', 'sp_code', 'sp_induk', 'birth_date', 'age', 'address', 'last_occupation',
  'accommodation', 'email', 'whatsapp_number',
  'attendance_status', 'is_checked_in', 'checked_in_at', 'registered_at',
];

export function exportCsv(opts: { induk?: string } = {}): string {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let rows = read<Participant[]>(LS.participants, [])
    .map((p) => {
      const s = byId.get(p.session_id);
      return s ? flatten(p, s) : null;
    })
    .filter((x): x is ParticipantWithSession => x !== null);
  if (opts.induk && opts.induk !== 'all') rows = rows.filter((p) => spInduk(p.sp_code) === opts.induk);
  rows.sort((a, b) => compareSpCode(a.sp_code, b.sp_code));

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((p) =>
    CSV_HEADERS.map((h) => {
      if (h === 'sp_induk') return esc(spInduk(p.sp_code));
      if (h === 'age') return esc(calculateAge(p.birth_date) ?? '');
      return esc((p as unknown as Record<string, unknown>)[h]);
    }).join(','),
  );
  return '﻿' + [CSV_HEADERS.join(','), ...body].join('\r\n');
}

// ----- broadcast reminders --------------------------------------------------
export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  logs: NotificationLog[];
}

export async function broadcastReminder(opts: {
  induk?: string;
  onlyAttending?: boolean;
  channels: NotificationChannel[];
}): Promise<BroadcastResult> {
  const sessions = read<RegistrationSession[]>(LS.sessions, []);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let parts = read<Participant[]>(LS.participants, []);
  if (opts.onlyAttending) parts = parts.filter((p) => p.attendance_status === 'will_attend');
  if (opts.induk && opts.induk !== 'all') parts = parts.filter((p) => spInduk(p.sp_code) === opts.induk);

  // De-duplicate to one message per session.
  const sessionIds = Array.from(new Set(parts.map((p) => p.session_id))).filter((id) => byId.has(id));

  const logs: NotificationLog[] = [];
  for (const sid of sessionIds) {
    for (const ch of opts.channels) logs.push(logNotification(sid, 'reminder', ch));
  }
  return delay(
    {
      total: sessionIds.length,
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
  const pws = read<Record<string, string>>(LS.passwords, {});
  pws[c.email] = input.password;
  write(LS.passwords, pws);
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
