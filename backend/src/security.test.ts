import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  hashPassword,
  verifyPassword,
  createAccessToken,
  decodeAccessToken,
} from './security';
import { settings } from './config';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: the correct password verifies against its own hash', () => {
    const hash = hashPassword('correct-horse-battery-staple');
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hash = hashPassword('correct-horse-battery-staple');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('never stores the plaintext password in the hash', () => {
    const hash = hashPassword('plaintext-marker-xyz');
    expect(hash).not.toContain('plaintext-marker-xyz');
  });

  it('does not throw on a malformed hash — just fails verification', () => {
    expect(verifyPassword('anything', 'not-a-real-bcrypt-hash')).toBe(false);
  });
});

describe('createAccessToken / decodeAccessToken', () => {
  it('round-trips a valid token with the correct payload', () => {
    const token = createAccessToken('committee-123', 'super_admin');
    const payload = decodeAccessToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('committee-123');
    expect(payload!.role).toBe('super_admin');
    expect(payload!.type).toBe('access');
  });

  it('returns null for a malformed/invalid token', () => {
    expect(decodeAccessToken('not.a.jwt')).toBeNull();
  });

  it('returns null for a token signed with a different secret', () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = jwt.sign(
      { sub: 'x', role: 'super_admin', type: 'access', iat: now, exp: now + 3600 },
      'a-completely-different-secret',
      { algorithm: settings.algorithm },
    );
    expect(decodeAccessToken(forged)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expired = jwt.sign(
      { sub: 'committee-123', role: 'committee', type: 'access', iat: past - 60, exp: past },
      settings.secretKey,
      { algorithm: settings.algorithm },
    );
    expect(decodeAccessToken(expired)).toBeNull();
  });
});
