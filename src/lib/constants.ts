// Pilihan rencana lokasi menginap (PRD v3.0 §8).
export const ACCOMMODATION_OPTIONS = [
  'Rumah Keluarga',
  'Hotel / Penginapan',
  'Rumah Sendiri (warga lokal)',
  'Belum Tahu',
] as const;

// Bantuan pengisian Kode SP pada form pendaftaran.
export const SP_CODE_HINT =
  'Format: SP[angka].[angka] — tambahkan A untuk pasangan. Contoh: SP4, SP4A, SP4.1.3';

// Contoh kode SP beserta artinya (ditampilkan sebagai panduan singkat).
export const SP_CODE_EXAMPLES: { code: string; meaning: string }[] = [
  { code: 'SP4', meaning: 'Anak ke-4 dari Soero Pramono' },
  { code: 'SP4A', meaning: 'Istri / suami dari SP4' },
  { code: 'SP4.1', meaning: 'Anak pertama dari SP4' },
  { code: 'SP4.1.3A', meaning: 'Pasangan dari anak ke-3 SP4.1' },
];

// Sumber data wilayah administrasi Indonesia (idn-area-data — CSV flat, lengkap & terbaru),
// dipakai untuk pencarian kecamatan domisili. Disajikan via CDN jsDelivr (CORS aman).
// File: provinces.csv (code,name) · regencies.csv (code,province_code,name) · districts.csv (code,regency_code,name)
export const WILAYAH_CSV = 'https://cdn.jsdelivr.net/gh/fityannugroho/idn-area-data@main/data';
