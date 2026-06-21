// Public (no-login) endpoints: event info, registration status, register,
// self-service manage-by-token, and the public participants list. (was public.py)
import { Router } from 'express';
import { prisma } from '../db';
import * as services from '../services';
import { HttpError } from '../errors';
import { asyncHandler, parseBody } from '../http';
import { eventDict, sessionDict } from '../serializers';
import { registrationInputSchema, sessionFullUpdateSchema } from '../schemas';
import type { ParticipantInputData } from '../services';
import {
  genToken,
  isValidSpCode,
  normalizeSpCode,
  normalizeWhatsapp,
  nowIso,
  uid,
} from '../utils';

export const publicRouter = Router();

function validateParticipants(participants: ParticipantInputData[]): void {
  for (const p of participants) {
    if (!(p.full_name || '').trim()) {
      throw new HttpError(422, 'Nama lengkap wajib diisi.');
    }
    if (!isValidSpCode(p.sp_code)) {
      throw new HttpError(422, `Kode SP tidak valid: ${p.sp_code}`);
    }
  }
}

const sessionWithParticipants = { include: { participants: true } } as const;

publicRouter.get(
  '/setup-status',
  asyncHandler(async (_req, res) => {
    const count = await prisma.committee.count();
    const hasOnlyDefault =
      count === 1 &&
      (await prisma.committee.findFirst({ where: { email: 'admin@spportal.id' } })) !== null;
    res.json({ only_default_admin: hasOnlyDefault });
  }),
);

publicRouter.get(
  '/event',
  asyncHandler(async (_req, res) => {
    res.json(eventDict(await services.getEvent()));
  }),
);

publicRouter.get(
  '/event/status',
  asyncHandler(async (_req, res) => {
    res.json(await services.computeRegistrationStatus());
  }),
);

publicRouter.post(
  '/registrations',
  asyncHandler(async (req, res) => {
    const body = parseBody(registrationInputSchema, req.body);

    // Honeypot — silently reject bots.
    if (body.website && body.website.trim() !== '') {
      throw new HttpError(400, 'Pengiriman ditolak.');
    }

    const regStatus = await services.computeRegistrationStatus();
    if (!regStatus.open) throw new HttpError(403, regStatus.message);

    const participants = body.participants ?? [];
    if (!participants.length) {
      throw new HttpError(400, 'Minimal satu peserta harus didaftarkan.');
    }
    validateParticipants(participants);

    const sessionId = uid();
    await prisma.registrationSession.create({
      data: {
        id: sessionId,
        manageToken: genToken(),
        privacyConsent: Boolean(body.privacy_consent),
        registeredAt: nowIso(),
        updatedAt: null,
        participants: {
          create: participants.map((inp) => {
            const data = services.buildParticipantData(sessionId, inp);
            const { sessionId: _omit, ...rest } = data;
            return rest;
          }),
        },
      },
    });

    // Fire-and-forget notifications (log-only — no real WA/email yet).
    await services.logNotification(sessionId, 'committee_blast', 'whatsapp');
    await services.logNotification(sessionId, 'committee_blast', 'email');
    await services.logNotification(sessionId, 'participant_confirmation', 'whatsapp');
    await services.logNotification(sessionId, 'participant_confirmation', 'email');

    const session = await prisma.registrationSession.findUniqueOrThrow({
      where: { id: sessionId },
      ...sessionWithParticipants,
    });
    res.status(201).json(sessionDict(session));
  }),
);

publicRouter.get(
  '/registrations/token/:token',
  asyncHandler(async (req, res) => {
    const s = await prisma.registrationSession.findUnique({
      where: { manageToken: req.params.token },
      ...sessionWithParticipants,
    });
    // Returns null (200) when not found — mirrors getSessionByToken(): Promise<… | null>.
    res.json(s ? sessionDict(s) : null);
  }),
);

publicRouter.patch(
  '/registrations/token/:token',
  asyncHandler(async (req, res) => {
    const patch = parseBody(sessionFullUpdateSchema, req.body);
    const s = await prisma.registrationSession.findUnique({
      where: { manageToken: req.params.token },
      ...sessionWithParticipants,
    });
    if (s === null) throw new HttpError(404, 'Data pendaftaran tidak ditemukan.');

    if (patch.participants != null) validateParticipants(patch.participants);

    // Apply the whole edit atomically: a mid-loop failure must not leave the
    // session half-updated (some participants changed, others not).
    await prisma.$transaction(async (tx) => {
      if (patch.participants != null) {
        const existing = new Map(s.participants.map((p) => [p.id, p]));
        const keepIds = new Set<string>();

        for (const inp of patch.participants) {
          const prev = inp.id ? existing.get(inp.id) : undefined;
          if (prev) {
            // Update in place; preserve attendance_status + check-in.
            await tx.participant.update({
              where: { id: prev.id },
              data: {
                fullName: inp.full_name.trim(),
                nickname: (inp.nickname || '').trim(),
                spCode: normalizeSpCode(inp.sp_code),
                birthDate: (inp.birth_date || '').trim(),
                address: (inp.address || '').trim(),
                addressDetail: (inp.address_detail || '').trim(),
                lastOccupation: (inp.last_occupation || '').trim(),
                accommodation: (inp.accommodation || '').trim(),
                email: (inp.email || '').trim().toLowerCase() || null,
                whatsappNumber: inp.whatsapp_number
                  ? normalizeWhatsapp(inp.whatsapp_number)
                  : null,
              },
            });
            keepIds.add(prev.id);
          } else {
            const data = services.buildParticipantData(s.id, inp);
            await tx.participant.create({ data });
            keepIds.add(data.id as string);
          }
        }
        // Remove participants omitted from the submitted set.
        const removeIds = [...existing.keys()].filter((id) => !keepIds.has(id));
        if (removeIds.length) {
          await tx.participant.deleteMany({ where: { id: { in: removeIds } } });
        }
      }

      await tx.registrationSession.update({
        where: { id: s.id },
        data: { updatedAt: nowIso() },
      });
    });

    await services.logNotification(s.id, 'committee_blast', 'whatsapp');

    const updated = await prisma.registrationSession.findUniqueOrThrow({
      where: { id: s.id },
      ...sessionWithParticipants,
    });
    res.json(sessionDict(updated));
  }),
);

publicRouter.post(
  '/registrations/token/:token/cancel',
  asyncHandler(async (req, res) => {
    const s = await prisma.registrationSession.findUnique({
      where: { manageToken: req.params.token },
      ...sessionWithParticipants,
    });
    if (s === null) throw new HttpError(404, 'Data pendaftaran tidak ditemukan.');

    await prisma.$transaction([
      prisma.participant.updateMany({
        where: { sessionId: s.id },
        data: { attendanceStatus: 'cancelled' },
      }),
      prisma.registrationSession.update({
        where: { id: s.id },
        data: { updatedAt: nowIso() },
      }),
    ]);
    await services.logNotification(s.id, 'committee_blast', 'whatsapp');

    const updated = await prisma.registrationSession.findUniqueOrThrow({
      where: { id: s.id },
      ...sessionWithParticipants,
    });
    res.json(sessionDict(updated));
  }),
);

publicRouter.get(
  '/participants/public',
  asyncHandler(async (_req, res) => {
    res.json(await services.publicParticipants());
  }),
);
