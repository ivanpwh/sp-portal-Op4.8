import { describe, it, expect } from 'vitest';
import {
  registrationInputSchema,
  participantPatchSchema,
  eventSettingsPatchSchema,
  committeeCreateSchema,
  broadcastInputSchema,
  loginInputSchema,
} from './schemas';

describe('registrationInputSchema', () => {
  const validParticipant = { full_name: 'Budi Santoso', sp_code: 'SP4' };

  it('accepts a valid payload', () => {
    const result = registrationInputSchema.safeParse({
      privacy_consent: true,
      participants: [validParticipant],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a participant missing required fields', () => {
    const result = registrationInputSchema.safeParse({
      privacy_consent: true,
      participants: [{ full_name: 'No SP Code' }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults participants/privacy_consent/website when omitted', () => {
    const result = registrationInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.privacy_consent).toBe(false);
      expect(result.data.participants).toEqual([]);
    }
  });

  it('strips unknown keys (default zod .object() behavior, no .passthrough())', () => {
    const result = registrationInputSchema.safeParse({
      privacy_consent: true,
      participants: [validParticipant],
      unexpected_field: 'should be dropped',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('unexpected_field');
    }
  });
});

describe('participantPatchSchema', () => {
  it('accepts a partial patch', () => {
    const result = participantPatchSchema.safeParse({ full_name: 'New Name', is_checked_in: true });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid attendance_status enum value', () => {
    const result = participantPatchSchema.safeParse({ attendance_status: 'maybe' });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = participantPatchSchema.safeParse({ full_name: 'X', rogue: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('rogue');
  });
});

describe('eventSettingsPatchSchema', () => {
  it('accepts a valid partial patch', () => {
    const result = eventSettingsPatchSchema.safeParse({
      event_name: 'Reuni 2026',
      registration_open: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a wrong type for a known field', () => {
    const result = eventSettingsPatchSchema.safeParse({ registration_open: 'yes' });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = eventSettingsPatchSchema.safeParse({ event_name: 'X', not_a_field: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('not_a_field');
  });
});

describe('committeeCreateSchema', () => {
  it('accepts a valid payload and defaults role to committee', () => {
    const result = committeeCreateSchema.safeParse({
      name: 'Panitia Baru',
      email: 'panitia@example.com',
      password: 'secret123',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe('committee');
  });

  it('rejects a payload missing required fields', () => {
    const result = committeeCreateSchema.safeParse({ name: 'No Email Or Password' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid role enum value', () => {
    const result = committeeCreateSchema.safeParse({
      name: 'X',
      email: 'x@example.com',
      password: 'secret123',
      role: 'owner',
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = committeeCreateSchema.safeParse({
      name: 'X',
      email: 'x@example.com',
      password: 'secret123',
      extra: 'nope',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('extra');
  });
});

describe('broadcastInputSchema', () => {
  it('accepts a valid payload and defaults onlyAttending to true', () => {
    const result = broadcastInputSchema.safeParse({ channels: ['whatsapp', 'email'] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.onlyAttending).toBe(true);
  });

  it('rejects an invalid channel value', () => {
    const result = broadcastInputSchema.safeParse({ channels: ['sms'] });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = broadcastInputSchema.safeParse({ channels: ['email'], bogus: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('bogus');
  });
});

describe('loginInputSchema', () => {
  it('accepts a valid payload', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });
  it('rejects a payload missing password', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
  });
});
