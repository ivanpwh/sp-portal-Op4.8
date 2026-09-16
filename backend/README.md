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

Saat dijalankan lewat `npm run dev` / `npm start`, DB di-seed otomatis pada
startup: 1 super-admin (`admin@spportal.id` / `admin123`) + setelan event
default.

> **Di produksi (Vercel) seed TIDAK otomatis.** Handler serverless sengaja
> tidak memanggil `bootstrap()` supaya tiap kontainer baru tidak membayar dua
> query lintas jaringan sebelum permintaan pertamanya dilayani. Setelah
> `npm run prisma:push` ke database baru, jalankan **`npm run db:seed` sekali**
> dengan env produksi. Melewatkannya berarti aplikasi hidup tanpa satu pun
> super-admin dan tanpa setelan event.

## Skrip

| Skrip | Fungsi |
|---|---|
| `npm run dev` | Dev server dengan auto-reload (tsx watch). |
| `npm run build` | `prisma generate` + kompilasi TypeScript ke `dist/`. |
| `npm start` | Jalankan hasil build (`node dist/server.js`). |
| `npm run prisma:push` | Sinkronkan schema ke database (pakai `DIRECT_URL`). |
| `npm run db:seed` | Semai super-admin + setelan event (wajib sekali di produksi). |
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

## Catatan Operasional Produksi

### Region fungsi harus sedaerah dengan database

Fungsi Vercel dijalankan di **hnd1 (Tokyo)** agar sedaerah dengan database
Supabase di `ap-northeast-1`. Ini bukan preferensi kosmetik: saat fungsi masih
berjalan di default `iad1` (Virginia), setiap query membayar satu perjalanan
lintas Pasifik dan `GET /api/event/status` terukur **2,9 detik**. Setelah
dipindah ke Tokyo, endpoint yang sama menjadi **0,24 detik**.

Bila database dipindahkan, **pindahkan region fungsinya juga.** Jarak antara
keduanya adalah biaya yang dibayar berulang kali pada setiap query.

### Seed wajib dijalankan manual

```bash
npm run db:seed              # lokal (butuh devDependency tsx)
node dist/seed.cli.js        # produksi, setelah npm run build
```

### Risiko jeda otomatis Supabase

Proyek Supabase tier gratis **dijeda otomatis** setelah beberapa hari tanpa
aktivitas, dan permintaan pertama setelahnya bisa memakan belasan detik atau
gagal. Portal pendaftaran reuni punya pola trafik yang persis paling rentan:
sepi berminggu-minggu, lalu ramai mendadak saat undangan disebar.

- Cara paling aman: naikkan ke tier berbayar sebelum undangan disebar.
- Alternatif: cron/uptime-pinger berkala. **Arahkan ke `/api/event`, bukan
  `/api/health`** — `/api/health` sengaja tidak menyentuh database sama
  sekali, sehingga tidak akan mencegah jeda meski terus dipanggil.

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
  seed.cli.ts      # entry `npm run db:seed` (sekali jalan saat deploy)
  app.ts / server.ts
prisma/
  schema.prisma    # skema database (PostgreSQL)
  rls-setup.sql    # hardening RLS untuk Supabase (lihat di atas)
docker-compose.yml # PostgreSQL lokal untuk development
```
