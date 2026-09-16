// Business logic ported from services.py: event singleton, registration status,
// participant building, notifications (log-only), SP-Induk grouping, check-in
// search, stats, CSV export, and broadcast.

import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { settings } from './config';
import { HttpError } from './errors';
import {
  flatten,
  notificationLogDict,
  participantDict,
} from './serializers';
import {
  calculateAge,
  compareSpCode,
  jsStr,
  maskEmail,
  maskWhatsapp,
  normalizeSpCode,
  normalizeWhatsapp,
  nowIso,
  parseIso,
  secureRandomInt,
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
  // Ketiganya saling bebas, jadi dijalankan berbarengan — bukan tiga await
  // berurutan yang masing-masing menunggu perjalanan ke database.
  //
  // activeCount memakai count() dengan filter relasi, BUKAN findMany({ include:
  // participants }) lalu .filter().length seperti sebelumnya: bentuk lama
  // menarik setiap sesi beserta seluruh pesertanya melintasi jaringan semata-mata
  // untuk mengukur panjang sebuah array, dan biayanya tumbuh seiring pendaftar.
  const [ev, activeCount, totalPeople] = await Promise.all([
    getEvent(),
    prisma.registrationSession.count({
      where: { participants: { some: { attendanceStatus: 'will_attend' } } },
    }),
    prisma.participant.count({
      where: { attendanceStatus: 'will_attend' },
    }),
  ]);

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

/**
 * Prisma select untuk jalur publik: TEPAT lima kolom yang benar-benar dikirim,
 * tidak lebih. Sengaja tidak memakai groupedBySpInduk() — fungsi itu melayani
 * admin dan menarik seluruh baris sesi (termasuk manageToken) beserta seluruh
 * kolom peserta (birthDate, address, kontak mentah) hanya untuk dibuang lagi di
 * sini. manageToken adalah capability token: siapa pun yang memegangnya bisa
 * membatalkan pendaftaran orang lain, jadi menariknya ke memori pada jalur yang
 * TIDAK butuh login memperluas permukaan risiko tanpa satu pun manfaat.
 *
 * Relasi Participant.session wajib + onDelete: Cascade, jadi peserta tanpa sesi
 * mustahil ada — itulah sebabnya tabel sesi tidak perlu ikut ditarik hanya untuk
 * memeriksa keberadaannya, seperti yang dilakukan groupedBySpInduk().
 */
const PUBLIC_PARTICIPANT_SELECT = {
  fullName: true,
  nickname: true,
  spCode: true,
  whatsappNumber: true,
  email: true,
} as const;

/** Penyamaran kontak terjadi DI SINI, sebelum data meninggalkan proses. */
function publicEntry(p: {
  fullName: string;
  nickname: string;
  spCode: string;
  whatsappNumber: string | null;
  email: string | null;
}) {
  return {
    full_name: p.fullName,
    nickname: p.nickname,
    sp_code: p.spCode,
    whatsapp_number: maskWhatsapp(p.whatsappNumber),
    email: maskEmail(p.email),
  };
}

/**
 * The /peserta list, for GET /api/participants/public — which requires NO login.
 *
 * Contact details are masked HERE, in the service, not in the page that renders
 * them. Anyone can call this endpoint with a single unauthenticated request and
 * there is no rate limit on this path, so a raw number in the response is a raw
 * number published to the world — regardless of what the UI chooses to draw.
 * The public page never uses the unmasked values for anything (no wa.me link,
 * no mailto), so nothing is lost by never sending them.
 */
export async function publicParticipants() {
  // Penyaringan dikerjakan database lewat `where`, bukan .filter() setelah
  // seluruh tabel ditarik — biaya yang tumbuh linear terhadap jumlah pendaftar.
  const rows = await prisma.participant.findMany({
    where: { attendanceStatus: 'will_attend' },
    select: PUBLIC_PARTICIPANT_SELECT,
  });

  const groups = new Map<string, ReturnType<typeof publicEntry>[]>();
  for (const p of rows) {
    const key = spInduk(p.spCode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(publicEntry(p));
  }

  return [...groups.keys()].sort(compareSpCode).map((induk) => ({
    induk,
    participants: groups.get(induk)!.sort((a, b) => compareSpCode(a.sp_code, b.sp_code)),
  }));
}

/**
 * Kode SP yang sudah dipakai peserta yang MASIH akan hadir.
 *
 * Peserta yang dibatalkan sengaja tidak dihitung: keluarga yang membatalkan lalu
 * mendaftar ulang adalah alur yang sah, dan memperingatkan mereka soal kodenya
 * sendiri hanya akan membingungkan.
 *
 * Dipakai untuk MEMPERINGATKAN, bukan memblokir — lihat acknowledge_duplicate
 * di schemas.ts. Karena itu ia mengembalikan kodenya saja, tanpa nama, kontak,
 * atau id sesi: yang mendaftar ulang belum tentu orang yang sama, dan dia tidak
 * berhak tahu data pendaftaran sebelumnya.
 */
export async function findDuplicateSpCodes(codes: string[]): Promise<string[]> {
  const wanted = [...new Set(codes.map(normalizeSpCode).filter(Boolean))];
  if (wanted.length === 0) return [];

  const rows = await prisma.participant.findMany({
    where: { spCode: { in: wanted }, attendanceStatus: { not: 'cancelled' } },
    select: { spCode: true },
  });
  const taken = new Set(rows.map((r) => r.spCode));
  return wanted.filter((c) => taken.has(c));
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

// ---------------------------------------------------------------------------
// Lottery (Undian)
//
// Pool = every participant with attendance_status 'will_attend' whose id has
// not been drawn yet. Each Participant is one independent entry — no grouping
// or weighting by SP Induk, and no spouse ('A' suffix) special-casing. Check-in
// is deliberately NOT a requirement.
//
// The pool/winner shapes below carry ONLY full_name, nickname and sp_code —
// the same identity fields already public via publicParticipants(). No
// whatsapp_number / email / birth_date / address ever leaves these functions.
// ---------------------------------------------------------------------------

export interface LotteryPoolEntry {
  id: string;
  full_name: string;
  nickname: string;
  sp_code: string;
}

/** Prisma select that pulls exactly the four non-PII pool fields — nothing else. */
const LOTTERY_POOL_SELECT = {
  id: true,
  fullName: true,
  nickname: true,
  spCode: true,
} as const;

type PoolRow = { id: string; fullName: string; nickname: string; spCode: string };

function poolEntry(p: PoolRow): LotteryPoolEntry {
  return { id: p.id, full_name: p.fullName, nickname: p.nickname, sp_code: p.spCode };
}

/**
 * Eligible participants, sorted by SP code. Anti-join against lottery_draws:
 * anyone already drawn is out of the pool (that is also what makes
 * undoLastLotteryDraw() put a participant back).
 *
 * `tx` lets drawLotteryWinner() recompute the pool INSIDE its transaction.
 */
export async function getLotteryPool(
  tx: Pick<typeof prisma, 'participant' | 'lotteryDraw'> = prisma,
): Promise<LotteryPoolEntry[]> {
  // Only ACTIVE draws take someone out of the pool. A voided row is a
  // cancellation, so its participant is eligible again — that is the whole
  // mechanism behind undo and "kembalikan ke undian".
  const drawn = await tx.lotteryDraw.findMany({
    where: { voidedAt: null },
    select: { participantId: true },
  });
  const rows = await tx.participant.findMany({
    where: {
      attendanceStatus: 'will_attend',
      id: { notIn: drawn.map((d) => d.participantId) },
    },
    select: LOTTERY_POOL_SELECT,
  });
  return rows.map(poolEntry).sort((a, b) => compareSpCode(a.sp_code, b.sp_code));
}

/**
 * Draw one winner and persist it.
 *
 * The pool is recomputed inside a SERIALIZABLE transaction rather than read
 * beforehand: read-committed (Prisma's default) would let two concurrent draws
 * — e.g. a double-clicked button — observe the same pool and pick the same
 * person twice. Serializable makes the second one abort instead; we retry it
 * once, and it then sees the first winner already recorded.
 *
 * The winner index comes from secureRandomInt (crypto.randomInt). Math.random
 * must never be used here: this decides a real prize for real family members.
 */
/** Hard ceiling on one draw. Twenty names is already more than a projector can
 *  show legibly from the back of a hall; the limit exists to protect the screen,
 *  not the database. Mirrored by lotteryDrawSchema in schemas.ts. */
export const MAX_DRAW_COUNT = 20;

export interface DrawOptions {
  /** How many winners to pull in this one draw. Clamped to [1, MAX_DRAW_COUNT]. */
  count?: number;
  /** Prize round this draw belongs to, snapshotted onto every row. */
  roundLabel?: string;
}

/**
 * Draw one or more winners and persist them.
 *
 * `count` winners are picked inside a SINGLE transaction, so a multi-winner
 * draw is all-or-nothing and can never pick the same person twice: each pick is
 * spliced out of the local pool copy before the next one.
 *
 * If the pool holds fewer than `count`, this drains it and returns what it
 * could — a partial draw, reported through `requested` — rather than failing.
 * Failing would be worse on stage: the committee would have announced a draw
 * that then errored. Only a completely empty pool is an error.
 */
export async function drawLotteryWinner(committeeName: string, options: DrawOptions = {}) {
  const requested = Math.max(1, Math.min(MAX_DRAW_COUNT, Math.floor(options.count ?? 1)));
  const roundLabel = (options.roundLabel ?? '').trim();

  const attempt = () =>
    prisma.$transaction(
      async (tx) => {
        const pool = await getLotteryPool(tx);
        if (pool.length === 0) {
          throw new HttpError(400, 'Tidak ada peserta tersisa untuk diundi.');
        }

        const available = pool.slice();
        const drawnAt = nowIso();
        const draws = [];
        const take = Math.min(requested, available.length);

        for (let i = 0; i < take; i++) {
          const winner = available.splice(secureRandomInt(available.length), 1)[0];
          draws.push(
            await tx.lotteryDraw.create({
              data: {
                id: uid(),
                // Snapshots — the row stays truthful even if the Participant is
                // later edited or deleted (participantId is a soft reference).
                participantId: winner.id,
                fullName: winner.full_name,
                nickname: winner.nickname,
                spCode: winner.sp_code,
                drawnAt,
                drawnByName: committeeName,
                roundLabel,
              },
            }),
          );
        }

        return { draws, remaining: available.length, requested };
      },
      { isolationLevel: 'Serializable' },
    );

  try {
    return await attempt();
  } catch (err) {
    // Retry once on a serialization failure / write conflict (P2034); anything
    // else — including our own HttpError for an empty pool — propagates.
    if (err instanceof HttpError) throw err;
    if (!isWriteConflict(err)) throw err;
    return attempt();
  }
}

/** Postgres serialization failure surfaced by Prisma as P2034 / 40001. */
function isWriteConflict(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2034' || code === '40001';
}

/**
 * ACTIVE winners, newest first — voided rows are cancellations and must never
 * appear as winners.
 *
 * The filter lives here, in the service, and not in the route: the tests and
 * every other caller reach this function directly, so a route-level filter
 * would leave a second path that still returns cancelled people as winners.
 */
export async function listLotteryWinners() {
  return prisma.lotteryDraw.findMany({
    where: { voidedAt: null },
    orderBy: { drawnAt: 'desc' },
  });
}

/**
 * Undo the most recent draw — deletes that single row, which returns the
 * participant to the pool. Exists so a committee member can correct a mis-click
 * or redo a draw live during the event without touching the database by hand.
 */
/**
 * Take back the most recent draw — ALL of it.
 *
 * A multi-winner draw writes its rows inside one transaction and stamps them
 * with one shared `drawnAt`, because they really were drawn at the same instant.
 * So "the last draw" is a batch, not a row: undoing five winners one arbitrary
 * row at a time would be both confusing on stage and impossible to label
 * honestly on a button. Every active row sharing the newest `drawnAt` is voided
 * together, and all of them return to the pool.
 *
 * Returns the rows that were taken back, newest-first ordering irrelevant since
 * they share a timestamp.
 */
export async function undoLastLotteryDraw(committeeName = '') {
  return prisma.$transaction(
    async (tx) => {
      // `voidedAt: null` is load-bearing. Without it the newest row by drawnAt
      // stays the batch just voided, so a second undo would find it again, void
      // it to no effect, and the "nothing to undo" error would never fire.
      const last = await tx.lotteryDraw.findFirst({
        where: { voidedAt: null },
        orderBy: { drawnAt: 'desc' },
      });
      if (last === null) throw new HttpError(400, 'Belum ada undian untuk dibatalkan.');

      const batch = await tx.lotteryDraw.findMany({
        where: { voidedAt: null, drawnAt: last.drawnAt },
      });
      await tx.lotteryDraw.updateMany({
        where: { voidedAt: null, drawnAt: last.drawnAt },
        data: { voidedAt: nowIso(), voidedByName: committeeName, voidReason: 'undo' },
      });
      return batch;
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Cancel ONE specific winner, not merely the last one, returning them to the
 * pool. This is the live-event case undo cannot cover: the third winner of five
 * already went home, and resetting the whole draw to fix it would be absurd.
 */
export async function voidLotteryWinner(
  id: string,
  reason: 'undo' | 'manual' | 'reset' = 'manual',
  committeeName = '',
) {
  return prisma.$transaction(
    async (tx) => {
      const row = await tx.lotteryDraw.findFirst({ where: { id, voidedAt: null } });
      // Same message for "no such row" and "already cancelled": from the
      // committee's side both mean "that person is not a winner right now", and
      // distinguishing them would only leak whether an id exists.
      if (row === null) throw new HttpError(404, 'Pemenang tidak ditemukan atau sudah dibatalkan.');
      return tx.lotteryDraw.update({
        where: { id: row.id },
        data: { voidedAt: nowIso(), voidedByName: committeeName, voidReason: reason },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}

/**
 * Clear the whole winner list: every active row is voided at once and everyone
 * returns to the pool.
 *
 * Operationally this is still the big red button — after it, nobody in the UI
 * has won anything and there is no way to put the list back through undo. What
 * it is NOT, any more, is destructive to the record: the rows survive with
 * `voidReason: 'reset'`, so it stays provable who had been drawn before someone
 * pressed it. The frontend must still gate it behind layered confirmation
 * (typed confirmation, not a single click) because the on-stage consequence is
 * unchanged.
 *
 * Returns the number of winners cleared, same as before.
 */
export async function resetLottery(committeeName = ''): Promise<{ count: number }> {
  const { count } = await prisma.lotteryDraw.updateMany({
    where: { voidedAt: null },
    data: { voidedAt: nowIso(), voidedByName: committeeName, voidReason: 'reset' },
  });
  return { count };
}
