// ---------------------------------------------------------------------------
// SP Portal — Frontend data layer: REAL implementation (FastAPI backend).
//
// Dipilih oleh `./api.ts` saat DEMO_MODE = false (VITE_DEMO_MODE=false). Setiap
// fungsi memetakan 1:1 ke endpoint backend di folder `backend/`.
//
// STATUS: KERANGKA — plumbing (request/auth/error) sudah lengkap & fungsi sudah
// dipetakan ke endpoint, TETAPI belum diverifikasi terhadap backend yang berjalan.
// Uji tiap endpoint (mis. via Postman / di UI) sebelum memakai mode real di
// produksi. Catatan khusus: `exportCsv` masih stub (lihat di bawah).
// ---------------------------------------------------------------------------

import type {
  Committee,
  EventSettings,
  NotificationChannel,
  NotificationLog,
  Participant,
  ParticipantInput,
  ParticipantWithSession,
  PublicSpIndukGroup,
  RegistrationInput,
  RegistrationStatus,
  SessionWithParticipants,
  SpIndukGroup,
  Stats,
} from '../types';
// Type-only imports (di-erase saat build) — tidak memicu modul mock dimuat.
import type { BroadcastResult, Session, SessionFullUpdate } from './api.mock';
import { RegistrationClosedError } from './api.errors';
import { API_BASE_URL } from './mode';

const LS_SESSION = 'sp.session'; // selaras dengan mock (auth session)

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function authToken(): string | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.token ?? null;
  } catch {
    return null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const tok = authToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail = data && (data.detail ?? data.message);
    const msg = typeof detail === 'string' ? detail : `Permintaan gagal (${res.status}).`;
    throw new HttpError(res.status, msg);
  }
  return data as T;
}

// ===========================================================================
// PUBLIC
// ===========================================================================

export function getSetupStatus(): Promise<{ only_default_admin: boolean }> {
  return request<{ only_default_admin: boolean }>('GET', '/api/setup-status');
}

export function getEventSettings(): Promise<EventSettings> {
  return request<EventSettings>('GET', '/api/event');
}

export function getRegistrationStatus(): Promise<RegistrationStatus> {
  return request<RegistrationStatus>('GET', '/api/event/status');
}

export async function submitRegistration(input: RegistrationInput): Promise<SessionWithParticipants> {
  try {
    return await request<SessionWithParticipants>('POST', '/api/registrations', input);
  } catch (e) {
    // Backend mengembalikan 403 bila pendaftaran ditutup / lewat tenggat.
    if (e instanceof HttpError && e.status === 403) throw new RegistrationClosedError(e.message);
    throw e;
  }
}

export function getSessionByToken(tok: string): Promise<SessionWithParticipants | null> {
  return request<SessionWithParticipants | null>('GET', `/api/registrations/token/${encodeURIComponent(tok)}`);
}

export function updateSessionByToken(
  tok: string,
  patch: SessionFullUpdate,
): Promise<SessionWithParticipants> {
  return request<SessionWithParticipants>('PATCH', `/api/registrations/token/${encodeURIComponent(tok)}`, patch);
}

export function cancelRegistrationByToken(tok: string): Promise<SessionWithParticipants> {
  return request<SessionWithParticipants>('POST', `/api/registrations/token/${encodeURIComponent(tok)}/cancel`);
}

export function getPublicParticipants(): Promise<PublicSpIndukGroup[]> {
  return request<PublicSpIndukGroup[]>('GET', '/api/participants/public');
}

// ===========================================================================
// AUTH
// ===========================================================================

export async function login(email: string, password: string): Promise<Session> {
  const session = await request<Session>('POST', '/api/auth/login', { email, password });
  localStorage.setItem(LS_SESSION, JSON.stringify(session));
  return session;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function logout(): void {
  const tok = authToken();
  localStorage.removeItem(LS_SESSION);
  // Best-effort server notify; abaikan hasilnya.
  if (tok) {
    void fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
    }).catch(() => undefined);
  }
}

// ===========================================================================
// ADMIN — sessions & participants
// ===========================================================================

export function listSessions(): Promise<SessionWithParticipants[]> {
  return request<SessionWithParticipants[]>('GET', '/api/admin/sessions');
}

export function getSessionById(id: string): Promise<SessionWithParticipants | null> {
  return request<SessionWithParticipants | null>('GET', `/api/admin/sessions/${encodeURIComponent(id)}`);
}

export async function deleteSession(id: string): Promise<void> {
  await request<void>('DELETE', `/api/admin/sessions/${encodeURIComponent(id)}`);
}

export function addParticipant(session_id: string, input: ParticipantInput): Promise<Participant> {
  return request<Participant>('POST', `/api/admin/sessions/${encodeURIComponent(session_id)}/participants`, input);
}

