// Business logic ported from services.py: event singleton, registration status,
// participant building, notifications (log-only), SP-Induk grouping, check-in
// search, stats, CSV export, and broadcast.

import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { settings } from './config';
import {
  flatten,
  notificationLogDict,
  participantDict,
} from './serializers';
import {
  calculateAge,
  compareSpCode,
  jsStr,
  normalizeSpCode,
  normalizeWhatsapp,
  nowIso,
  parseIso,
  shortCode,
  spInduk,
  uid,
} from './utils';

// Shape of a participant as received from the wire (snake_case), used by the
// public/admin create + update endpoints.
export interface ParticipantInputData {
  full_name: string;
  nickname?: string | null;
  sp_code: string;
  birth_date?: string | null;
  address?: string | null;
  address_detail?: string | null;
  last_occupation?: string | null;
  accommodation?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
}

// ---------------------------------------------------------------------------
// Event settings (singleton)
// ---------------------------------------------------------------------------

export async function getEvent() {
  let ev = await prisma.eventSettings.findFirst();
  if (ev === null) {
    // defensive — bootstrap normally creates this
    ev = await prisma.eventSettings.create({
      data: {
        id: uid(),
        eventName: '',
        tagline: '',
        eventDate: '',
        location: '',
        address: '',
        mapsQuery: '',
        registrationDeadline: null,
        registrationOpen: true,
        qrCheckinEnabled: true,
        updatedAt: nowIso(),
      },
    });
  }
  return ev;
}

// ---------------------------------------------------------------------------
// Participant building
// ---------------------------------------------------------------------------

/** Build the Prisma create-data for a Participant (mirrors build_participant). */
export function buildParticipantData(
  sessionId: string,
  inp: ParticipantInputData,
): Prisma.ParticipantCreateManyInput {
  const email = (inp.email || '').trim().toLowerCase() || null;
  const wa = inp.whatsapp_number ? normalizeWhatsapp(inp.whatsapp_number) : null;
  return {
    id: uid(),
    sessionId,
    fullName: inp.full_name.trim(),
    nickname: (inp.nickname || '').trim(),
    spCode: normalizeSpCode(inp.sp_code),
    birthDate: (inp.birth_date || '').trim(),
    address: (inp.address || '').trim(),
    addressDetail: (inp.address_detail || '').trim(),
    lastOccupation: (inp.last_occupation || '').trim(),
    accommodation: (inp.accommodation || '').trim(),
    email,
    whatsappNumber: wa,
    attendanceStatus: 'will_attend',
    isCheckedIn: false,
    checkedInAt: null,
  };
}

// ---------------------------------------------------------------------------
// Notifications (log-only)
// ---------------------------------------------------------------------------

/**
 * Record a notification intent. No real WA/email is dispatched — when a gateway
 * is added, send here and set status accordingly.
 */
export async function logNotification(
  sessionId: string | null,
  type: string,
  channel: string,
) {
  const status = settings.notificationsEnabled ? 'sent' : 'dry_run';
  return prisma.notificationLog.create({
    data: {
      id: uid(),
      sessionId,
      type,
      channel,
      status,
      errorMessage: null,
      createdAt: nowIso(),
    },
  });
}

// ---------------------------------------------------------------------------
// Registration status
// ---------------------------------------------------------------------------

export async function computeRegistrationStatus() {
  const ev = await getEvent();
  const sessions = await prisma.registrationSession.findMany({
    include: { participants: true },
  });
  const activeCount = sessions.filter((s) =>
    s.participants.some((p) => p.attendanceStatus === 'will_attend'),
  ).length;
  const totalPeople = await prisma.participant.count({
    where: { attendanceStatus: 'will_attend' },
  });

  let open = true;
  let reason: 'open' | 'closed_manual' | 'past_deadline' = 'open';
  let message = 'Pendaftaran sedang dibuka.';

  const deadline = parseIso(ev.registrationDeadline);
  if (!ev.registrationOpen) {
    open = false;
    reason = 'closed_manual';
    message = 'Pendaftaran ditutup sementara oleh panitia.';
  } else if (deadline !== null && deadline.getTime() < Date.now()) {
    open = false;
    reason = 'past_deadline';
    message = 'Maaf, batas waktu pendaftaran telah berakhir.';
  }

  return {
    open,
    reason,
    message,
    total_sessions: activeCount,
    total_people: totalPeople,
    deadline: ev.registrationDeadline,
  };
}

// ---------------------------------------------------------------------------
// SP Induk grouping + check-in search
// ---------------------------------------------------------------------------

