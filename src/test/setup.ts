// Setup bersama untuk uji komponen (vitest.config.ts -> test.setupFiles).
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// window.matchMedia
//
// jsdom tidak mengimplementasikannya, sementara `usePrefersReducedMotion`
// (src/components/ui.tsx) memanggilnya saat mount. Tanpa polyfill ini,
// LotteryReel melempar saat dirender, <SafeBoundary> menangkapnya, dan
// fallback-nya kebetulan memuat nama pemenang yang sama dengan yang dicari
// asersi — sehingga uji LULUS padahal komponennya crash. Kegagalan senyap
// semacam itu lebih berbahaya daripada uji yang merah.
//
// Bawaannya "tidak mengurangi gerak": itulah keadaan mayoritas penonton, dan
// jalur kode yang paling banyak dilewati. Uji yang butuh sebaliknya bisa
// menimpanya sendiri.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // Tanpa `globals: true`, React Testing Library tidak membersihkan dirinya
  // sendiri antar-test: DOM dari test sebelumnya tetap menempel, dan query
  // seperti getByRole tiba-tiba menemukan dua tombol dengan nama sama.
  cleanup();

  // Setiap uji komponen di sini menyentuh localStorage (sesi auth, pengaturan
  // undian, preset). Membiarkannya bocor antar-test membuat kegagalan bergantung
  // pada urutan eksekusi — jenis kegagalan yang paling lama dilacak.
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Diblokir di lingkungan tertentu — bukan alasan menggagalkan test.
  }
});
