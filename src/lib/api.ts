// ---------------------------------------------------------------------------
// SP Portal — Frontend data layer: MODE SWITCH.
//
// Memilih sumber data saat build berdasarkan VITE_DEMO_MODE (lihat ./mode.ts):
//   - DEMO (default) -> ./api.mock.ts  : data contoh di localStorage (PORTOFOLIO,
//                                         tanpa backend & tanpa data asli).
//   - REAL           -> ./api.real.ts  : backend FastAPI (butuh VITE_API_URL).
//
// Semua komponen tetap meng-import dari '../lib/api' seperti biasa — hanya isinya
// yang berganti sesuai mode. Tanda tangan fungsi identik di kedua mode.
// ---------------------------------------------------------------------------

import * as mock from './api.mock';
import * as real from './api.real';
import { DEMO_MODE } from './mode';

// Re-export error & flag agar komponen bisa pakai `instanceof` dan menampilkan
// indikator mode demo bila perlu.
export { RegistrationClosedError } from './api.errors';
export { DEMO_MODE } from './mode';

// Tipe (sama di kedua mode) — diekspor dari implementasi mock.
export type { BroadcastResult, Session, SessionFullUpdate } from './api.mock';

// shortCode murni (tidak menyentuh localStorage), jadi aman dipakai di kedua mode.
export const shortCode = mock.shortCode;

// ----- Public ---------------------------------------------------------------
export const getSetupStatus = DEMO_MODE ? mock.getSetupStatus : real.getSetupStatus;
export const getEventSettings = DEMO_MODE ? mock.getEventSettings : real.getEventSettings;
export const getRegistrationStatus = DEMO_MODE ? mock.getRegistrationStatus : real.getRegistrationStatus;
export const submitRegistration = DEMO_MODE ? mock.submitRegistration : real.submitRegistration;
export const getSessionByToken = DEMO_MODE ? mock.getSessionByToken : real.getSessionByToken;
export const updateSessionByToken = DEMO_MODE ? mock.updateSessionByToken : real.updateSessionByToken;
export const cancelRegistrationByToken = DEMO_MODE ? mock.cancelRegistrationByToken : real.cancelRegistrationByToken;
export const getPublicParticipants = DEMO_MODE ? mock.getPublicParticipants : real.getPublicParticipants;

// ----- Auth -----------------------------------------------------------------
export const login = DEMO_MODE ? mock.login : real.login;
export const getSession = DEMO_MODE ? mock.getSession : real.getSession;
export const logout = DEMO_MODE ? mock.logout : real.logout;

// ----- Admin: sessions & participants ---------------------------------------
export const listSessions = DEMO_MODE ? mock.listSessions : real.listSessions;
export const getSessionById = DEMO_MODE ? mock.getSessionById : real.getSessionById;
export const deleteSession = DEMO_MODE ? mock.deleteSession : real.deleteSession;
export const addParticipant = DEMO_MODE ? mock.addParticipant : real.addParticipant;
export const updateParticipant = DEMO_MODE ? mock.updateParticipant : real.updateParticipant;
export const deleteParticipant = DEMO_MODE ? mock.deleteParticipant : real.deleteParticipant;
export const checkInParticipant = DEMO_MODE ? mock.checkInParticipant : real.checkInParticipant;
export const checkInSession = DEMO_MODE ? mock.checkInSession : real.checkInSession;
export const setParticipantStatus = DEMO_MODE ? mock.setParticipantStatus : real.setParticipantStatus;

// ----- Admin: check-in, grouping, stats -------------------------------------
export const findForCheckIn = DEMO_MODE ? mock.findForCheckIn : real.findForCheckIn;
export const listSpInduk = DEMO_MODE ? mock.listSpInduk : real.listSpInduk;
export const getGroupedBySpInduk = DEMO_MODE ? mock.getGroupedBySpInduk : real.getGroupedBySpInduk;
export const getStats = DEMO_MODE ? mock.getStats : real.getStats;
export const exportCsv = DEMO_MODE ? mock.exportCsv : real.exportCsv;

// ----- Admin: notifications -------------------------------------------------
export const broadcastReminder = DEMO_MODE ? mock.broadcastReminder : real.broadcastReminder;
export const listLogs = DEMO_MODE ? mock.listLogs : real.listLogs;
export const retryLog = DEMO_MODE ? mock.retryLog : real.retryLog;

// ----- Admin: event & committees --------------------------------------------
export const updateEventSettings = DEMO_MODE ? mock.updateEventSettings : real.updateEventSettings;
export const listCommittees = DEMO_MODE ? mock.listCommittees : real.listCommittees;
export const createCommittee = DEMO_MODE ? mock.createCommittee : real.createCommittee;
export const setCommitteeActive = DEMO_MODE ? mock.setCommitteeActive : real.setCommitteeActive;
export const updateCommittee = DEMO_MODE ? mock.updateCommittee : real.updateCommittee;
export const deleteCommittee = DEMO_MODE ? mock.deleteCommittee : real.deleteCommittee;
