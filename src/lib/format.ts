// Normalisasi nomor WhatsApp Indonesia ke format internasional (62…).
export function normalizeWhatsApp(raw: string): string {
  let n = (raw || '').replace(/[\s\-().]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  // already starts with 62 (or other) — leave as-is
  return n;
}

export function isValidWhatsApp(raw: string): boolean {
  const n = normalizeWhatsApp(raw);
  return /^62\d{8,13}$/.test(n);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ---------------------------------------------------------------------------
// Kode SP (PRD v3.0 §2)
// Format: SP[angka](.[angka])*[A]?  — suffix A menandai pasangan (istri/suami).
// Input case-insensitive; disimpan UPPERCASE tanpa spasi.
// Contoh valid: SP4, SP4A, SP4.1, SP4.1.3, SP4.1.3A.
// ---------------------------------------------------------------------------
const SP_CODE_RE = /^SP\d+(\.\d+)*A?$/;

export function normalizeSpCode(raw: string | null | undefined): string {
  return (raw || '').replace(/\s+/g, '').toUpperCase();
}

export function isValidSpCode(raw: string | null | undefined): boolean {
  return SP_CODE_RE.test(normalizeSpCode(raw));
}

// SP Induk = token pertama dari kode SP. "SP4.1.3A" → "SP4".
export function spInduk(rawCode: string | null | undefined): string {
  const code = normalizeSpCode(rawCode);
  const m = code.match(/^SP\d+/);
  return m ? m[0] : '—';
}

// Urutkan kode SP secara alami (SP4.1 sebelum SP4.10, SP2 sebelum SP10).
export function compareSpCode(a: string, b: string): number {
  const toParts = (c: string) =>
    normalizeSpCode(c)
      .replace(/^SP/, '')
      .split('.')
      .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const pa = toParts(a);
  const pb = toParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  // Pasangan (suffix A) tepat setelah pemiliknya.
  return Number(/A$/.test(normalizeSpCode(a))) - Number(/A$/.test(normalizeSpCode(b)));
}

// ---------------------------------------------------------------------------
// Tanggal & peta
// ---------------------------------------------------------------------------
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Tanggal lahir & umur
// birth_date disimpan sebagai ISO date "YYYY-MM-DD" (dari datepicker).
// Umur TIDAK diinput pengguna — dihitung dari tanggal lahir di sisi panitia.
// ---------------------------------------------------------------------------
export function calculateAge(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - mo;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
  return age >= 0 && age < 150 ? age : null;
}

// Tampilkan tanggal lahir ISO sebagai "17 Agustus 1965". Fallback: teks apa adanya.
export function formatBirthDate(birth: string | null | undefined): string {
  if (!birth) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birth.trim());
  if (!m) return birth;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsEmbedUrl(query: string): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=15&output=embed`;
}
