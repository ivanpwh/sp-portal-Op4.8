// Integration tests for services.ts — require a real local Postgres test DB
// (backend/.env.test -> sp_portal_test). Skipped automatically when that DB
// isn't reachable (see backend/test/db.ts). All seed data below is synthetic.
import { describe, it, expect, beforeEach } from 'vitest';
import { dbAvailable, resetDb } from '../test/db';
import { prisma } from './db';
import { uid, nowIso, genToken } from './utils';
import {
  computeRegistrationStatus,
  groupedBySpInduk,
  listSpInduk,
  publicParticipants,
  findForCheckin,
  computeStats,
  exportCsv,
  broadcast,
} from './services';

const available = await dbAvailable();
if (!available) {
  console.warn(
    '[services.test.ts] Postgres test DB not reachable — integration tests skipped. ' +
      'See backend/.env.test and the DB constraint in the test-suite brief.',
  );
}

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

async function createSession(
  participants: Array<Partial<Record<string, unknown>> & { fullName: string; spCode: string }>,
) {
  const sessionId = uid();
  await prisma.registrationSession.create({
    data: {
      id: sessionId,
      manageToken: genToken(),
      privacyConsent: true,
      registeredAt: nowIso(),
      updatedAt: null,
    },
  });
  for (const p of participants) {
    await prisma.participant.create({
      data: {
        id: uid(),
        sessionId,
        nickname: '',
        birthDate: '',
        address: '',
        addressDetail: '',
        lastOccupation: '',
        accommodation: '',
        email: null,
        whatsappNumber: null,
        attendanceStatus: 'will_attend',
        isCheckedIn: false,
        checkedInAt: null,
        ...p,
      },
    });
  }
  return sessionId;
}

describe.skipIf(!available)('services (integration)', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('computeRegistrationStatus', () => {
    it('is open when registration_open is true and no deadline has passed', async () => {
      await createEvent({ registrationOpen: true, registrationDeadline: null });
      const status = await computeRegistrationStatus();
      expect(status.open).toBe(true);
      expect(status.reason).toBe('open');
    });

    it('is closed_manual when registration_open is false', async () => {
      await createEvent({ registrationOpen: false });
      const status = await computeRegistrationStatus();
      expect(status.open).toBe(false);
      expect(status.reason).toBe('closed_manual');
    });

    it('is past_deadline when the deadline is in the past', async () => {
      await createEvent({
        registrationOpen: true,
        registrationDeadline: new Date(Date.now() - 86400000).toISOString(),
      });
      const status = await computeRegistrationStatus();
      expect(status.open).toBe(false);
      expect(status.reason).toBe('past_deadline');
    });
  });

  describe('groupedBySpInduk / listSpInduk', () => {
    it('groups participants under their SP Induk, sorted naturally', async () => {
      await createSession([
        { fullName: 'Test Person A', spCode: 'SP10' },
        { fullName: 'Test Person B', spCode: 'SP2' },
        { fullName: 'Test Person C', spCode: 'SP2.1' },
      ]);
      const groups = await groupedBySpInduk(true);
      expect(groups.map((g) => g.induk)).toEqual(['SP2', 'SP10']);
      expect(groups[0].participants.map((p) => p.full_name)).toEqual([
        'Test Person B',
        'Test Person C',
      ]);
    });

    it('excludes cancelled participants when onlyAttending is true', async () => {
      await createSession([
        { fullName: 'Attending', spCode: 'SP1', attendanceStatus: 'will_attend' },
        { fullName: 'Cancelled', spCode: 'SP1.1', attendanceStatus: 'cancelled' },
      ]);
      const groups = await groupedBySpInduk(true);
      const names = groups.flatMap((g) => g.participants.map((p) => p.full_name));
      expect(names).toEqual(['Attending']);
    });

    it('listSpInduk returns unique induks in natural order', async () => {
      await createSession([
        { fullName: 'A', spCode: 'SP10' },
        { fullName: 'B', spCode: 'SP2' },
        { fullName: 'C', spCode: 'SP2.5' },
      ]);
      expect(await listSpInduk()).toEqual(['SP2', 'SP10']);
    });
  });

  describe('publicParticipants', () => {
    it('exposes ONLY full_name/nickname/sp_code/whatsapp_number/email per participant', async () => {
      await createSession([
        {
          fullName: 'Public Person',
          spCode: 'SP1',
          nickname: 'Publik',
          email: 'test+public@example.com',
          whatsappNumber: '6281200000099',
          address: 'Alamat rahasia',
          birthDate: '1990-01-01',
        },
      ]);
      const groups = await publicParticipants();
      expect(groups).toHaveLength(1);
      const participant = groups[0].participants[0];
      expect(Object.keys(participant).sort()).toEqual(
        ['email', 'full_name', 'nickname', 'sp_code', 'whatsapp_number'].sort(),
      );
    });
  });

  describe('findForCheckin', () => {
    it('finds a participant by name, SP code, short code, or WA number', async () => {
      const sessionId = await createSession([
        {
          fullName: 'Findable Person',
          spCode: 'SP7',
          whatsappNumber: '6281200000077',
        },
      ]);
      const session = await prisma.registrationSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const byName = await findForCheckin('findable');
      expect(byName).toHaveLength(1);

      const byCode = await findForCheckin('sp7');
      expect(byCode).toHaveLength(1);

      const byWa = await findForCheckin('77');
      expect(byWa.some((p) => p.whatsapp_number === '6281200000077')).toBe(true);

      const shortCodePrefix = session.manageToken.slice(0, 6).toLowerCase();
      const byShortCode = await findForCheckin(shortCodePrefix);
      expect(byShortCode).toHaveLength(1);
    });

    it('excludes cancelled participants from search results', async () => {
      await createSession([
        { fullName: 'Cancelled Search Target', spCode: 'SP8', attendanceStatus: 'cancelled' },
      ]);
      const results = await findForCheckin('Cancelled Search Target');
      expect(results).toHaveLength(0);
    });
  });

  describe('computeStats', () => {
    it('tallies totals correctly', async () => {
      await createSession([
        { fullName: 'Attending 1', spCode: 'SP1', attendanceStatus: 'will_attend', isCheckedIn: true },
        { fullName: 'Attending 2', spCode: 'SP1.1', attendanceStatus: 'will_attend' },
        { fullName: 'Cancelled 1', spCode: 'SP2', attendanceStatus: 'cancelled' },
      ]);
      const stats = await computeStats();
      expect(stats.total_people).toBe(2);
      expect(stats.total_cancelled).toBe(1);
      expect(stats.total_checked_in).toBe(1);
      expect(stats.by_sp_induk.map((s) => s.induk)).toEqual(['SP1']);
    });
  });

  describe('exportCsv', () => {
    it('starts with a UTF-8 BOM and has the expected header row', async () => {
      await createSession([{ fullName: 'CSV Person', spCode: 'SP1' }]);
      const csv = await exportCsv();
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const firstLine = csv.slice(1).split('\r\n')[0];
      expect(firstLine).toBe(
        [
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
        ].join(','),
      );
    });
  });

  describe('broadcast', () => {
    it('creates one notification log per session per channel', async () => {
      await createSession([{ fullName: 'Broadcast Target', spCode: 'SP1' }]);
      const result = await broadcast(null, true, ['whatsapp', 'email']);
      expect(result.total).toBe(1);
      expect(result.logs).toHaveLength(2);
    });
  });
});
