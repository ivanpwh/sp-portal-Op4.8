// Convert Prisma models (camelCase fields) into the snake_case JSON shapes the
// frontend expects. Mirrors participant_dict / session_dict / flatten in
// services.py, and CommitteeOut / EventSettingsOut / NotificationLogOut schemas.
//
// IMPORTANT: never serialize Committee.passwordHash to the client.

import type {
  Committee,
  EventSettings,
  LotteryDraw,
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

/**
 * Lottery winner row. Deliberately exposes ONLY the identity fields already
 * public via GET /api/participants/public (full_name, nickname, sp_code) —
 * never whatsapp_number, email, birth_date, address or any other PII. The
 * LotteryDraw model itself stores no PII beyond these snapshots, so there is
 * nothing further to strip here.
 */
export function lotteryDrawDict(d: LotteryDraw) {
  return {
    id: d.id,
    participant_id: d.participantId,
    full_name: d.fullName,
    nickname: d.nickname,
    sp_code: d.spCode,
    drawn_at: d.drawnAt,
    drawn_by_name: d.drawnByName,
    round_label: d.roundLabel,
    // voided_at / voided_by_name / void_reason are INTENTIONALLY absent. They
    // are the audit trail: recorded in the database, never rendered anywhere.
    // listLotteryWinners() already filters cancelled rows out, so a row that
    // reaches this function is by definition an active winner.
  };
}
