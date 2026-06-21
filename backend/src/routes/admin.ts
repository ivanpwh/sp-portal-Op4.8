// Admin (JWT-protected) endpoints — mirror admin.py.
// All routes require a valid Bearer token; committee management requires super_admin.
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import * as services from '../services';
import { HttpError } from '../errors';
import { asyncHandler, parseBody } from '../http';
import {
  committeeDict,
  eventDict,
  notificationLogDict,
  participantDict,
  sessionDict,
} from '../serializers';
import {
  broadcastInputSchema,
  checkinInputSchema,
  committeeCreateSchema,
  committeeToggleSchema,
  committeeUpdateSchema,
  eventSettingsPatchSchema,
  participantInputSchema,
  participantPatchSchema,
  statusInputSchema,
} from '../schemas';
import { hashPassword } from '../security';
import { settings } from '../config';
import { requireCommittee, requireSuperAdmin } from '../middleware/auth';
import { isValidSpCode, normalizeSpCode, nowIso, uid } from '../utils';

export const adminRouter = Router();

// Every admin route requires a logged-in committee.
adminRouter.use(requireCommittee);

const withParticipants = { include: { participants: true } } as const;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

adminRouter.get(
  '/sessions',
  asyncHandler(async (_req, res) => {
    const sessions = await prisma.registrationSession.findMany({
      ...withParticipants,
      orderBy: { registeredAt: 'desc' },
    });
    res.json(sessions.map(sessionDict));
  }),
);

adminRouter.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const s = await prisma.registrationSession.findUnique({
      where: { id: req.params.id },
      ...withParticipants,
    });
    res.json(s ? sessionDict(s) : null);
  }),
);

adminRouter.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const s = await prisma.registrationSession.findUnique({ where: { id: req.params.id } });
    if (s) await prisma.registrationSession.delete({ where: { id: s.id } }); // cascades
    res.status(204).end();
  }),
);

adminRouter.post(
  '/sessions/:id/participants',
  asyncHandler(async (req, res) => {
    const body = parseBody(participantInputSchema, req.body);
    const s = await prisma.registrationSession.findUnique({ where: { id: req.params.id } });
    if (s === null) throw new HttpError(404, 'Sesi tidak ditemukan.');
    if (!isValidSpCode(body.sp_code)) {
      throw new HttpError(422, `Kode SP tidak valid: ${body.sp_code}`);
    }
    const p = await prisma.participant.create({
      data: services.buildParticipantData(s.id, body),
    });
    res.status(201).json(participantDict(p));
  }),
);

adminRouter.post(
  '/sessions/:id/checkin-all',
  asyncHandler(async (req, res) => {
    const { value } = parseBody(checkinInputSchema, req.body);
    const s = await prisma.registrationSession.findUnique({
      where: { id: req.params.id },
      ...withParticipants,
    });
    if (s === null) throw new HttpError(404, 'Sesi tidak ditemukan.');

    const targets = s.participants.filter((p) => p.attendanceStatus !== 'cancelled');
    const checkedInAt = value ? nowIso() : null;
    await prisma.participant.updateMany({
      where: { id: { in: targets.map((p) => p.id) } },
      data: { isCheckedIn: value, checkedInAt },
    });
    res.json({ count: targets.length });
  }),
);

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

// Map snake_case patch keys to Prisma (camelCase) update data; only provided keys.
function participantPatchToData(
  patch: Record<string, unknown>,
): Prisma.ParticipantUpdateInput {
  const map: Record<string, string> = {
    full_name: 'fullName',
    nickname: 'nickname',
    sp_code: 'spCode',
    birth_date: 'birthDate',
    address: 'address',
    address_detail: 'addressDetail',
    last_occupation: 'lastOccupation',
    accommodation: 'accommodation',
    email: 'email',
    whatsapp_number: 'whatsappNumber',
    attendance_status: 'attendanceStatus',
    is_checked_in: 'isCheckedIn',
    checked_in_at: 'checkedInAt',
  };
  const data: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(patch)) {
    if (val === undefined || !(key in map)) continue;
    data[map[key]] = key === 'sp_code' ? normalizeSpCode(val as string) : val;
  }
  return data as Prisma.ParticipantUpdateInput;
}