export function updateParticipant(id: string, patch: Partial<Participant>): Promise<Participant> {
  return request<Participant>('PATCH', `/api/admin/participants/${encodeURIComponent(id)}`, patch);
}

export async function deleteParticipant(id: string): Promise<void> {
  await request<void>('DELETE', `/api/admin/participants/${encodeURIComponent(id)}`);
}

export function checkInParticipant(id: string, value = true): Promise<Participant> {
  return request<Participant>('POST', `/api/admin/participants/${encodeURIComponent(id)}/checkin`, { value });
}

export async function checkInSession(session_id: string, value = true): Promise<number> {
  const r = await request<{ count: number }>(
    'POST',
    `/api/admin/sessions/${encodeURIComponent(session_id)}/checkin-all`,
    { value },
  );
  return r.count;
}

export function setParticipantStatus(
  id: string,
  status: Participant['attendance_status'],
): Promise<Participant> {
  return request<Participant>('POST', `/api/admin/participants/${encodeURIComponent(id)}/status`, { status });
}

// ===========================================================================
// ADMIN — check-in search, grouping, stats
// ===========================================================================

export function findForCheckIn(query: string): Promise<ParticipantWithSession[]> {
  return request<ParticipantWithSession[]>('GET', `/api/admin/checkin/search?q=${encodeURIComponent(query)}`);
}

export function listSpInduk(): Promise<string[]> {
  return request<string[]>('GET', '/api/admin/sp-induk');
}

export function getGroupedBySpInduk(opts: { onlyAttending?: boolean } = {}): Promise<SpIndukGroup[]> {
  const only = opts.onlyAttending ?? true;
  return request<SpIndukGroup[]>('GET', `/api/admin/participants/grouped?only_attending=${only}`);
}

export function getStats(): Promise<Stats> {
  return request<Stats>('GET', '/api/admin/stats');
}

// CSV export: backend mengembalikan teks CSV (UTF-8 BOM) dari GET
// /api/admin/export/csv. Tanda tangannya async (Promise<string>) — sama dengan
// mock — sehingga pemanggil cukup `await exportCsv(...)`.
export async function exportCsv(opts: { induk?: string } = {}): Promise<string> {
  const tok = authToken();
  const qs = opts.induk ? `?induk=${encodeURIComponent(opts.induk)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/admin/export/csv${qs}`, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (!res.ok) {
    let detail = `Gagal mengunduh CSV (${res.status}).`;
    try {
      const data = JSON.parse(await res.text());
      if (typeof data?.detail === 'string') detail = data.detail;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new HttpError(res.status, detail);
  }
  return res.text();
}

// ===========================================================================
// ADMIN — notifications (backend: log-only, belum kirim WA/email)
// ===========================================================================

export function broadcastReminder(opts: {
  induk?: string;
  onlyAttending?: boolean;
  channels: NotificationChannel[];
}): Promise<BroadcastResult> {
  return request<BroadcastResult>('POST', '/api/admin/notifications/broadcast', {
    induk: opts.induk,
    onlyAttending: opts.onlyAttending ?? true,
    channels: opts.channels,
  });
}

export function listLogs(): Promise<NotificationLog[]> {
  return request<NotificationLog[]>('GET', '/api/admin/notifications/logs');
}

export function retryLog(id: string): Promise<NotificationLog> {
  return request<NotificationLog>('POST', `/api/admin/notifications/logs/${encodeURIComponent(id)}/retry`);
}

// ===========================================================================
// ADMIN — event settings & committees
// ===========================================================================

export function updateEventSettings(patch: Partial<EventSettings>): Promise<EventSettings> {
  return request<EventSettings>('PATCH', '/api/admin/event', patch);
}

export function listCommittees(): Promise<Committee[]> {
  return request<Committee[]>('GET', '/api/admin/committees');
}

export function createCommittee(input: {
  name: string;
  email: string;
  password: string;
  role: Committee['role'];
}): Promise<Committee> {
  return request<Committee>('POST', '/api/admin/committees', input);
}

export function setCommitteeActive(id: string, active: boolean): Promise<Committee> {
  return request<Committee>('POST', `/api/admin/committees/${encodeURIComponent(id)}/toggle`, { is_active: active });
}

export function updateCommittee(
  id: string,
  patch: { name?: string; email?: string; role?: Committee['role']; password?: string },
): Promise<Committee> {
  return request<Committee>('PATCH', `/api/admin/committees/${encodeURIComponent(id)}`, patch);
}

export function deleteCommittee(id: string): Promise<{ id: string }> {
  return request<{ id: string }>('DELETE', `/api/admin/committees/${encodeURIComponent(id)}`);
}
