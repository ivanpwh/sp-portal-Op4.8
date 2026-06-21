// Auth middleware (was deps.py): requireCommittee + requireSuperAdmin.
import type { NextFunction, Request, Response } from 'express';
import type { Committee } from '@prisma/client';
import { prisma } from '../db';
import { decodeAccessToken } from '../security';
import { HttpError } from '../errors';

// Attach the authenticated committee to the request for downstream handlers.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      committee?: Committee;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export async function requireCommittee(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, 'Tidak terautentikasi.');

    const payload = decodeAccessToken(token);
    if (!payload || !payload.sub) {
      throw new HttpError(401, 'Token tidak valid atau kedaluwarsa.');
    }

    const committee = await prisma.committee.findUnique({ where: { id: payload.sub } });
    if (committee === null) throw new HttpError(401, 'Akun tidak ditemukan.');
    if (!committee.isActive) throw new HttpError(403, 'Akun panitia ini telah dinonaktifkan.');

    req.committee = committee;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.committee || req.committee.role !== 'super_admin') {
    return next(new HttpError(403, 'Akses khusus Super Admin.'));
  }
  next();
}