adminRouter.patch(
  '/participants/:id',
  asyncHandler(async (req, res) => {
    const patch = parseBody(participantPatchSchema, req.body);
    const existing = await prisma.participant.findUnique({ where: { id: req.params.id } });
    if (existing === null) throw new HttpError(404, 'Peserta tidak ditemukan.');
    const p = await prisma.participant.update({
      where: { id: existing.id },
      data: participantPatchToData(patch as Record<string, unknown>),
    });
    res.json(participantDict(p));
  }),
);

adminRouter.delete(
  '/participants/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.participant.findUnique({ where: { id: req.params.id } });
    if (p) await prisma.participant.delete({ where: { id: p.id } });
    res.status(204).end();
  }),
);

adminRouter.post(
  '/participants/:id/checkin',
  asyncHandler(async (req, res) => {
    const { value } = parseBody(checkinInputSchema, req.body);
    const existing = await prisma.participant.findUnique({ where: { id: req.params.id } });
    if (existing === null) throw new HttpError(404, 'Peserta tidak ditemukan.');
    const p = await prisma.participant.update({
      where: { id: existing.id },
      data: { isCheckedIn: value, checkedInAt: value ? nowIso() : null },
    });
    res.json(participantDict(p));
  }),
);

adminRouter.post(
  '/participants/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = parseBody(statusInputSchema, req.body);
    const existing = await prisma.participant.findUnique({ where: { id: req.params.id } });
    if (existing === null) throw new HttpError(404, 'Peserta tidak ditemukan.');
    const p = await prisma.participant.update({
      where: { id: existing.id },
      data: { attendanceStatus: status },
    });
    res.json(participantDict(p));
  }),
);

// ---------------------------------------------------------------------------
// Check-in search + SP Induk grouping
// ---------------------------------------------------------------------------

adminRouter.get(
  '/checkin/search',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await services.findForCheckin(q));
  }),
);

adminRouter.get(
  '/sp-induk',
  asyncHandler(async (_req, res) => {
    res.json(await services.listSpInduk());
  }),
);

adminRouter.get(
  '/participants/grouped',
  asyncHandler(async (req, res) => {
    const onlyAttending = req.query.only_attending !== 'false';
    res.json(await services.groupedBySpInduk(onlyAttending));
  }),
);

// ---------------------------------------------------------------------------
// Stats + CSV export
// ---------------------------------------------------------------------------

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await services.computeStats());
  }),
);

