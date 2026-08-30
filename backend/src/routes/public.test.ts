// Integration tests for public (no-login) endpoints. Requires a real local
// Postgres test DB — see backend/test/db.ts. Synthetic data only.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { dbAvailable, resetDb } from '../../test/db';
import { prisma } from '../db';
import { createApp } from '../app';
import { uid, nowIso } from '../utils';

const available = await dbAvailable();
if (!available) {
  console.warn('[public.test.ts] Postgres test DB not reachable — integration tests skipped.');
}

const app = createApp();

async function createEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return prisma.eventSettings.create({
    data: {
      id: uid(),
      eventName: 'Test Event',
      tagline: '',
      eventDate: '',
      location: '',
      address: '',
      mapsQuery: '',
      registrationDeadline: null,
      registrationOpen: true,
      qrCheckinEnabled: true,
      updatedAt: nowIso(),
      ...overrides,
    },
  });
}

const validParticipant = { full_name: 'Test Registrant', sp_code: 'SP1' };

describe.skipIf(!available)('POST /api/registrations', () => {
  beforeEach(async () => {
    await resetDb();
    await createEvent({ registrationOpen: true });
  });

  it('succeeds with a valid payload', async () => {
    const res = await request(app)
      .post('/api/registrations')
      .send({ privacy_consent: true, participants: [validParticipant] });
    expect(res.status).toBe(201);
    expect(res.body.participants).toHaveLength(1);
    expect(res.body.manage_token).toBeTruthy();
  });

  it('rejects submissions with the honeypot field filled in', async () => {
    const res = await request(app)
      .post('/api/registrations')
      .send({ privacy_consent: true, participants: [validParticipant], website: 'http://spam.example' });
    expect(res.status).toBe(400);
  });

  it('rejects registration when the event is closed', async () => {
    await resetDb();
    await createEvent({ registrationOpen: false });
    const res = await request(app)
      .post('/api/registrations')
      .send({ privacy_consent: true, participants: [validParticipant] });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!available)('manage-by-token flows', () => {
  beforeEach(async () => {
    await resetDb();
    await createEvent({ registrationOpen: true });
  });

  async function registerOne() {
    const res = await request(app)
      .post('/api/registrations')
      .send({ privacy_consent: true, participants: [{ full_name: 'Token Owner', sp_code: 'SP2' }] });
    return res.body as { manage_token: string; participants: Array<{ id: string }> };
  }

  it('PATCH by token updates participants', async () => {
    const session = await registerOne();
    const res = await request(app)
      .patch(`/api/registrations/token/${session.manage_token}`)
      .send({
        participants: [
          {
            id: session.participants[0].id,
            full_name: 'Token Owner Updated',
            sp_code: 'SP2',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.participants[0].full_name).toBe('Token Owner Updated');
  });

  it('PATCH with an unknown token returns 404', async () => {
    const res = await request(app)
      .patch('/api/registrations/token/does-not-exist')
      .send({ participants: [] });
    expect(res.status).toBe(404);
  });

  it('cancel by token marks all participants cancelled', async () => {
    const session = await registerOne();
    const res = await request(app).post(`/api/registrations/token/${session.manage_token}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.participants[0].attendance_status).toBe('cancelled');
  });
});

describe.skipIf(!available)('GET /api/participants/public', () => {
  beforeEach(async () => {
    await resetDb();
    await createEvent({ registrationOpen: true });
  });

  it('returns only public-safe fields', async () => {
    await request(app)
      .post('/api/registrations')
      .send({
        privacy_consent: true,
        participants: [{ ...validParticipant, address: 'Secret address' }],
      });
    const res = await request(app).get('/api/participants/public');
    expect(res.status).toBe(200);
    const participant = res.body[0].participants[0];
    expect(Object.keys(participant).sort()).toEqual(
      ['email', 'full_name', 'nickname', 'sp_code', 'whatsapp_number'].sort(),
    );
  });
});
