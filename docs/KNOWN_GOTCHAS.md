# Known Gotchas — SP Portal

> **Untuk AI coding agent.** Jebakan yang **sudah terverifikasi ada di repo
> ini saat ini** (bukan teori umum tentang React/Express/Prisma). Baca
> sebelum menyimpulkan sesuatu "sudah pasti benar" berdasarkan nama
> file/fungsi/komentar saja.

## `src/lib/api.real.ts` belum diverifikasi end-to-end, dan komentarnya bisa usang

Komentar header file (baris ~7-10) mengklaim plumbing lengkap tapi belum
diuji terhadap backend yang benar-benar berjalan. Contoh konkret komentar
yang sudah **tidak akurat**: klaim "`exportCsv` masih stub" — padahal fungsi
itu (baris ~232-246) sudah full-implemented (`fetch` ke
`GET /api/admin/export/csv` dengan header `Authorization`, menangani error
JSON, mengembalikan `res.text()`). Jangan percaya komentar 100% — verifikasi
klaim dengan membaca kode aktual, dan untuk perubahan yang menyentuh mode
REAL secara kritis, jalankan backend lokal + tes manual (lihat
[src/CLAUDE.md](../src/CLAUDE.md)).

## DEMO_MODE default `true` — checkout baru diam-diam pakai mock

`src/lib/mode.ts`: `VITE_DEMO_MODE` tidak diset = DEMO. Tanpa `.env.local`,
seluruh aplikasi jalan di atas `localStorage` (`src/lib/api.mock.ts`), tidak
pernah menyentuh backend Express/PostgreSQL. Ini disengaja (build portofolio
publik), tapi menjebak saat verifikasi manual: fitur yang "terlihat
berfungsi" di browser bisa jadi hanya berfungsi di jalur mock, belum tentu
di jalur `api.real.ts` → backend nyata.

## Duplikasi field & regex tanpa shared source of truth

- Field `Participant`/`Committee`/`EventSettings` terduplikasi di ≥5 tempat
  independen (`schema.prisma`, `serializers.ts`, `schemas.ts`,
  `services.ts`, `routes/admin.ts` — lihat
  [backend/CLAUDE.md](../backend/CLAUDE.md)).
- `SP_CODE_RE` (regex format Kode SP) diimplementasikan identik dan
  independen di `backend/src/utils.ts` **dan** `src/lib/format.ts` — tidak
  ada shared package antara frontend dan backend di repo ini.

Ini adalah **root cause paling umum** dari bug kelas "berhasil di satu sisi,
rusak di sisi lain" (mis. field baru bisa disimpan di DB tapi tidak pernah
muncul di response JSON, atau lolos validasi form tapi ditolak backend).
Ikuti checklist di [CHANGE_RECIPES.md](CHANGE_RECIPES.md) setiap kali
menyentuh salah satu dari field/regex ini.

## Seed data mock dan seed data backend tidak sinkron — dan memang tidak perlu

`src/lib/api.mock.ts` (`seed()`, dipanggil saat data `localStorage` kosong)
dan `backend/src/seed.ts` (dijalankan manual terhadap Postgres) adalah dua
sumber data contoh yang **sepenuhnya independen**. Keduanya sengaja tidak
disinkronkan karena melayani mode yang berbeda (DEMO vs REAL) yang juga
tidak pernah saling terhubung — lihat "DEMO_MODE vs REAL_MODE" di
[GLOSSARY.md](GLOSSARY.md). Jangan asumsikan mengubah satu akan
memengaruhi yang lain, dan jangan mencoba "menyamakan" keduanya kecuali
diminta eksplisit.

## `NotificationLog.status: 'failed'` tidak pernah benar-benar diset

Skema (`backend/src/schemas.ts`, implisit via tipe) mendefinisikan status
`sent | failed | dry_run`, tapi kode saat ini (`services.ts:logNotification()`)
hanya pernah menghasilkan `sent` (bila `NOTIFICATIONS_ENABLED=true`) atau
`dry_run` (default). Tidak ada path yang menghasilkan `failed` — karena
belum ada gateway pengiriman nyata yang bisa gagal. Jangan menulis
logika/UI yang mengasumsikan `failed` bisa muncul dari alur saat ini tanpa
menambahkan gateway pengiriman terlebih dahulu.

## Backend tidak pakai file migrasi Prisma

`backend/prisma/` tidak berisi folder `migrations/` — perubahan skema
diterapkan langsung dengan `npm run prisma:push` (`prisma db push`), bukan
`prisma migrate dev`/`deploy`. Jangan menyarankan atau membuat file migrasi
manual kecuali proyek memang beralih strategi (perubahan besar, bukan
task dokumentasi biasa).
