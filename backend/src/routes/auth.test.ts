// Integration tests for /api/auth/* and the requireCommittee/requireSuperAdmin
// middleware. Requires a real local Postgres test DB — see backend/test/db.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { dbAvailable, resetDb } from '../../test/db';
import { prisma } from '../db';
import { createApp } from '../app';
import { hashPassword, createAccessToken } from '../security';
import { settings } from '../config';
import { uid, nowIso } from '../utils';

const available = await dbAvailable();
if (!available) {
  console.warn('[auth.test.ts] Postgres test DB not reachable — integration tests skipped.');
}

const app = createApp();

async function createCommittee(overrides: Partial<Record<string, unknown>> = {}) {
  return prisma.committee.create({
    data: {
      id: uid(),
      name: 'Test Committee',
      email: 'test.committee@example.com',
      role: 'committee',
      isActive: true,
      createdAt: nowIso(),
      passwordHash: hashPassword('correct-password'),
      ...overrides,
    },
  });
}

describe.skipIf(!available)('POST /api/auth/login', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('logs in successfully with correct credentials', async () => {
    await createCommittee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.committee@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.committee.email).toBe('test.committee@example.com');
  });

  it('rejects an incorrect password', async () => {
    await createCommittee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.committee@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects a deactivated account', async () => {
    await createCommittee({ isActive: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.committee@example.com', password: 'correct-password' });
    expect(res.status).toBe(403);
  });

  it('never includes passwordHash / password_hash anywhere in the response JSON', async () => {
    await createCommittee();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test.committee@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/passwordHash/i);
    expect(serialized).not.toMatch(/password_hash/i);
    expect(Object.keys(res.body.committee)).not.toContain('passwordHash');
    expect(Object.keys(res.body.committee)).not.toContain('password_hash');
  });
});

describe.skipIf(!available)('requireCommittee / requireSuperAdmin middleware', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('rejects a request with no token', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/malformed token', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const committee = await createCommittee();
    // Hand-craft an already-expired token for this committee.
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expired = jwt.sign(
      { sub: committee.id, role: committee.role, type: 'access', iat: past - 60, exp: past },
      settings.secretKey,
      { algorithm: settings.algorithm },
    );
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('requireSuperAdmin rejects a plain committee role', async () => {
    const committee = await createCommittee({ role: 'committee' });
    const token = createAccessToken(committee.id, committee.role);
    const res = await request(app)
      .get('/api/admin/committees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('requireSuperAdmin allows a super_admin role', async () => {
    const committee = await createCommittee({ role: 'super_admin' });
    const token = createAccessToken(committee.id, committee.role);
    const res = await request(app)
      .get('/api/admin/committees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
