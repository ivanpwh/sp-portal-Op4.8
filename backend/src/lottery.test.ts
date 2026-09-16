// Integration tests for the lottery (Undian) services — require a real local
// Postgres test DB (backend/.env.test -> sp_portal_test). Skipped automatically
// when that DB isn't reachable (see backend/test/db.ts). All seed data below is
// synthetic; no real family data is used.
import { describe, it, expect, beforeEach } from 'vitest';
import { dbAvailable, resetDb } from '../test/db';
import { prisma } from './db';
import { uid, nowIso, genToken } from './utils';
import { HttpError } from './errors';
import {
  getLotteryPool,
  drawLotteryWinner,
  listLotteryWinners,
  undoLastLotteryDraw,
  voidLotteryWinner,
  resetLottery,
} from './services';

/** One winner from a single-person draw — the common case in these tests. */
async function drawOne(committee = 'Panitia A') {
  const { draws, remaining, requested } = await drawLotteryWinner(committee);
  return { draw: draws[0], draws, remaining, requested };
}

const available = await dbAvailable();
if (!available) {
  console.warn(
    '[lottery.test.ts] Postgres test DB not reachable — integration tests skipped. ' +
      'See backend/.env.test.',
  );
}

async function createSession() {
  return prisma.registrationSession.create({
    data: {
      id: uid(),
      manageToken: genToken(),
      privacyConsent: true,
      registeredAt: nowIso(),
      updatedAt: null,
    },
  });
}

async function createParticipant(
  sessionId: string,
  spCode: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return prisma.participant.create({
    data: {
      id: uid(),
      sessionId,
      fullName: `Peserta ${spCode}`,
      nickname: `Nick ${spCode}`,
      spCode,
      birthDate: '1990-01-01',
      address: 'Jl. Contoh No. 1',
      addressDetail: 'RT 01',
      lastOccupation: 'Wiraswasta',
      accommodation: '',
      email: `${spCode.toLowerCase()}@example.com`,
      whatsappNumber: '6281200000001',
      attendanceStatus: 'will_attend',
      isCheckedIn: false,
      checkedInAt: null,
      ...overrides,
    },
  });
}