export async function groupedBySpInduk(onlyAttending = true) {
  const sessions = await prisma.registrationSession.findMany();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let parts = await prisma.participant.findMany();
  if (onlyAttending) parts = parts.filter((p) => p.attendanceStatus === 'will_attend');

  const groups = new Map<string, ReturnType<typeof flatten>[]>();
  for (const p of parts) {
    const s = byId.get(p.sessionId);
    if (!s) continue;
    const key = spInduk(p.spCode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(flatten(p, s));
  }

  const induks = [...groups.keys()].sort(compareSpCode);
  return induks.map((induk) => ({
    induk,
    participants: groups.get(induk)!.sort((a, b) => compareSpCode(a.sp_code, b.sp_code)),
  }));
}

export async function listSpInduk(): Promise<string[]> {
  const parts = await prisma.participant.findMany({ select: { spCode: true } });
  const set = new Set<string>();
  for (const p of parts) set.add(spInduk(p.spCode));
  return [...set].sort(compareSpCode);
}

export async function publicParticipants() {
  const groups = await groupedBySpInduk(true);
  return groups.map((g) => ({
    induk: g.induk,
    participants: g.participants.map((p) => ({
      full_name: p.full_name,
      nickname: p.nickname,
      sp_code: p.sp_code,
      whatsapp_number: p.whatsapp_number,
      email: p.email,
    })),
  }));
}

export async function findForCheckin(query: string) {
  const q = (query || '').trim().toLowerCase();
  const sessions = await prisma.registrationSession.findMany();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const parts = await prisma.participant.findMany();

  const items = [] as ReturnType<typeof flatten>[];
  for (const p of parts) {
    if (p.attendanceStatus === 'cancelled') continue;
    const s = byId.get(p.sessionId);
    if (!s) continue;
    items.push(flatten(p, s));
  }
  items.sort((a, b) => compareSpCode(a.sp_code, b.sp_code));

  if (!q) return items;
  return items.filter(
    (d) =>
      d.full_name.toLowerCase().includes(q) ||
      d.sp_code.toLowerCase().includes(q) ||
      shortCode(d.manage_token).toLowerCase().includes(q) ||
      (d.whatsapp_number || '').includes(q),
  );
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export async function computeStats() {
  const sessions = await prisma.registrationSession.findMany({
    include: { participants: true },
  });
  const parts = await prisma.participant.findMany();
  const active = parts.filter((p) => p.attendanceStatus === 'will_attend');

  const indukMap = new Map<string, { people: number; sessions: Set<string> }>();
  for (const p of active) {
    const induk = spInduk(p.spCode);
    if (!indukMap.has(induk)) indukMap.set(induk, { people: 0, sessions: new Set() });
    const cur = indukMap.get(induk)!;
    cur.people += 1;
    cur.sessions.add(p.sessionId);
  }

  const trendMap = new Map<string, number>();
  for (const s of sessions) {
    const day = (s.registeredAt || '').slice(0, 10);
    trendMap.set(day, (trendMap.get(day) || 0) + 1);
  }

  const bySpInduk = [...indukMap.entries()]
    .map(([induk, v]) => ({ induk, sessions: v.sessions.size, people: v.people }))
    .sort((a, b) => compareSpCode(a.induk, b.induk));

  const trend = [...trendMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    total_sessions: sessions.filter((s) =>
      s.participants.some((p) => p.attendanceStatus === 'will_attend'),
    ).length,
    total_people: active.length,
    total_cancelled: parts.filter((p) => p.attendanceStatus === 'cancelled').length,
    total_checked_in: parts.filter((p) => p.isCheckedIn).length,
    by_sp_induk: bySpInduk,
    trend,
  };
}

// ---------------------------------------------------------------------------
// CSV export (UTF-8 BOM + CRLF, Excel-ready) — mirrors export_csv
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'full_name',
  'nickname',
  'sp_code',
  'sp_induk',
  'birth_date',
  'age',
  'address',
  'address_detail',
  'last_occupation',
  'accommodation',
  'email',
  'whatsapp_number',
  'attendance_status',
  'is_checked_in',
  'checked_in_at',
  'registered_at',
] as const;

export async function exportCsv(induk?: string | null): Promise<string> {
  const sessions = await prisma.registrationSession.findMany();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const participants = await prisma.participant.findMany();

  type Participant = (typeof participants)[number];
  type Session = (typeof sessions)[number];

  let rows: { p: Participant; s: Session }[] = [];
  for (const p of participants) {
    const s = byId.get(p.sessionId);
    if (!s) continue;
    rows.push({ p, s });
  }
  if (induk && induk !== 'all') {
    rows = rows.filter(({ p }) => spInduk(p.spCode) === induk);
  }
  rows.sort((a, b) => compareSpCode(a.p.spCode, b.p.spCode));

  const esc = (v: unknown) => '"' + jsStr(v).replace(/"/g, '""') + '"';

  const cell = (p: Participant, s: Session, h: string): string => {
    const d = participantDict(p);
    if (h === 'sp_induk') return esc(spInduk(p.spCode));
    if (h === 'age') {
      const age = calculateAge(p.birthDate);
      return esc(age !== null ? age : '');
    }
    if (h === 'registered_at') return esc(s.registeredAt);
    return esc((d as Record<string, unknown>)[h]);
  };

  const body = rows.map(({ p, s }) => CSV_HEADERS.map((h) => cell(p, s, h)).join(','));
  // U+FEFF BOM prefix so Excel opens the UTF-8 CSV with correct encoding.
  return '﻿' + [CSV_HEADERS.join(','), ...body].join('\r\n');
}

// ---------------------------------------------------------------------------
// Broadcast (log-only)
// ---------------------------------------------------------------------------

export async function broadcast(
  induk: string | null | undefined,
  onlyAttending: boolean,
  channels: string[],
) {
  const sessions = await prisma.registrationSession.findMany();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  let parts = await prisma.participant.findMany();
  if (onlyAttending) parts = parts.filter((p) => p.attendanceStatus === 'will_attend');
  if (induk && induk !== 'all') parts = parts.filter((p) => spInduk(p.spCode) === induk);

  const sessionIds: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (byId.has(p.sessionId) && !seen.has(p.sessionId)) {
      seen.add(p.sessionId);
      sessionIds.push(p.sessionId);
    }
  }

  const logs = [] as Awaited<ReturnType<typeof logNotification>>[];
  for (const sid of sessionIds) {
    for (const ch of channels) {
      logs.push(await logNotification(sid, 'reminder', ch));
    }
  }
  const logDicts = logs.map(notificationLogDict);
  return {
    total: sessionIds.length,
    sent: logDicts.filter((l) => l.status === 'sent').length,
    failed: logDicts.filter((l) => l.status === 'failed').length,
    logs: logDicts,
  };
}
