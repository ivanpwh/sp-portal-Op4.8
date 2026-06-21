// Password hashing (bcrypt) + JWT access tokens (was security.py).
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { settings } from './config';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  type: 'access';
  iat: number;
  exp: number;
}

// bcrypt only uses the first 72 bytes — truncate to match the Python backend
// and avoid surprises on very long input.
function truncate72(password: string): Buffer {
  return Buffer.from(password, 'utf-8').subarray(0, 72);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(truncate72(password).toString('utf-8'), bcrypt.genSaltSync());
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  try {
    return bcrypt.compareSync(truncate72(password).toString('utf-8'), passwordHash);
  } catch {
    return false;
  }
}

export function createAccessToken(committeeId: string, role: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: committeeId,
    role,
    type: 'access',
    iat: now,
    exp: now + settings.accessTokenExpireMinutes * 60,
  };
  return jwt.sign(payload, settings.secretKey, { algorithm: settings.algorithm });
}

export function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, settings.secretKey, {
      algorithms: [settings.algorithm],
    }) as AccessTokenPayload;
  } catch {
    // Covers expired, malformed, bad-signature, etc.
    return null;
  }
}