describe.skipIf(!available)('lottery services', () => {
  beforeEach(async () => {
    await resetDb();
  });

  // -------------------------------------------------------------------------
  // getLotteryPool
  // -------------------------------------------------------------------------

  it('includes will_attend participants and excludes cancelled ones', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await createParticipant(s.id, 'SP2');
    await createParticipant(s.id, 'SP3', { attendanceStatus: 'cancelled' });

    const pool = await getLotteryPool();
    expect(pool.map((p) => p.sp_code)).toEqual(['SP1', 'SP2']);
  });

  it('ignores check-in status entirely', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1', { isCheckedIn: false });
    await createParticipant(s.id, 'SP2', { isCheckedIn: true, checkedInAt: nowIso() });

    const pool = await getLotteryPool();
    expect(pool).toHaveLength(2);
  });

  it('exposes only id/full_name/nickname/sp_code — no PII', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');

    const pool = await getLotteryPool();
    expect(Object.keys(pool[0]).sort()).toEqual(['full_name', 'id', 'nickname', 'sp_code']);
    for (const forbidden of [
      'whatsapp_number',
      'whatsappNumber',
      'email',
      'birth_date',
      'birthDate',
      'address',
      'address_detail',
      'last_occupation',
    ]) {
      expect(Object.keys(pool[0])).not.toContain(forbidden);
    }
  });

  it('excludes participants that already won', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await createParticipant(s.id, 'SP2');

    const { draw } = await drawOne();
    const pool = await getLotteryPool();
    expect(pool).toHaveLength(1);
    expect(pool.map((p) => p.id)).not.toContain(draw.participantId);
  });

  // -------------------------------------------------------------------------
  // drawLotteryWinner
  // -------------------------------------------------------------------------

  it('snapshots the winner and records who drew', async () => {
    const s = await createSession();
    const p = await createParticipant(s.id, 'SP4.1');

    const { draw, remaining } = await drawOne('Panitia Inti');
    expect(draw.participantId).toBe(p.id);
    expect(draw.fullName).toBe(p.fullName);
    expect(draw.nickname).toBe(p.nickname);
    expect(draw.spCode).toBe('SP4.1');
    expect(draw.drawnByName).toBe('Panitia Inti');
    expect(draw.drawnAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(remaining).toBe(0);
  });

  it('shrinks the pool by exactly one per draw', async () => {
    const s = await createSession();
    for (let i = 1; i <= 5; i++) await createParticipant(s.id, `SP${i}`);

    expect(await getLotteryPool()).toHaveLength(5);
    const first = await drawOne();
    expect(first.remaining).toBe(4);
    expect(await getLotteryPool()).toHaveLength(4);
    const second = await drawOne();
    expect(second.remaining).toBe(3);
    expect(await getLotteryPool()).toHaveLength(3);
  });

  it('never draws the same participant twice, and drains the pool exactly once each', async () => {
    const s = await createSession();
    const created = [];
    for (let i = 1; i <= 12; i++) created.push(await createParticipant(s.id, `SP${i}`));
    // A cancelled participant must never be drawn at all.
    await createParticipant(s.id, 'SP99', { attendanceStatus: 'cancelled' });

    const wonIds: string[] = [];
    for (let i = 0; i < created.length; i++) {
      const { draw, remaining } = await drawOne();
      expect(wonIds).not.toContain(draw.participantId); // no repeat, ever
      wonIds.push(draw.participantId);
      expect(remaining).toBe(created.length - wonIds.length);
    }

    expect(new Set(wonIds).size).toBe(created.length);
    expect(wonIds.sort()).toEqual(created.map((p) => p.id).sort());
    expect(await getLotteryPool()).toHaveLength(0);
  });

  it('throws 400 once the pool is empty', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await drawOne();

    await expect(drawLotteryWinner('Panitia A')).rejects.toThrow(HttpError);
    await expect(drawLotteryWinner('Panitia A')).rejects.toMatchObject({
      status: 400,
      message: 'Tidak ada peserta tersisa untuk diundi.',
    });
  });

  it('throws 400 when there are no participants at all', async () => {
    await expect(drawLotteryWinner('Panitia A')).rejects.toMatchObject({ status: 400 });
    expect(await listLotteryWinners()).toHaveLength(0);
  });

  it('keeps the history row intact after the participant is deleted', async () => {
    const s = await createSession();
    const p = await createParticipant(s.id, 'SP7');
    const { draw } = await drawOne();

    // Soft reference: no cascade, so the winner history survives.
    await prisma.participant.delete({ where: { id: p.id } });

    const winners = await listLotteryWinners();
    expect(winners).toHaveLength(1);
    expect(winners[0].id).toBe(draw.id);
    expect(winners[0].fullName).toBe('Peserta SP7');
    expect(winners[0].participantId).toBe(p.id);
  });

  // -------------------------------------------------------------------------
  // listLotteryWinners
  // -------------------------------------------------------------------------

  it('lists winners newest first', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await createParticipant(s.id, 'SP2');
    await createParticipant(s.id, 'SP3');

    for (let i = 0; i < 3; i++) {
      await drawOne();
      // Force distinct ISO timestamps so the ordering assertion is meaningful.
      await new Promise((r) => setTimeout(r, 5));
    }

    const winners = await listLotteryWinners();
    expect(winners).toHaveLength(3);
    const times = winners.map((w) => w.drawnAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  // -------------------------------------------------------------------------
  // undoLastLotteryDraw
  // -------------------------------------------------------------------------

  it('returns the undone participant to the pool', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await createParticipant(s.id, 'SP2');

    const { draw } = await drawOne();
    expect(await getLotteryPool()).toHaveLength(1);

    const removed = await undoLastLotteryDraw();
    expect(removed.map((r) => r.id)).toEqual([draw.id]);

    const pool = await getLotteryPool();
    expect(pool).toHaveLength(2);
    expect(pool.map((p) => p.id)).toContain(draw.participantId);
    expect(await listLotteryWinners()).toHaveLength(0);
  });

  it('undoes only the most recent draw', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await createParticipant(s.id, 'SP2');
    await createParticipant(s.id, 'SP3');

    const first = await drawOne();
    await new Promise((r) => setTimeout(r, 5));
    const second = await drawOne('Panitia B');

    const removed = await undoLastLotteryDraw();
    expect(removed.map((r) => r.id)).toEqual([second.draw.id]);

    const winners = await listLotteryWinners();
    expect(winners).toHaveLength(1);
    expect(winners[0].id).toBe(first.draw.id);
  });

  it('takes back every winner of a multi-person draw, not one of them', async () => {
    const s = await createSession();
    for (let i = 1; i <= 6; i++) await createParticipant(s.id, `SP${i}`);

    await drawOne(); // a single earlier winner that must survive the undo
    await new Promise((r) => setTimeout(r, 5));
    const { draws } = await drawLotteryWinner('Panitia A', { count: 3 });
    expect(draws).toHaveLength(3);
    expect(await listLotteryWinners()).toHaveLength(4);

    const removed = await undoLastLotteryDraw();
    expect(removed).toHaveLength(3);
    expect(removed.map((r) => r.id).sort()).toEqual(draws.map((d) => d.id).sort());
    expect(await listLotteryWinners()).toHaveLength(1);
    expect(await getLotteryPool()).toHaveLength(5);
  });

  it('refuses a second undo once every draw has been taken back', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    await drawOne();

    await undoLastLotteryDraw();
    // Regression: with soft-void the just-cancelled row is still the newest by
    // drawnAt. If the lookup forgets `voidedAt: null` it finds that row again,
    // "undoes" it to no effect, and this 400 never happens.
    await expect(undoLastLotteryDraw()).rejects.toMatchObject({
      status: 400,
      message: 'Belum ada undian untuk dibatalkan.',
    });
  });

  it('throws 400 when there is nothing to undo', async () => {
    await expect(undoLastLotteryDraw()).rejects.toMatchObject({
      status: 400,
      message: 'Belum ada undian untuk dibatalkan.',
    });
  });

  // -------------------------------------------------------------------------
  // resetLottery (destructive)
  // -------------------------------------------------------------------------

  it('wipes the whole history and restores the full pool', async () => {
    const s = await createSession();
    for (let i = 1; i <= 4; i++) await createParticipant(s.id, `SP${i}`);
    await drawLotteryWinner('Panitia A');
    await drawLotteryWinner('Panitia A');
    expect(await getLotteryPool()).toHaveLength(2);

    const { count } = await resetLottery('Panitia A');
    expect(count).toBe(2);
    expect(await listLotteryWinners()).toHaveLength(0);
    expect(await getLotteryPool()).toHaveLength(4);

    // The operational effect is total, but the record is not destroyed: the
    // rows stay, marked, so it remains provable who had been drawn.
    expect(await prisma.lotteryDraw.count()).toBe(2);
    const rows = await prisma.lotteryDraw.findMany();
    expect(rows.every((r) => r.voidedAt !== null)).toBe(true);
    expect(rows.every((r) => r.voidReason === 'reset')).toBe(true);
    expect(rows.every((r) => r.voidedByName === 'Panitia A')).toBe(true);
  });

  it('reports 0 when the history is already empty', async () => {
    expect(await resetLottery()).toEqual({ count: 0 });
  });

  // -------------------------------------------------------------------------
  // Multi-winner draws
  // -------------------------------------------------------------------------

  it('draws several distinct winners in one go', async () => {
    const s = await createSession();
    for (let i = 1; i <= 8; i++) await createParticipant(s.id, `SP${i}`);

    const { draws, remaining, requested } = await drawLotteryWinner('Panitia A', { count: 5 });
    expect(draws).toHaveLength(5);
    expect(requested).toBe(5);
    expect(remaining).toBe(3);
    expect(new Set(draws.map((d) => d.participantId)).size).toBe(5);
    expect(await getLotteryPool()).toHaveLength(3);
  });

  it('shares one drawnAt across a batch, so the batch is identifiable', async () => {
    const s = await createSession();
    for (let i = 1; i <= 4; i++) await createParticipant(s.id, `SP${i}`);

    const { draws } = await drawLotteryWinner('Panitia A', { count: 3 });
    expect(new Set(draws.map((d) => d.drawnAt)).size).toBe(1);
  });

  it('drains what it can instead of failing when the pool is smaller than count', async () => {
    const s = await createSession();
    for (let i = 1; i <= 2; i++) await createParticipant(s.id, `SP${i}`);

    const { draws, remaining, requested } = await drawLotteryWinner('Panitia A', { count: 5 });
    // A partial draw is not an error: on stage the committee has already
    // announced the draw by the time this returns.
    expect(draws).toHaveLength(2);
    expect(requested).toBe(5);
    expect(remaining).toBe(0);
  });

  it('clamps count to the 1..20 range', async () => {
    const s = await createSession();
    for (let i = 1; i <= 30; i++) await createParticipant(s.id, `SP${i}`);

    const high = await drawLotteryWinner('Panitia A', { count: 999 });
    expect(high.draws).toHaveLength(20);

    const low = await drawLotteryWinner('Panitia A', { count: 0 });
    expect(low.draws).toHaveLength(1);
  });

  it('snapshots the round label onto every row of the draw', async () => {
    const s = await createSession();
    for (let i = 1; i <= 3; i++) await createParticipant(s.id, `SP${i}`);

    const { draws } = await drawLotteryWinner('Panitia A', {
      count: 2,
      roundLabel: '  Hadiah Utama — Sepeda  ',
    });
    expect(draws.every((d) => d.roundLabel === 'Hadiah Utama — Sepeda')).toBe(true);

    const winners = await listLotteryWinners();
    expect(winners.every((w) => w.roundLabel === 'Hadiah Utama — Sepeda')).toBe(true);
  });

  it('defaults the round label to an empty string', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    const { draw } = await drawOne();
    expect(draw.roundLabel).toBe('');
  });

  // -------------------------------------------------------------------------
  // voidLotteryWinner — the audit trail
  // -------------------------------------------------------------------------

  it('returns one specific winner to the pool without touching the others', async () => {
    const s = await createSession();
    for (let i = 1; i <= 5; i++) await createParticipant(s.id, `SP${i}`);
    const { draws } = await drawLotteryWinner('Panitia A', { count: 3 });
    const victim = draws[1];

    const voided = await voidLotteryWinner(victim.id, 'manual', 'Panitia B');
    expect(voided.id).toBe(victim.id);
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidReason).toBe('manual');
    expect(voided.voidedByName).toBe('Panitia B');

    const winners = await listLotteryWinners();
    expect(winners).toHaveLength(2);
    expect(winners.map((w) => w.id)).not.toContain(victim.id);

    const pool = await getLotteryPool();
    expect(pool.map((p) => p.id)).toContain(victim.participantId);
  });

  it('keeps the cancelled row in the database as evidence', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    const { draw } = await drawOne();

    await voidLotteryWinner(draw.id, 'manual', 'Panitia B');

    // Invisible to every caller that asks for winners...
    expect(await listLotteryWinners()).toHaveLength(0);
    // ...but still there, with who cancelled it and why.
    const row = await prisma.lotteryDraw.findUnique({ where: { id: draw.id } });
    expect(row).not.toBeNull();
    expect(row?.fullName).toBe('Peserta SP1');
    expect(row?.drawnByName).toBe('Panitia A');
    expect(row?.voidedByName).toBe('Panitia B');
    expect(row?.voidReason).toBe('manual');
  });

  it('lets a cancelled participant be drawn again, leaving both rows behind', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    const first = await drawOne();
    await voidLotteryWinner(first.draw.id, 'manual', 'Panitia B');

    const second = await drawOne();
    expect(second.draw.participantId).toBe(first.draw.participantId);
    expect(second.draw.id).not.toBe(first.draw.id);

    expect(await listLotteryWinners()).toHaveLength(1);
    expect(await prisma.lotteryDraw.count()).toBe(2);
  });

  it('rejects an unknown id and a second cancellation of the same winner', async () => {
    const s = await createSession();
    await createParticipant(s.id, 'SP1');
    const { draw } = await drawOne();

    await expect(voidLotteryWinner('does-not-exist')).rejects.toMatchObject({ status: 404 });

    await voidLotteryWinner(draw.id);
    await expect(voidLotteryWinner(draw.id)).rejects.toMatchObject({ status: 404 });
  });
});
