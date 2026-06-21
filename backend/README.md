# SP Portal Backend (Express + Prisma + SQLite)

Backend untuk SP Portal (Reuni Keluarga Soero Pramono). Ditulis dengan
**Express + TypeScript + Prisma (SQLite)**. Kontrak HTTP-nya identik dengan
versi FastAPI lama, sehingga frontend tidak perlu diubah.

## Setup

```bash
cd backend
cp .env.example .env          # sesuaikan SECRET_KEY dll
npm install
npm run prisma:generate       # buat Prisma Client
npm run prisma:push           # buat tabel di SQLite (sp_portal.db)
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
| `npm run prisma:push` | Sinkronkan schema ke database. |
| `npm run prisma:studio` | GUI untuk melihat/mengubah data. |

## Struktur

```
src/
  config.ts        # setelan dari env
  db.ts            # PrismaClient
  utils.ts         # helper sp-code / whatsapp / age / csv
  security.ts      # bcrypt + JWT
  serializers.ts   # konversi model -> JSON snake_case (kontrak frontend)
  services.ts      # logika bisnis (status, grouping, stats, csv, broadcast)
  schemas.ts       # validasi body (zod)
  middleware/auth.ts
  routes/{public,auth,admin}.ts
  seed.ts          # bootstrap admin + event
  app.ts / server.ts
prisma/schema.prisma
```
