// Sumber data aplikasi: mode DEMO (mock localStorage) vs REAL (backend FastAPI).
//
// Dikontrol saat build lewat env VITE_DEMO_MODE:
//   - true / kosong  -> DEMO: pakai data contoh di localStorage (mock). Cocok untuk
//                       PORTOFOLIO — jalan tanpa backend & tanpa data asli.
//   - false          -> REAL: ambil data dari backend FastAPI (butuh VITE_API_URL).
//
// Default sengaja DEMO supaya build portofolio tidak butuh konfigurasi apa pun dan
// tidak pernah menyentuh data asli.
const raw = import.meta.env.VITE_DEMO_MODE;
export const DEMO_MODE: boolean = raw === undefined ? true : String(raw).toLowerCase() !== 'false';

// Base URL backend — hanya dipakai di mode REAL.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
