// Convert Prisma models (camelCase fields) into the snake_case JSON shapes the
// frontend expects. Mirrors participant_dict / session_dict / flatten in
// services.py, and CommitteeOut / EventSettingsOut / NotificationLogOut schemas.
//
// IMPORTANT: never serialize Committee.passwordHash to the client.

import type {
  Committee,
  EventSettings,
  NotificationLog,
  Participant,
  RegistrationSession,
} from '@prisma/client';
import { compareSpCode } from './utils';

export type SessionWithParticipants = RegistrationSession & {
  participants: Participant[];
};

export function committeeDict(c: Committee) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    role: c.role,
    is_active: c.isActive,
    created_at: c.createdAt,
  };
}

export function eventDict(e: EventSettings) {
  return {
    id: e.id,
    event_name: e.eventName,
    tagline: e.tagline,
    event_date: e.eventDate,
    location: e.location,
    address: e.address,
    maps_query: e.mapsQuery,
    registration_deadline: e.registrationDeadline,
    registration_open: e.registrationOpen,
    qr_checkin_enabled: e.qrCheckinEnabled,
    updated_at: e.updatedAt,
  };
}

export function participantDict(p: Participant) {
  return {
    id: p.id,
    session_id: p.sessionId,
    full_name: p.fullName,
    nickname: p.nickname,
    sp_code: p.spCode,
    birth_date: p.birthDate,
    address: p.address,
    address_detail: p.addressDetail,
    last_occupation: p.lastOccupation,
    accommodation: p.accommodation,
    email: p.email,
    whatsapp_number: p.whatsappNumber,
    attendance_status: p.attendanceStatus,
    is_checked_in: p.isCheckedIn,
    checked_in_at: p.checkedInAt,
  };
}

export function sessionDict(s: SessionWithParticipants) {
  const parts = [...s.participants].sort((a, b) => compareSpCode(a.spCode, b.spCode));
  return {
    id: s.id,
    manage_token: s.manageToken,
    privacy_consent: s.privacyConsent,
    registered_at: s.registeredAt,
    updated_at: s.updatedAt,
    participants: parts.map(participantDict),
  };
}

/** Participant dict + session's manage_token and registered_at (ParticipantWithSession). */
export function flatten(p: Participant, s: RegistrationSession) {
  return {
    ...participantDict(p),
    manage_token: s.manageToken,
    registered_at: s.registeredAt,
  };
}

export function notificationLogDict(l: NotificationLog) {
  return {
    id: l.id,
    session_id: l.sessionId,
    type: l.type,
    channel: l.channel,
    status: l.status,
    error_message: l.errorMessage,
    created_at: l.createdAt,
  };
}
