// Pure helpers ported 1:1 from the Python backend (utils.py), which in turn
// mirror the frontend (src/lib/format.ts): WhatsApp normalisation, SP-code
// handling, age calculation, token / id generation, CSV value stringification.

import { randomInt, randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// IDs, tokens, timestamps
// ---------------------------------------------------------------------------

const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function uid(): string {
  return randomUUID();
}

/**
 * Random 24-char alphanumeric manage token (NFR-04: 24+ chars entropy).
 * Uses crypto.randomInt — the manage token is a capability (it authorizes
 * editing/cancelling a registration), so it must NOT come from Math.random.
 */
export function genToken(length = 24): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return out;
}

/** UTC timestamp in JS `toISOString()` shape, e.g. 2026-06-12T10:00:00.000Z. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Public human-readable check-in code: 'SP-' + first 6 chars, uppercased. */
export function shortCode(manageToken: string | null | undefined): string {
  return ('SP-' + (manageToken || '').slice(0, 6)).toUpperCase();
}

// ---------------------------------------------------------------------------
// WhatsApp (PRD §7) — normalise Indonesian numbers to international 62… form
// ---------------------------------------------------------------------------

export function normalizeWhatsapp(raw: string | null | undefined): string {
  let n = (raw || '').replace(/[\s\-().]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  // already starts with 62 (or other) — leave as-is
  return n;
}

export function isValidWhatsapp(raw: string | null | undefined): boolean {
  return /^62\d{8,13}$/.test(normalizeWhatsapp(raw));
}

// ---------------------------------------------------------------------------
// SP code (PRD §2) — format: SP[num](.[num])*[A]?  (A = spouse). Stored UPPERCASE.
// ---------------------------------------------------------------------------

const SP_CODE_RE = /^SP\d+(\.\d+)*A?$/;

export function normalizeSpCode(raw: string | null | undefined): string {
  return (raw || '').replace(/\s+/g, '').toUpperCase();
}

export function isValidSpCode(raw: string | null | undefined): boolean {
  return SP_CODE_RE.test(normalizeSpCode(raw));
}

/** SP Induk = first token of the SP code. 'SP4.1.3A' -> 'SP4'. */
export function spInduk(raw: string | null | undefined): string {
  const code = normalizeSpCode(raw);
  const m = code.match(/^SP\d+/);
  return m ? m[0] : '—';
}

function spParts(c: string): number[] {
  const s = normalizeSpCode(c).replace(/^SP/, '');
  return s.split('.').map((p) => {
    const digits = p.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  });
}

/**
 * Natural ordering: SP4.1 before SP4.10, SP2 before SP10; spouse (A) right
 * after its owner. Mirrors compareSpCode in format.ts.
 */
export function compareSpCode(a: string, b: string): number {
  const pa = spParts(a);
  const pb = spParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (i < pa.length ? pa[i] : -1) - (i < pb.length ? pb[i] : -1);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  const aa = /A$/.test(normalizeSpCode(a)) ? 1 : 0;
  const bb = /A$/.test(normalizeSpCode(b)) ? 1 : 0;
  return aa - bb;
}

// ---------------------------------------------------------------------------
// Email + age + CSV helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  return EMAIL_RE.test((email || '').trim());
}

/** Age from an ISO 'YYYY-MM-DD' birth date; null if unparseable / out of range. */
export function calculateAge(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const m = birth.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - mo;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
}

/** Mirror JS String(v ?? '') used by the CSV exporter: null->'', bool->lowercase. */
export function jsStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Parse an ISO timestamp (accepts trailing Z). Returns a Date or null. */
export function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
