import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsApp,
  isValidWhatsApp,
  maskWhatsApp,
  isValidEmail,
  normalizeSpCode,
  isValidSpCode,
  spInduk,
  compareSpCode,
  calculateAge,
  formatBirthDate,
  mapsUrl,
  mapsEmbedUrl,
} from './format';

describe('normalizeWhatsApp / isValidWhatsApp', () => {
  it('converts a leading 0 to 62', () => {
    expect(normalizeWhatsApp('081234567890')).toBe('6281234567890');
  });
  it('converts a leading 8 to 62', () => {
    expect(normalizeWhatsApp('81234567890')).toBe('6281234567890');
  });
  it('strips separators and a leading +', () => {
    expect(normalizeWhatsApp('+62 812-345 (678).90')).toBe('6281234567890');
  });
  it('validates a proper number and rejects a short one', () => {
    expect(isValidWhatsApp('081234567890')).toBe(true);
    expect(isValidWhatsApp('0812')).toBe(false);
  });
});

describe('maskWhatsApp', () => {
  it('formats as "+62 812-•••••-890" for a normal number', () => {
    expect(maskWhatsApp('6281234567890')).toBe('+62 812-•••••-890');
  });
  it('returns an empty string for null/undefined/empty input', () => {
    expect(maskWhatsApp(null)).toBe('');
    expect(maskWhatsApp(undefined)).toBe('');
    expect(maskWhatsApp('')).toBe('');
  });
  it('does not crash on a too-short input, masking all digits', () => {
    expect(maskWhatsApp('123')).toBe('•••');
  });
});

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
  });
});

describe('normalizeSpCode / isValidSpCode', () => {
  it('uppercases and strips whitespace', () => {
    expect(normalizeSpCode(' sp4. 1 a ')).toBe('SP4.1A');
  });
  it('validates correct SP codes and rejects invalid ones', () => {
    expect(isValidSpCode('SP4.1.3A')).toBe(true);
    expect(isValidSpCode('bogus')).toBe(false);
    expect(isValidSpCode(null)).toBe(false);
  });
});

describe('spInduk', () => {
  it('extracts the first SP token', () => {
    expect(spInduk('SP4.1.3A')).toBe('SP4');
  });
  it('falls back to em-dash for unparseable input', () => {
    expect(spInduk('nope')).toBe('—');
  });
});

describe('compareSpCode', () => {
  it('orders SP4.1 before SP4.10 and SP2 before SP10', () => {
    expect(compareSpCode('SP4.1', 'SP4.10')).toBeLessThan(0);
    expect(compareSpCode('SP2', 'SP10')).toBeLessThan(0);
  });
  it('places a spouse (A suffix) directly after its owner', () => {
    expect(compareSpCode('SP4', 'SP4A')).toBeLessThan(0);
    expect(compareSpCode('SP4A', 'SP4.1')).toBeLessThan(0);
  });
});

// Format a Date's LOCAL y/m/d as 'YYYY-MM-DD' — calculateAge compares against
// `new Date()`'s local fields, so toISOString() (UTC) would shift the date
// under non-UTC timezones and give the wrong expected age.
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('calculateAge', () => {
  it('returns null for unparseable input', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge('bogus')).toBeNull();
  });

  it("subtracts one year when this year's birthday hasn't happened yet", () => {
    const today = new Date();
    const future = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate() + 1);
    expect(calculateAge(toLocalIsoDate(future))).toBe(39);
  });

  it("counts the full year once this year's birthday has passed", () => {
    const today = new Date();
    const past = new Date(today.getFullYear() - 40, today.getMonth(), today.getDate() - 1);
    expect(calculateAge(toLocalIsoDate(past))).toBe(40);
  });
});

describe('formatBirthDate', () => {
  it('formats a valid ISO date in Indonesian long form', () => {
    expect(formatBirthDate('1965-08-17')).toBe('17 Agustus 1965');
  });
  it('returns "-" for empty input and the raw text for unparseable input', () => {
    expect(formatBirthDate(null)).toBe('-');
    expect(formatBirthDate('not-a-date')).toBe('not-a-date');
  });
});

describe('mapsUrl / mapsEmbedUrl', () => {
  it('URL-encodes the query in mapsUrl', () => {
    expect(mapsUrl('Sajian Kembang Turi & Co')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Sajian%20Kembang%20Turi%20%26%20Co',
    );
  });
  it('URL-encodes the query in mapsEmbedUrl', () => {
    expect(mapsEmbedUrl('Sajian Kembang Turi & Co')).toBe(
      'https://maps.google.com/maps?q=Sajian%20Kembang%20Turi%20%26%20Co&z=15&output=embed',
    );
  });
});
