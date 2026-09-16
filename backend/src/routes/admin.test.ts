// Integration tests for admin committee-management endpoints — requires a real
// local Postgres test DB (see backend/test/db.ts). Synthetic data only.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { dbAvailable, resetDb } from '../../test/db';
import { prisma } from '../db';
import { createApp } from '../app';
import { hashPassword, createAccessToken } from '../security';
import { uid, nowIso, genToken } from '../utils';

const available = await dbAvailable();
if (!available) {
  console.warn('[admin.test.ts] Postgres test DB not reachable — integration tests skipped.');
}

const app = createApp();

async function createCommittee(overrides: Partial<Record<string, unknown>> = {}) {
  return prisma.committee.create({
    data: {
      id: uid(),
      name: 'Committee',
      email: `committee-${uid()}@example.com`,
      role: 'committee',
      isActive: true,
      createdAt: nowIso(),
      passwordHash: hashPassword('some-password'),
      ...overrides,
    },
  });
}

async function superAdminAuth() {
  const superAdmin = await createCommittee({ role: 'super_admin' });
  const token = createAccessToken(superAdmin.id, superAdmin.role);
  return { superAdmin, token };
}

describe.skipIf(!available)('admin committee endpoints', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a committee', async () => {
    const { token } = await superAdminAuth();
    const res = await request(app)
      .post('/api/admin/committees')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Committee', email: 'new.committee@example.com', password: 'pass1234' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new.committee@example.com');
  });

  it('rejects creating a committee with a duplicate email', async () => {
    const { token } = await superAdminAuth();
    await createCommittee({ email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/admin/committees')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup', email: 'dup@example.com', password: 'pass1234' });
    expect(res.status).toBe(409);
  });

  it('updates a committee', async () => {
    const { token } = await superAdminAuth();
    const target = await createCommittee();
    const res = await request(app)
      .patch(`/api/admin/committees/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('toggles a committee active flag', async () => {
    const { token } = await superAdminAuth();
    const target = await createCommittee();
    const res = await request(app)
      .post(`/api/admin/committees/${target.id}/toggle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });

  it('deletes a non-last committee', async () => {
    const { token } = await superAdminAuth();
    const target = await createCommittee();
    const res = await request(app)
      .delete(`/api/admin/committees/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('refuses to delete the last super admin', async () => {
    const { superAdmin, token } = await superAdminAuth();
    const res = await request(app)
      .delete(`/api/admin/committees/${superAdmin.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('refuses to demote the last super admin', async () => {
    const { superAdmin, token } = await superAdminAuth();
    const res = await request(app)
      .patch(`/api/admin/committees/${superAdmin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'committee' });
    expect(res.status).toBe(400);
  });

  it('allows demoting a super admin when another super admin remains', async () => {
    const { superAdmin, token } = await superAdminAuth();
    await createCommittee({ role: 'super_admin' });
    const res = await request(app)
      .patch(`/api/admin/committees/${superAdmin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'committee' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('committee');
  });

  it('rejects updating a committee email to one already in use', async () => {
    const { token } = await superAdminAuth();
    await createCommittee({ email: 'taken@example.com' });
    const target = await createCommittee({ email: 'free@example.com' });
    const res = await request(app)
      .patch(`/api/admin/committees/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });

  it('never includes passwordHash / password_hash in GET /api/admin/committees', async () => {
    const { token } = await superAdminAuth();
    await createCommittee();
    const res = await request(app)
      .get('/api/admin/committees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/passwordHash/i);
    expect(serialized).not.toMatch(/password_hash/i);
    for (const committee of res.body) {
      expect(Object.keys(committee)).not.toContain('passwordHash');
      expect(Object.keys(committee)).not.toContain('password_hash');
    }
  });
});

// Fields that must NEVER appear in any lottery response — same regression style
// as the passwordHash assertions above. The lottery UI is shown on a projector
// at a live family event, so leaking a phone number or address there would be a
// real privacy incident, not a theoretical one.
const FORBIDDEN_PII = [
  'whatsapp_number',
  'whatsappNumber',
  'email',
  'birth_date',
  'birthDate',
  'address',
  'address_detail',
  'addressDetail',
  'last_occupation',
  'lastOccupation',
  'accommodation',
];

function expectNoPii(obj: Record<string, unknown>) {
  const keys = Object.keys(obj);
  for (const forbidden of FORBIDDEN_PII) {
    expect(keys).not.toContain(forbidden);
  }
}

describe.skipIf(!available)('admin lottery endpoints', () => {
  beforeEach(async () => {
    await resetDb();
  });

  // Plain 'committee' role — deliberately NOT super_admin: the lottery is an
  // operational tool, so any logged-in committee member can run it.
  async function committeeAuth() {
    const committee = await createCommittee({ name: 'Panitia Undian' });
    return { committee, token: createAccessToken(committee.id, committee.role) };
  }

  async function seedParticipants(count: number) {
    const session = await prisma.registrationSession.create({
      data: {
        id: uid(),
        manageToken: genToken(),
        privacyConsent: true,
        registeredAt: nowIso(),
        updatedAt: null,
      },
    });
    const created = [];
    for (let i = 1; i <= count; i++) {
      created.push(
        await prisma.participant.create({
          data: {
            id: uid(),
            sessionId: session.id,
            fullName: `Peserta SP${i}`,
            nickname: `Nick${i}`,
            spCode: `SP${i}`,
            birthDate: '1990-01-01',
            address: 'Jl. Contoh No. 1',
            addressDetail: 'RT 01',
            lastOccupation: 'Wiraswasta',
            accommodation: '',
            email: `sp${i}@example.com`,
            whatsappNumber: '6281200000001',
            attendanceStatus: 'will_attend',
            isCheckedIn: false,
            checkedInAt: null,
          },
        }),
      );
    }
    return created;
  }

  const LOTTERY_ROUTES: ['get' | 'post', string][] = [
    ['get', '/api/admin/lottery/pool'],
    ['get', '/api/admin/lottery/winners'],
    ['post', '/api/admin/lottery/draw'],
    ['post', '/api/admin/lottery/undo'],
    // A made-up id is fine here: the point is authorization, and a 404 from the
    // service is not an auth failure.
    ['post', '/api/admin/lottery/winners/no-such-id/void'],
    ['post', '/api/admin/lottery/reset'],
  ];

  it.each(LOTTERY_ROUTES)('rejects %s %s without a token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it.each(LOTTERY_ROUTES)('rejects %s %s with an invalid token', async (method, path) => {
    const res = await request(app)[method](path).set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it.each(LOTTERY_ROUTES)('allows %s %s for a plain committee role', async (method, path) => {
    const { token } = await committeeAuth();
    await seedParticipants(3);
    const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`);
    // The point is authorization, not the business outcome: a plain committee
    // must never be turned away. (POST /lottery/undo legitimately answers 400
    // here because nothing has been drawn yet — that is not an auth failure.)
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('GET /lottery/pool returns only non-PII identity fields', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(2);
    const res = await request(app)
      .get('/api/admin/lottery/pool')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const entry of res.body) {
      expect(Object.keys(entry).sort()).toEqual(['full_name', 'id', 'nickname', 'sp_code']);
      expectNoPii(entry);
    }
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/6281200000001/);
    expect(serialized).not.toMatch(/example\.com/);
    expect(serialized).not.toMatch(/Jl\. Contoh/);
  });

  it('POST /lottery/draw returns a winner dict plus the remaining count', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(3);
    const res = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'remaining',
      'requested',
      'winner',
      'winners',
    ]);
    expect(res.body.remaining).toBe(2);
    expect(res.body.requested).toBe(1);
    // `winner` is kept as an alias of winners[0] so callers written against the
    // single-winner contract keep working while the frontend migrates.
    expect(res.body.winners).toHaveLength(1);
    expect(res.body.winner).toEqual(res.body.winners[0]);
    expect(Object.keys(res.body.winner).sort()).toEqual([
      'drawn_at',
      'drawn_by_name',
      'full_name',
      'id',
      'nickname',
      'participant_id',
      'round_label',
      'sp_code',
    ]);
    expectNoPii(res.body.winner);
    // drawn_by_name is snapshotted from the authenticated committee.
    expect(res.body.winner.drawn_by_name).toBe('Panitia Undian');
    expect(JSON.stringify(res.body)).not.toMatch(/6281200000001|example\.com|Jl\. Contoh/);
  });

  it('POST /lottery/draw honours count and round_label', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(5);
    const res = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 3, round_label: 'Doorprize Kipas Angin' });

    expect(res.status).toBe(200);
    expect(res.body.winners).toHaveLength(3);
    expect(res.body.requested).toBe(3);
    expect(res.body.remaining).toBe(2);
    expect(res.body.winners.every((w: { round_label: string }) => w.round_label === 'Doorprize Kipas Angin')).toBe(true);
    expect(new Set(res.body.winners.map((w: { id: string }) => w.id)).size).toBe(3);
    expect(JSON.stringify(res.body)).not.toMatch(/6281200000001|example\.com|Jl\. Contoh/);
  });

  it('POST /lottery/draw rejects a count outside 1..20', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(3);
    const res = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 99 });
    expect(res.status).toBe(422);
  });

  it('POST /lottery/winners/:id/void returns that winner to the pool', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(4);
    const drew = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 2 });
    const victim = drew.body.winners[1];

    const res = await request(app)
      .post(`/api/admin/lottery/winners/${victim.id}/void`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(victim.id);
    // The audit columns stay in the database and never reach a client.
    expect(Object.keys(res.body)).not.toContain('voided_at');
    expect(Object.keys(res.body)).not.toContain('voided_by_name');
    expect(Object.keys(res.body)).not.toContain('void_reason');
    expectNoPii(res.body);

    const winners = await request(app)
      .get('/api/admin/lottery/winners')
      .set('Authorization', `Bearer ${token}`);
    expect(winners.body).toHaveLength(1);

    const pool = await request(app)
      .get('/api/admin/lottery/pool')
      .set('Authorization', `Bearer ${token}`);
    expect(pool.body.map((p: { id: string }) => p.id)).toContain(victim.participant_id);
  });

  it('POST /lottery/winners/:id/void returns 404 for an unknown winner', async () => {
    const { token } = await committeeAuth();
    const res = await request(app)
      .post('/api/admin/lottery/winners/nope/void')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('POST /lottery/draw returns 400 when the pool is empty', async () => {
    const { token } = await committeeAuth();
    const res = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Tidak ada peserta tersisa untuk diundi.');
  });

  it('GET /lottery/winners returns snake_case dicts without PII', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(2);
    await request(app).post('/api/admin/lottery/draw').set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/admin/lottery/winners')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'drawn_at',
      'drawn_by_name',
      'full_name',
      'id',
      'nickname',
      'participant_id',
      'round_label',
      'sp_code',
    ]);
    expectNoPii(res.body[0]);
    expect(JSON.stringify(res.body)).not.toMatch(/6281200000001|example\.com|Jl\. Contoh/);
  });

  it('POST /lottery/undo takes back the whole last draw and returns it', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(4);
    const drew = await request(app)
      .post('/api/admin/lottery/draw')
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 2 });

    const res = await request(app)
      .post('/api/admin/lottery/undo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // A draw can be several people at once, so undo answers with a list.
    expect(res.body.map((r: { id: string }) => r.id).sort()).toEqual(
      drew.body.winners.map((w: { id: string }) => w.id).sort(),
    );
    res.body.forEach(expectNoPii);

    const pool = await request(app)
      .get('/api/admin/lottery/pool')
      .set('Authorization', `Bearer ${token}`);
    expect(pool.body).toHaveLength(4);
  });

  it('POST /lottery/undo returns 400 when there is nothing to undo', async () => {
    const { token } = await committeeAuth();
    const res = await request(app)
      .post('/api/admin/lottery/undo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Belum ada undian untuk dibatalkan.');
  });

  it('POST /lottery/reset wipes the history and reports the deleted count', async () => {
    const { token } = await committeeAuth();
    await seedParticipants(3);
    await request(app).post('/api/admin/lottery/draw').set('Authorization', `Bearer ${token}`);
    await request(app).post('/api/admin/lottery/draw').set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/api/admin/lottery/reset')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 2 });

    const winners = await request(app)
      .get('/api/admin/lottery/winners')
      .set('Authorization', `Bearer ${token}`);
    expect(winners.body).toHaveLength(0);

    // Nobody has won anything any more, but the record of who had been drawn
    // survives as an audit trail that no endpoint exposes.
    expect(await prisma.lotteryDraw.count()).toBe(2);
  });
});
