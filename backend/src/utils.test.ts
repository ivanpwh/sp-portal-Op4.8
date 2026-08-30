import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsapp,
  isValidWhatsapp,
  normalizeSpCode,
  isValidSpCode,
  spInduk,
  compareSpCode,
  calculateAge,
  jsStr,
  parseIso,
  shortCode,
  genToken,
} from './utils';

describe('normalizeWhatsapp', () => {
  it('converts a leading 0 to 62', () => {
    expect(normalizeWhatsapp('081200000001')).toBe('6281200000001');
  });
  it('converts a leading 8 to 62', () => {
    expect(normalizeWhatsapp('81200000001')).toBe('6281200000001');
  });
  it('strips a leading + and separators', () => {
    expect(normalizeWhatsapp('+62 812-000 (000).01')).toBe('6281200000001');
  });
  it('handles null/undefined', () => {
    expect(normalizeWhatsapp(null)).toBe('');
    expect(normalizeWhatsapp(undefined)).toBe('');
  });
});

describe('isValidWhatsapp', () => {
  it('accepts a valid normalized number', () => {
    expect(isValidWhatsapp('081200000001')).toBe(true);
  });
  it('rejects too short a number', () => {
    expect(isValidWhatsapp('0812')).toBe(false);
  });
  it('rejects non-numeric junk', () => {
    expect(isValidWhatsapp('abc')).toBe(false);
  });
});

describe('normalizeSpCode / isValidSpCode', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalizeSpCode(' sp4. 1 a ')).toBe('SP4.1A');
  });
  it('accepts valid SP codes', () => {
    expect(isValidSpCode('SP4')).toBe(true);
    expect(isValidSpCode('sp4a')).toBe(true);
    expect(isValidSpCode('SP4.1.3A')).toBe(true);
  });
  it('rejects invalid SP codes', () => {
    expect(isValidSpCode('4')).toBe(false);
    expect(isValidSpCode('SPX')).toBe(false);
    expect(isValidSpCode('')).toBe(false);
    expect(isValidSpCode(null)).toBe(false);
  });
});

describe('spInduk', () => {
  it('extracts the first token', () => {
    expect(spInduk('SP4.1.3A')).toBe('SP4');
    expect(spInduk('SP10')).toBe('SP10');
  });
  it('falls back to em-dash for unparseable input', () => {
    expect(spInduk('bogus')).toBe('—');
    expect(spInduk(null)).toBe('—');
  });
});

describe('compareSpCode', () => {
  it('orders numerically, not lexically (SP2 < SP10)', () => {
    expect(compareSpCode('SP2', 'SP10')).toBeLessThan(0);
    expect(compareSpCode('SP10', 'SP2')).toBeGreaterThan(0);
  });
  it('orders sub-numbers numerically (SP4.1 < SP4.10)', () => {
    expect(compareSpCode('SP4.1', 'SP4.10')).toBeLessThan(0);
    expect(compareSpCode('SP4.10', 'SP4.1')).toBeGreaterThan(0);
  });
  it('places a spouse (A suffix) directly after its owner', () => {
    expect(compareSpCode('SP4', 'SP4A')).toBeLessThan(0);
    expect(compareSpCode('SP4A', 'SP4')).toBeGreaterThan(0);
    expect(compareSpCode('SP4A', 'SP4.1')).toBeLessThan(0);
  });
  it('treats equal codes as equal', () => {
    expect(compareSpCode('SP4.1', 'SP4.1')).toBe(0);
  });
  it('sorts a mixed list into the expected natural order', () => {
    const codes = ['SP10', 'SP2', 'SP4.10', 'SP4.1', 'SP4A', 'SP4'];
    expect([...codes].sort(compareSpCode)).toEqual(['SP2', 'SP4', 'SP4A', 'SP4.1', 'SP4.10', 'SP10']);
  });
});

// Format a Date's LOCAL y/m/d as 'YYYY-MM-DD' (calculateAge compares against
// `new Date()`'s local fields, so toISOString() — which is UTC — would shift
// the date under non-UTC timezones and give the wrong expected age).
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('calculateAge', () => {
  it('returns null for empty/unparseable input', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge(undefined)).toBeNull();
    expect(calculateAge('not-a-date')).toBeNull();
  });

  it('subtracts one year when this year\'s birthday has not happened yet', () => {
    const today = new Date();
    // A birthday one day in the future (this year) -> hasn't happened yet.
    const future = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate() + 1);
    expect(calculateAge(toLocalIsoDate(future))).toBe(29);
  });

  it('counts the full year once this year\'s birthday has passed', () => {
    const today = new Date();
    const past = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate() - 1);
    expect(calculateAge(toLocalIsoDate(past))).toBe(30);
  });

  it('counts the birthday itself as already happened (age 30, not 29)', () => {
    const today = new Date();
    const birthday = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
    expect(calculateAge(toLocalIsoDate(birthday))).toBe(30);
  });

  it('rejects out-of-range ages', () => {
    expect(calculateAge('1800-01-01')).toBeNull();
  });
});

describe('jsStr', () => {
  it('mirrors JS String(v ?? "")', () => {
    expect(jsStr(null)).toBe('');
    expect(jsStr(undefined)).toBe('');
    expect(jsStr(true)).toBe('true');
    expect(jsStr(false)).toBe('false');
    expect(jsStr(42)).toBe('42');
    expect(jsStr('x')).toBe('x');
  });
});

describe('parseIso', () => {
  it('parses a valid ISO timestamp', () => {
    const d = parseIso('2026-06-12T10:00:00.000Z');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2026);
  });
  it('returns null for empty/invalid input', () => {
    expect(parseIso(null)).toBeNull();
    expect(parseIso(undefined)).toBeNull();
    expect(parseIso('not-a-date')).toBeNull();
  });
});

describe('shortCode', () => {
  it('takes the first 6 chars uppercased with an SP- prefix', () => {
    expect(shortCode('abcdef1234567890')).toBe('SP-ABCDEF');
  });
  it('handles null/undefined tokens', () => {
    expect(shortCode(null)).toBe('SP-');
    expect(shortCode(undefined)).toBe('SP-');
  });
});

describe('genToken', () => {
  it('generates a 24-char token from the expected alphabet by default', () => {
    const t = genToken();
    expect(t).toHaveLength(24);
    expect(t).toMatch(/^[a-z0-9]{24}$/);
  });
  it('honors a custom length', () => {
    const t = genToken(10);
    expect(t).toHaveLength(10);
    expect(t).toMatch(/^[a-z0-9]{10}$/);
  });
  it('is not deterministic across calls', () => {
    expect(genToken()).not.toBe(genToken());
  });
});
