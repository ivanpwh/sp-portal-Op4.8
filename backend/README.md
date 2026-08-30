# SP Portal Backend (Express + Prisma + PostgreSQL)

Backend untuk SP Portal (Reuni Keluarga Soero Pramono). Ditulis dengan
**Express + TypeScript + Prisma (PostgreSQL)**. Kontrak HTTP-nya identik dengan
versi FastAPI lama, sehingga frontend tidak perlu diubah.

Di produksi, database di-hosting di **Supabase PostgreSQL** dan backend
di-deploy sebagai **Vercel serverless function** — karena itu `schema.prisma`
memakai `url` (pooled, lewat PgBouncer) + `directUrl` (koneksi langsung,
dipakai untuk migrasi/`prisma db push`).

## Setup

```bash
cd backend
cp .env.example .env          # sesuaikan SECRET_KEY dll
npm install
# pastikan DATABASE_URL/DIRECT_URL menunjuk ke Postgres yang jalan
# (lihat "Database Lokal (Docker)" di bawah untuk opsi tercepat)
npm run prisma:generate       # buat Prisma Client
npm run prisma:push           # sinkronkan schema ke database
npm run dev                   # jalankan server (default :8000)
```

Saat pertama dijalankan, DB di-seed otomatis: 1 super-admin
(`admin@spportal.id` / `admin123`) + setelan event default.

## Skrip

| Skrip | Fungsi |
|---|---|
| `npm run dev` | Dev server dengan auto-reload (tsx watch). |
| `npm run build` | `prisma generate` + kompilasi TypeScript ke `dist/`. |
| `npm start` | Jalankan hasil build (`node dist/server.js`). |
| `npm run prisma:push` | Sinkronkan schema ke database (pakai `DIRECT_URL`). |
| `npm run prisma:studio` | GUI untuk melihat/mengubah data. |
| `npm test` | Jalankan seluruh test suite (Vitest). |
| `npm run test:unit` | Hanya test unit murni (utils/schemas/security), tanpa DB. |

## Database Lokal (Docker)

Repo menyertakan `docker-compose.yml` untuk menjalankan PostgreSQL lokal tanpa
instalasi manual:

```bash
cd backend
docker compose up -d
```

Ini menjalankan `postgres:16-alpine`, mengekspos port host **5433** (mapped ke
5432 di container), dengan database `sp_portal_dev` dan user/password
`postgres`/`postgres`. Data disimpan di volume Docker `pgdata` sehingga
persisten antar restart.

Samakan `.env` dengan kredensial ini, misalnya:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sp_portal_dev
DIRECT_URL=postgresql://postgres:postgres@localhost:5433/sp_portal_dev
```

Connect manual via `psql`:

```bash
psql postgresql://postgres:postgres@localhost:5433/sp_portal_dev
```

Atau via Prisma Studio (`npm run prisma:studio`) setelah `DATABASE_URL` di
`.env` menunjuk ke instance Docker ini.

## Keamanan Produksi (Supabase RLS)

`prisma/rls-setup.sql` mengaktifkan **Row-Level Security (RLS)** Postgres pada
kelima tabel (`committees`, `event_settings`, `registration_sessions`,
`participants`, `notification_logs`) dan mencabut (`REVOKE`) semua hak akses
tabel dari role `anon`/`authenticated` yang dipakai Supabase REST API/PostgREST.

- **Kapan dijalankan:** setelah deploy skema ke Supabase (`prisma db push`
  lewat `DIRECT_URL`), **sebelum** project Supabase di-expose ke publik —
  RLS + revoke ini menutup akses langsung ke data lewat REST API Supabase.
- **Cara menjalankan:** salin isi `prisma/rls-setup.sql` ke Supabase SQL
  Editor lalu jalankan, atau `psql <connection-string> -f prisma/rls-setup.sql`.
- **Mengapa aman meski Prisma tetap bisa akses data:** backend memakai role
  Postgres biasa (bukan `anon`/`authenticated`) via `DATABASE_URL`, dan role
  tabel-owner/superuser secara default **bypass RLS** di Postgres — sehingga
  Prisma tetap berfungsi normal. RLS di sini murni mengunci jalur akses
  langsung Supabase REST API (yang memakai role `anon`/`authenticated`), tanpa
  mengubah kode aplikasi apa pun.

## Struktur

```
src/
  config.ts        # setelan dari env
  db.ts            # PrismaClient
  utils.ts         # helper sp-code / whatsapp / age / csv / token
  security.ts      # bcrypt + JWT
  serializers.ts   # konversi model -> JSON snake_case (kontrak frontend)
  services.ts      # logika bisnis (status, grouping, stats, csv, broadcast)
  schemas.ts       # validasi body (zod)
  middleware/auth.ts
  routes/{public,auth,admin}.ts
  seed.ts          # bootstrap admin + event
  app.ts / server.ts
prisma/
  schema.prisma    # skema database (PostgreSQL)
  rls-setup.sql    # hardening RLS untuk Supabase (lihat di atas)
docker-compose.yml # PostgreSQL lokal untuk development
```
