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

// ---------------------------------------------------------------------------
// EventTarget.prototype.addEventListener pada objek global
//
// Di lingkungan jsdom-nya vitest, `window` BUKAN instance Window milik jsdom —
// propertinya disalin ke objek global Node. Memanggil metode window secara
// normal (`window.addEventListener(...)`) tetap jalan karena salinannya sudah
// terikat, tapi memanggilnya lewat prototipe —
// `EventTarget.prototype.addEventListener.call(window, ...)` — gagal
// pemeriksaan merek jsdom dan melempar.
//
// Itu persis yang dilakukan flowbite-datepicker saat dibuat (ia menyimpan
// metode prototipe sekali lalu memakainya untuk semua target, termasuk
// `window`), sehingga TANPA jembatan ini <DatePicker> tidak bisa dirender sama
// sekali di dalam uji — bukan karena komponennya salah, melainkan karena
// bentuk global di lingkungan ujinya.
//
// Hanya panggilan yang `this`-nya objek global yang dialihkan; target lain
// (elemen, document) tetap lewat jalur aslinya apa adanya.
// ---------------------------------------------------------------------------
{
  type Listen = typeof EventTarget.prototype.addEventListener;
  type Unlisten = typeof EventTarget.prototype.removeEventListener;
  const g = globalThis as unknown as { addEventListener: Listen; removeEventListener: Unlisten };
  const globalAdd = g.addEventListener;
  const globalRemove = g.removeEventListener;
  const protoAdd = EventTarget.prototype.addEventListener;
  const protoRemove = EventTarget.prototype.removeEventListener;

  if (typeof globalAdd === 'function' && globalAdd !== protoAdd) {
    EventTarget.prototype.addEventListener = function (this: EventTarget, ...args) {
      if ((this as unknown) === globalThis) return globalAdd.apply(g, args) as void;
      return protoAdd.apply(this, args);
    } as Listen;
    EventTarget.prototype.removeEventListener = function (this: EventTarget, ...args) {
      if ((this as unknown) === globalThis) return globalRemove.apply(g, args) as void;
      return protoRemove.apply(this, args);
    } as Unlisten;
  }
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