adminRouter.get(
  '/export/csv',
  asyncHandler(async (req, res) => {
    const induk = typeof req.query.induk === 'string' ? req.query.induk : null;
    const csv = await services.exportCsv(induk);
    const filename = `sp-portal-peserta-${nowIso().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);

// ---------------------------------------------------------------------------
// Notifications (LOG-ONLY — no real WhatsApp/Email send yet)
// ---------------------------------------------------------------------------

adminRouter.post(
  '/notifications/broadcast',
  asyncHandler(async (req, res) => {
    const body = parseBody(broadcastInputSchema, req.body);
    if (!body.channels.length) throw new HttpError(400, 'Pilih minimal satu channel.');
    res.json(await services.broadcast(body.induk, body.onlyAttending ?? true, body.channels));
  }),
);

adminRouter.get(
  '/notifications/logs',
  asyncHandler(async (_req, res) => {
    const logs = await prisma.notificationLog.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(logs.map(notificationLogDict));
  }),
);

adminRouter.post(
  '/notifications/logs/:id/retry',
  asyncHandler(async (req, res) => {
    const log = await prisma.notificationLog.findUnique({ where: { id: req.params.id } });
    if (log === null) throw new HttpError(404, 'Log tidak ditemukan.');
    // No real delivery yet — just clear the error and re-stamp.
    const updated = await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: settings.notificationsEnabled ? 'sent' : 'dry_run',
        errorMessage: null,
        createdAt: nowIso(),
      },
    });
    res.json(notificationLogDict(updated));
  }),
);

// ---------------------------------------------------------------------------
// Event settings
// ---------------------------------------------------------------------------

adminRouter.get(
  '/event',
  asyncHandler(async (_req, res) => {
    res.json(eventDict(await services.getEvent()));
  }),
);

adminRouter.patch(
  '/event',
  asyncHandler(async (req, res) => {
    const patch = parseBody(eventSettingsPatchSchema, req.body);
    const ev = await services.getEvent();
    const map: Record<string, string> = {
      event_name: 'eventName',
      tagline: 'tagline',
      event_date: 'eventDate',
      location: 'location',
      address: 'address',
      maps_query: 'mapsQuery',
      registration_deadline: 'registrationDeadline',
      registration_open: 'registrationOpen',
      qr_checkin_enabled: 'qrCheckinEnabled',
    };
    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined || !(key in map)) continue;
      data[map[key]] = val;
    }
    data.updatedAt = nowIso();
    const updated = await prisma.eventSettings.update({ where: { id: ev.id }, data });
    res.json(eventDict(updated));
  }),
);

// ---------------------------------------------------------------------------
// Committees (super_admin only)
// ---------------------------------------------------------------------------

adminRouter.get(
  '/committees',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const committees = await prisma.committee.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(committees.map(committeeDict));
  }),
);

adminRouter.post(
  '/committees',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(committeeCreateSchema, req.body);
    const email = body.email.trim().toLowerCase();
    const exists = await prisma.committee.findFirst({ where: { email } });
    if (exists) throw new HttpError(409, 'Email panitia sudah digunakan.');
    const c = await prisma.committee.create({
      data: {
        id: uid(),
        name: body.name.trim(),
        email,
        role: body.role,
        isActive: true,
        createdAt: nowIso(),
        passwordHash: hashPassword(body.password),
      },
    });
    res.status(201).json(committeeDict(c));
  }),
);

adminRouter.patch(
  '/committees/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(committeeUpdateSchema, req.body);
    const c = await prisma.committee.findUnique({ where: { id: req.params.id } });
    if (c === null) throw new HttpError(404, 'Akun tidak ditemukan.');

    const nextEmail = body.email !== undefined ? body.email.trim().toLowerCase() : c.email;
    if (nextEmail !== c.email) {
      const clash = await prisma.committee.findFirst({
        where: { email: nextEmail, id: { not: c.id } },
      });
      if (clash) throw new HttpError(409, 'Email panitia sudah digunakan.');
    }

    // Don't allow demoting the last super admin (avoid lockout).
    if (c.role === 'super_admin' && body.role !== undefined && body.role !== 'super_admin') {
      const otherSupers = await prisma.committee.count({
        where: { role: 'super_admin', id: { not: c.id } },
      });
      if (otherSupers === 0) throw new HttpError(400, 'Minimal harus ada satu Super Admin.');
    }

    const data: Prisma.CommitteeUpdateInput = { email: nextEmail };
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.role !== undefined) data.role = body.role;
    if (body.password) data.passwordHash = hashPassword(body.password);

    const updated = await prisma.committee.update({ where: { id: c.id }, data });
    res.json(committeeDict(updated));
  }),
);

adminRouter.post(
  '/committees/:id/toggle',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = parseBody(committeeToggleSchema, req.body);
    const c = await prisma.committee.findUnique({ where: { id: req.params.id } });
    if (c === null) throw new HttpError(404, 'Akun tidak ditemukan.');
    const updated = await prisma.committee.update({
      where: { id: c.id },
      data: { isActive: body.is_active },
    });
    res.json(committeeDict(updated));
  }),
);

adminRouter.delete(
  '/committees/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const c = await prisma.committee.findUnique({ where: { id: req.params.id } });
    if (c === null) throw new HttpError(404, 'Akun tidak ditemukan.');
    if (c.role === 'super_admin') {
      const otherSupers = await prisma.committee.count({
        where: { role: 'super_admin', id: { not: c.id } },
      });
      if (otherSupers === 0) {
        throw new HttpError(400, 'Tidak dapat menghapus satu-satunya Super Admin.');
      }
    }
    await prisma.committee.delete({ where: { id: c.id } });
    res.json({ id: c.id });
  }),
);
