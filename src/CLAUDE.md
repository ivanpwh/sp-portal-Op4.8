# CLAUDE.md — Frontend (`src/`)

Konvensi lintas-proyek (PII, dual data-layer, guard produksi, dll.) ada di
[CLAUDE.md root](../CLAUDE.md) — file ini hanya berisi konvensi spesifik
frontend React. Baca juga [docs/API_REFERENCE.md](../docs/API_REFERENCE.md)
(kontrak HTTP yang dipetakan `api.real.ts`) dan
[docs/CHANGE_RECIPES.md](../docs/CHANGE_RECIPES.md) sebelum menambah field
atau fungsi data layer baru.

## Aturan wajib: 3 file data layer berubah bersamaan

Setiap fungsi baru di `src/lib/api.mock.ts` **HARUS** punya pasangan dengan
signature identik di `src/lib/api.real.ts`, **DAN** diekspor lewat mode
switch di `src/lib/api.ts` (`export const fn = DEMO_MODE ? mock.fn : real.fn;`
— lihat pola yang sudah ada untuk ~30 fungsi lain di file itu). Ketiga file
ini **tidak pernah** boleh berubah sebagian — menambah fungsi hanya di
`api.mock.ts` tanpa pasangan di `api.real.ts` akan membuat mode REAL gagal
build (import hilang) atau diam-diam tidak berfungsi.

Komponen **tidak boleh** mengimpor langsung dari `api.mock.ts` atau
`api.real.ts` — selalu dari `src/lib/api.ts`.

## Peringatan: `api.real.ts` belum diverifikasi penuh end-to-end

Komentar header `src/lib/api.real.ts` (baris ~7-10) menyatakan plumbing
sudah lengkap dan fungsi sudah dipetakan ke endpoint, tapi **belum
diverifikasi terhadap backend yang benar-benar berjalan**. Sebagian klaim di
komentar itu sendiri sudah usang (mis. klaim `exportCsv` "masih stub" —
padahal sudah full-implemented, lihat catatan kontradiksi di
[docs/API_REFERENCE.md](../docs/API_REFERENCE.md)). Kalau task menyentuh
mode REAL (`VITE_DEMO_MODE=false`): jalankan backend lokal sungguhan dan tes
endpoint yang disentuh secara langsung (curl/Postman/browser) — membaca kode
`api.real.ts` saja **tidak cukup** untuk menyimpulkan "sudah berfungsi".

## Konvensi komponen

- Halaman terbagi `src/pages/public/*` (tanpa login, dibungkus
  `PublicLayout`) vs `src/pages/admin/*` (butuh sesi committee, dibungkus
  `AdminLayout`) — lihat `src/components/PublicLayout.tsx` /
  `AdminLayout.tsx`.
- Form yang butuh input tanggal pakai `src/components/DatePicker.tsx`
  (Flowbite) — jangan reimplementasi date picker baru.
- Form yang butuh input alamat/region pakai `src/components/RegionPicker.tsx`
  — jangan reimplementasi region picker baru. Keduanya sudah dipakai di
  `src/pages/public/RegisterPage.tsx`, jadikan contoh pola pemakaian.

## DEMO_MODE default true — jangan salah simpul fitur "sudah berfungsi"

`src/lib/mode.ts`: `VITE_DEMO_MODE` kosong/tidak diset = DEMO (mock
localStorage), **bukan** REAL. Checkout baru tanpa `.env.local` otomatis
jalan di atas data contoh localStorage, tidak pernah menyentuh backend.
Implikasi saat verifikasi:

- Fitur yang "berhasil" di mode DEMO belum tentu berfungsi di backend nyata
  (logika `api.real.ts` bisa punya bug yang tidak muncul di mock — lihat
  peringatan di atas).
- Sebaliknya, bug yang hanya terjadi di query/transaction Postgres nyata
  tidak akan terdeteksi lewat mode DEMO sama sekali.

Selalu cek nilai efektif `VITE_DEMO_MODE` (env file atau default) sebelum
melaporkan hasil pengujian manual, dan sebutkan mode mana yang diuji.
