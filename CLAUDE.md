# CLAUDE.md — SP Portal

Portal pendaftaran reuni keluarga besar Soero Pramono. **Data yang ditangani
adalah data keluarga nyata (nama, tanggal lahir, alamat, kontak), bukan data
dummy** — perlakukan setiap perubahan yang menyentuh PII dengan standar
produksi (validasi input, tidak ada log/serialisasi kredensial, tidak bocor ke
pihak ketiga).

## Peta Dokumentasi untuk Agent

- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) — baca sebelum menyentuh
  endpoint manapun.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — baca sebelum mengubah alur
  lintas frontend-backend.
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — baca sebelum menginterpretasikan
  istilah domain.
- [docs/CHANGE_RECIPES.md](docs/CHANGE_RECIPES.md) — baca SEBELUM memulai
  perubahan yang menyentuh field data / endpoint baru / aturan validasi
  lintas frontend-backend.
- [docs/KNOWN_GOTCHAS.md](docs/KNOWN_GOTCHAS.md) — baca sebelum menyimpulkan
  sesuatu "sudah pasti benar".
- `backend/CLAUDE.md` / `src/CLAUDE.md` — otomatis termuat saat bekerja di
  folder masing-masing.

## Arsitektur

Dua sisi terpisah dalam satu repo:

- **Frontend** (`src/`) — React 18 + TypeScript + Vite + Tailwind CSS,
  React Router v6. Struktur: `src/pages/{public,admin}` (halaman), `src/lib`
  (data layer, format helpers, tipe), `src/components`.
- **Backend** (`backend/src/`) — Express + TypeScript + Prisma + PostgreSQL.
  Struktur: `config.ts` (env), `db.ts` (PrismaClient), `utils.ts` (helper
  sp-code/whatsapp/umur/token), `security.ts` (bcrypt+JWT), `serializers.ts`
  (Prisma → JSON), `services.ts` (logika bisnis), `schemas.ts` (validasi zod),
  `middleware/auth.ts`, `routes/{public,auth,admin}.ts`. Detail setup ada di
  `backend/README.md`.

Kontrak HTTP backend meniru versi FastAPI lama secara sengaja, sehingga field
JSON selalu snake_case meski model Prisma-nya camelCase (lihat "Kontrak
serialisasi" di bawah).

## Dual data-layer frontend (mode demo vs real)

`src/lib/mode.ts` membaca env `VITE_DEMO_MODE` saat build:

- **DEMO (default, `VITE_DEMO_MODE` kosong/`true`)** → `src/lib/api.mock.ts`:
  data contoh di `localStorage`, jalan tanpa backend. Ini mode default supaya
  build portofolio tidak butuh konfigurasi apa pun dan **tidak pernah
  menyentuh data asli**.
- **REAL (`VITE_DEMO_MODE=false`)** → `src/lib/api.real.ts`: fetch ke backend
  Express lewat `VITE_API_URL`.

Semua komponen mengimpor dari `src/lib/api.ts` (switch mode transparan) —
jangan import langsung dari `api.mock.ts`/`api.real.ts` di komponen.

## Data PII & aturan penanganannya

Field PII di model Prisma (`backend/prisma/schema.prisma`):

- `Participant`: `fullName`, `nickname`, `birthDate`, `address`,
  `addressDetail`, `lastOccupation`, `email`, `whatsappNumber`.
- `RegistrationSession.manageToken`.
- `Committee.passwordHash`.

Aturan:

- **`passwordHash` tidak pernah diserialize ke client.** `committeeDict()` di
  `backend/src/serializers.ts` secara eksplisit tidak menyertakannya — jangan
  tambahkan field ini ke response manapun.
- **`manageToken` adalah capability token**, bukan sekadar ID: siapa pun yang
  memegangnya bisa mengelola/membatalkan sesi pendaftaran tanpa login. Dibuat
  oleh `genToken()` (`backend/src/utils.ts`) dengan `crypto.randomInt` (24
  karakter, bukan `Math.random`) — jangan pernah log token ini atau
  mengirimkannya ke pihak ketiga (analytics, error tracker, dsb).
- **Kontak di daftar peserta publik disamarkan DI SISI SERVER, bukan di
  komponen.** `GET /api/participants/public` tidak butuh login dan tidak
  dibatasi rate limit, jadi apa pun yang dikirimnya sama dengan dipublikasikan.
  `services.publicParticipants()` memanggil `maskWhatsapp()` dan `maskEmail()`
  (`backend/src/utils.ts`) sebelum data meninggalkan proses; `api.mock.ts`
  melakukan hal yang sama dengan `maskWhatsApp()`/`maskEmail()` dari
  `src/lib/format.ts` untuk mode demo. `ParticipantsPage.tsx` hanya menampilkan
  apa yang diterimanya — **jangan menyamarkan lagi di sana** (menyamarkan dua
  kali menghasilkan string berbeda dan menyesatkan), dan jangan menulis logic
  masking baru dari nol. Email tidak lagi dirender sebagai `mailto:` karena
  alamat tersamar bukan alamat yang bisa dikirimi surat.

## Kontrak serialisasi & validasi

- Model Prisma pakai field camelCase; response API selalu snake_case lewat
  fungsi di `backend/src/serializers.ts` (`participantDict`, `sessionDict`,
  `eventDict`, `committeeDict`, `notificationLogDict`).
- Body request divalidasi dengan zod di `backend/src/schemas.ts`. Skema zod
  default men-strip unknown keys (mirip Pydantic) — mengirim field ekstra pada
  PATCH tidak akan menyentuh field yang tidak dikenal skema.

## Guard produksi

`backend/src/config.ts` → `assertProductionSafe()` menolak start server saat
`NODE_ENV=production` jika:

- `SECRET_KEY` masih default (`dev-secret-change-me-please-use-a-long-random-string`)
  atau panjangnya < 32 karakter, atau
- `BOOTSTRAP_ADMIN_PASSWORD` masih `admin123`.

Jangan hapus/bypass guard ini.

## CORS & rate limiting

- CORS allowlist eksplisit lewat `corsOriginList` (`backend/src/config.ts`,
  env `CORS_ORIGINS`, koma-terpisah) — tidak ada wildcard origin.
- `POST /api/auth/login` dibatasi `express-rate-limit`: 10 percobaan / 15
  menit per IP, percobaan sukses tidak dihitung
  (`backend/src/routes/auth.ts`).

## Notifikasi (WA/Email) — log-only secara default

`NOTIFICATIONS_ENABLED=false` adalah default. Selama false, `logNotification()`
(`backend/src/services.ts`) hanya mencatat baris `notification_logs` dengan
status `dry_run` — **tidak ada pesan WA/Email nyata yang terkirim**.
Mengaktifkan flag ini berarti pesan akan benar-benar dikirim ke peserta asli
(gateway WA/Email belum diimplementasikan di balik flag ini per saat ini
ditulis — cek `services.ts` sebelum mengasumsikan integrasi sudah ada).

## Verifikasi sebelum menganggap task selesai

- Frontend: `npm run lint && npm run build` (lint = `tsc --noEmit`, build =
  `tsc -b && vite build`), lalu `npm run test` (Vitest).
- Backend: `npm run build` (`prisma generate` + `tsc`), lalu `npm test`
  (Vitest; `npm run test:unit` untuk subset tanpa DB).

Jangan laporkan perubahan sebagai selesai tanpa menjalankan perintah yang
relevan di sisi yang diubah.
