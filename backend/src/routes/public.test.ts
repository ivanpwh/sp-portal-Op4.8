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

describe.skipIf(!available)('POST /api/registrations — Kode SP ganda', () => {
  beforeEach(async () => {
    await resetDb();
    await createEvent({ registrationOpen: true });
  });

  async function register(body: Record<string, unknown>) {
    return request(app).post('/api/registrations').send(body);
  }

  /**
   * Peringatan, bukan larangan. Kode SP ganda paling sering berarti pendaftar
   * kehilangan tautan kelolanya lalu mendaftar ulang — dulu itu menghasilkan
   * sesi kedua secara diam-diam.
   */
  it('menolak sekali dengan 409 saat Kode SP sudah terdaftar', async () => {
    await register({ privacy_consent: true, participants: [validParticipant] });

    const res = await register({ privacy_consent: true, participants: [validParticipant] });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/sudah terdaftar/i);
    expect(res.body.detail).toMatch(/SP1/);
  });

  it('menerima kiriman ulang yang membawa acknowledge_duplicate', async () => {
    await register({ privacy_consent: true, participants: [validParticipant] });

    const res = await register({
      privacy_consent: true,
      participants: [validParticipant],
      acknowledge_duplicate: true,
    });
    expect(res.status).toBe(201);
  });

  // Yang mendaftar ulang belum tentu orang yang sama; dia tidak berhak tahu
  // data pendaftaran sebelumnya.
  it('tidak membocorkan data pendaftaran pertama di pesan penolakan', async () => {
    await register({
      privacy_consent: true,
      participants: [
        {
          ...validParticipant,
          full_name: 'Nama Rahasia',
          whatsapp_number: '6281200000001',
          email: 'rahasia@example.com',
        },
      ],
    });

    const res = await register({ privacy_consent: true, participants: [validParticipant] });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/Nama Rahasia/);
    expect(body).not.toMatch(/6281200000001/);
    expect(body).not.toMatch(/rahasia@example\.com/);
  });

  // Membatalkan lalu mendaftar ulang adalah alur yang sah — memperingatkan
  // mereka soal kodenya sendiri hanya akan membingungkan.
  it('tidak menganggap peserta yang sudah dibatalkan sebagai bentrokan', async () => {
    const first = await register({ privacy_consent: true, participants: [validParticipant] });
    await request(app).post(`/api/registrations/token/${first.body.manage_token}/cancel`);

    const res = await register({ privacy_consent: true, participants: [validParticipant] });
    expect(res.status).toBe(201);
  });

  it('menyebut setiap Kode SP yang bentrok, bukan hanya yang pertama', async () => {
    await register({
      privacy_consent: true,
      participants: [
        { full_name: 'Satu', sp_code: 'SP1' },
        { full_name: 'Dua', sp_code: 'SP2' },
      ],
    });

    const res = await register({
      privacy_consent: true,
      participants: [
        { full_name: 'Satu Lagi', sp_code: 'SP1' },
        { full_name: 'Dua Lagi', sp_code: 'SP2' },
        { full_name: 'Baru', sp_code: 'SP3' },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/SP1/);
    expect(res.body.detail).toMatch(/SP2/);
    expect(res.body.detail).not.toMatch(/SP3/);
  });
});

describe.skipIf(!available)('GET /api/participants/public', () => {
  beforeEach(async () => {
    await resetDb();
    await createEvent({ registrationOpen: true });
  });

  it('exposes only name, SP code and MASKED contact fields', async () => {
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

  // REGRESSION: this endpoint takes no token and has no rate limit, so whatever
  // it returns is published to anyone who asks. Masking used to happen only in
  // ParticipantsPage.tsx, which meant the raw values were shipped to every
  // visitor and merely drawn over. Masking now happens in the service; this test
  // fails loudly if it ever moves back to the browser.
  it('never sends raw contact details to an unauthenticated caller', async () => {
    const rawWhatsapp = '6281299887766';
    const rawEmail = 'rahasia.sekali@example.com';

    await request(app)
      .post('/api/registrations')
      .send({
        privacy_consent: true,
        participants: [
          { ...validParticipant, whatsapp_number: rawWhatsapp, email: rawEmail },
        ],
      });

    // Deliberately no Authorization header.
    const res = await request(app).get('/api/participants/public');
    expect(res.status).toBe(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(rawWhatsapp);
    expect(body).not.toContain(rawEmail);
    expect(body).not.toContain('99887766');
    expect(body).not.toContain('rahasia.sekali');

    const participant = res.body[0].participants[0];
    expect(participant.whatsapp_number).toBe('+62 812-•••••-766');
    expect(participant.email).toBe('ra••••••••••••@example.com');
  });
});
