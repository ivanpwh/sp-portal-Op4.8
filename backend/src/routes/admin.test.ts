// Integration tests for admin committee-management endpoints — requires a real
// local Postgres test DB (see backend/test/db.ts). Synthetic data only.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { dbAvailable, resetDb } from '../../test/db';
import { prisma } from '../db';
import { createApp } from '../app';
import { hashPassword, createAccessToken } from '../security';
import { uid, nowIso } from '../utils';

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
