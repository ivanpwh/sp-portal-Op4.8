// Authentication endpoints — mirrors login()/logout()/me in auth.py.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { HttpError } from '../errors';
import { asyncHandler, parseBody } from '../http';
import { committeeDict } from '../serializers';
import { loginInputSchema } from '../schemas';
import { createAccessToken, verifyPassword } from '../security';
import { requireCommittee } from '../middleware/auth';

export const authRouter = Router();

// Throttle login attempts to slow credential brute-forcing. Keyed by client IP;
// successful logins don't count against the limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { detail: 'Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.' },
});

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginInputSchema, req.body);
    const email = body.email.trim().toLowerCase();
    const committee = await prisma.committee.findFirst({ where: { email } });

    // Password checked before active flag, matching the mock's order.
    if (committee === null || !verifyPassword(body.password, committee.passwordHash)) {
      throw new HttpError(401, 'Email atau kata sandi salah.');
    }
    if (!committee.isActive) {
      throw new HttpError(403, 'Akun panitia ini telah dinonaktifkan.');
    }

    const token = createAccessToken(committee.id, committee.role);
    res.json({ token, committee: committeeDict(committee) });
  }),
);

authRouter.get(
  '/me',
  requireCommittee,
  asyncHandler(async (req, res) => {
    res.json(committeeDict(req.committee!));
  }),
);

authRouter.post('/logout', (_req, res) => {
  // Stateless JWT: nothing to revoke server-side; the client drops the token.
  res.status(204).end();
});
