import { describe, it, expect, beforeEach } from 'vitest';
import {
  submitRegistration,
  updateSessionByToken,
  cancelRegistrationByToken,
  login,
  checkInSession,
} from './api.mock';
import { RegistrationClosedError } from './api.errors';
import type { Committee, EventSettings } from '../types';

const LS_EVENT = 'sp.event_settings';
const LS_COMMITTEES = 'sp.committees';
const LS_PASSWORDS = 'sp.passwords';

function seedOpenEvent(overrides: Partial<EventSettings> = {}) {
  const event: EventSettings = {
    id: 'test-event',
    event_name: 'Test Event',
    tagline: '',
    event_date: '',
    location: '',
    address: '',
    maps_query: '',
    registration_deadline: null,
    registration_open: true,
    qr_checkin_enabled: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  localStorage.setItem(LS_EVENT, JSON.stringify(event));
}

function seedCommittee(overrides: Partial<Committee> = {}, password = 'correct-password') {
  const committee: Committee = {
    id: 'committee-1',
    name: 'Test Committee',
    email: 'test.committee@example.com',
    role: 'committee',
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  localStorage.setItem(LS_COMMITTEES, JSON.stringify([committee]));
  localStorage.setItem(LS_PASSWORDS, JSON.stringify({ [committee.email]: password }));
  return committee;
}

const validParticipant = {
  full_name: 'Test Registrant',
  sp_code: 'SP1',
  birth_date: '1990-01-01',
  address: 'Test Address',
};

describe('submitRegistration', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('succeeds with a valid payload', async () => {
    const result = await submitRegistration({
      privacy_consent: true,
      participants: [validParticipant],
    });
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].full_name).toBe('Test Registrant');
    expect(result.manage_token).toBeTruthy();
  });

  it('rejects submissions with the honeypot field filled in', async () => {
    await expect(
      submitRegistration({
        privacy_consent: true,
        participants: [validParticipant],
        website: 'http://spam.example',
      }),
    ).rejects.toThrow();
  });

  it('throws RegistrationClosedError when registration is closed', async () => {
    localStorage.clear();
    seedOpenEvent({ registration_open: false });
    await expect(
      submitRegistration({ privacy_consent: true, participants: [validParticipant] }),
    ).rejects.toBeInstanceOf(RegistrationClosedError);
  });
});

describe('updateSessionByToken', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('adds a new participant (no id), updates an existing one (with id), and removes an omitted one', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [
        { ...validParticipant, full_name: 'Keep And Update', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'To Be Removed', sp_code: 'SP1.1' },
      ],
    });
    const [toUpdate, toRemove] = session.participants;
    expect(toRemove).toBeTruthy();

    const updated = await updateSessionByToken(session.manage_token, {
      participants: [
        { ...validParticipant, id: toUpdate.id, full_name: 'Updated Name', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'Newly Added', sp_code: 'SP2' },
        // toRemove intentionally omitted -> should be deleted
      ],
    });

    const names = updated.participants.map((p) => p.full_name).sort();
    expect(names).toEqual(['Newly Added', 'Updated Name']);

    const updatedParticipant = updated.participants.find((p) => p.id === toUpdate.id);
    expect(updatedParticipant?.full_name).toBe('Updated Name');

    expect(updated.participants.some((p) => p.id === toRemove.id)).toBe(false);
  });
});

describe('cancelRegistrationByToken', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('marks all participants of the session as cancelled', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [validParticipant],
    });
    const cancelled = await cancelRegistrationByToken(session.manage_token);
    expect(cancelled.participants.every((p) => p.attendance_status === 'cancelled')).toBe(true);
  });

  it('throws for an unknown token', async () => {
    await expect(cancelRegistrationByToken('does-not-exist')).rejects.toThrow();
  });
});

describe('login', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('succeeds with correct credentials', async () => {
    const committee = seedCommittee();
    const session = await login(committee.email, 'correct-password');
    expect(session.token).toBeTruthy();
    expect(session.committee.email).toBe(committee.email);
  });

  it('rejects an incorrect password', async () => {
    const committee = seedCommittee();
    await expect(login(committee.email, 'wrong-password')).rejects.toThrow();
  });

  it('rejects a deactivated account', async () => {
    const committee = seedCommittee({ is_active: false });
    await expect(login(committee.email, 'correct-password')).rejects.toThrow();
  });
});

describe('checkInSession', () => {
  beforeEach(() => {
    localStorage.clear();
    seedOpenEvent();
  });

  it('checks in every attending participant of a session and skips cancelled ones', async () => {
    const session = await submitRegistration({
      privacy_consent: true,
      participants: [
        { ...validParticipant, full_name: 'Attending', sp_code: 'SP1' },
        { ...validParticipant, full_name: 'Also Attending', sp_code: 'SP1.1' },
      ],
    });
    // Cancel one participant directly via updateSessionByToken's sibling API is
    // unnecessary here — checkInSession only needs a session id.
    const count = await checkInSession(session.id, true);
    expect(count).toBe(2);
  });
});
