# CLAUDE.md — Backend (`backend/`)

Konvensi lintas-proyek (PII, dual data-layer, guard produksi, dll.) ada di
[CLAUDE.md root](../CLAUDE.md) — file ini hanya berisi konvensi spesifik
backend Express/Prisma. Baca juga [docs/API_REFERENCE.md](../docs/API_REFERENCE.md)
(kontrak HTTP lengkap) dan [docs/CHANGE_RECIPES.md](../docs/CHANGE_RECIPES.md)
(checklist perubahan lintas-file) sebelum menyentuh endpoint atau field.

## Pola wajib: menambah endpoint baru

Urutan file (verifikasi dari `routes/public.ts` dan `routes/admin.ts` yang
sudah ada):

1. **`schemas.ts`** — tambah/perluas skema zod untuk request body. Skema
   default strip unknown keys.
2. **`services.ts`** — jika ada logika bisnis non-trivial (query Prisma,
   agregasi, dsb.), taruh di sini sebagai fungsi terekspor, bukan inline di
   handler route. Endpoint sederhana (CRUD 1 baris) boleh query Prisma
   langsung di handler (lihat `adminRouter.get('/sessions', ...)`).
3. **`serializers.ts`** — jika response punya bentuk baru (bukan reuse
   `participantDict`/`sessionDict`/dst yang ada), tambah fungsi dict baru di
   sini supaya field tetap konsisten camelCase → snake_case.
4. **`routes/{public|admin|auth}.ts`** — tambah handler: bungkus dengan
   `asyncHandler(...)`, parse body dengan `parseBody(schema, req.body)` bila
   ada request body.
5. Jika endpoint admin-only super_admin, tambahkan middleware
   `requireSuperAdmin` setelah path (lihat route `/committees` di
   `admin.ts`) — `requireCommittee` sudah otomatis berlaku untuk **semua**
   route `adminRouter` lewat `adminRouter.use(requireCommittee)`
   (`admin.ts` baris 35), jadi tidak perlu ditambahkan manual per route.

## Konvensi error

Selalu `throw new HttpError(status, message)` (dari `errors.ts`) di dalam
handler yang dibungkus `asyncHandler` — **jangan** `res.status().json()`
manual. Ini konsisten di seluruh `routes/public.ts` dan `routes/admin.ts`
(diverifikasi — tidak ada satu pun `res.status().json()` untuk error path).
`asyncHandler` meneruskan rejection/exception ke error middleware pusat di
`app.ts`, yang mengubah `HttpError` jadi `{ "detail": message }` dengan
status yang sama. Body request divalidasi via `parseBody(schema, body)`
(`http.ts`) — otomatis melempar `HttpError(422, ...)` saat body tidak valid,
jangan validasi manual di handler.

## Konvensi testing backend

- **Unit test co-located** (`*.test.ts` di sebelah file yang ditest, mis.
  `utils.test.ts`, `schemas.test.ts`, `security.test.ts`, `services.test.ts`)
  — untuk pure function/logic, **tanpa DB**, selalu jalan.
- **Integration test** (`routes/*.test.ts`) butuh Postgres test DB terpisah
  (`backend/.env.test`, database `sp_portal_test` per komentar
  `backend/test/db.ts`). Setiap file integration test:
  - Memanggil `dbAvailable()` (`backend/test/db.ts`) sekali di top-level,
    lalu membungkus `describe` dengan `describe.skipIf(!available)(...)` —
    **tidak** gagal keras kalau Postgres lokal tidak jalan, cukup di-skip
    dengan warning console.
  - Memanggil `resetDb()` (biasanya di `beforeEach`) — menghapus semua baris
    di kelima tabel secara berurutan sesuai FK (`notification_logs` →
    `participants` → `registration_sessions` → `committees` →
    `event_settings`) supaya tiap test mulai dari state kosong.
  - Skema database di-push sekali oleh `backend/test/globalSetup.ts`
    (single process, tidak race antar worker paralel) — test individual
    tidak perlu push schema sendiri.
- `npm run test:unit` menjalankan subset unit-only tanpa butuh DB;
  `npm test` menjalankan semuanya (integration test yang tak punya DB akan
  ter-skip otomatis, bukan gagal).

## Peringatan: field Participant/Committee/EventSettings terduplikasi

Setiap field pada `Participant`, `Committee`, dan `EventSettings` muncul
identik di **≥5 tempat independen**: `prisma/schema.prisma`,
`serializers.ts` (fungsi dict terkait), `schemas.ts` (skema input/patch),
`services.ts` (`buildParticipantData`, `CSV_HEADERS` untuk Participant), dan
`routes/admin.ts` (`participantPatchToData` map untuk Participant/field
map inline untuk EventSettings). **Tidak ada single source of truth** yang
otomatis menyinkronkan kelimanya — mengubah field HARUS mengikuti checklist
lengkap di [docs/CHANGE_RECIPES.md](../docs/CHANGE_RECIPES.md), jangan
mengubah sebagian (mis. hanya `schema.prisma` + `serializers.ts` tanpa
`schemas.ts`) karena akan menghasilkan field yang "ada di DB tapi tidak bisa
diisi lewat API" atau sebaliknya.

Catatan skema DB: proyek ini **tidak pakai file migrasi Prisma** — perubahan
`schema.prisma` diterapkan dengan `npm run prisma:push` (`prisma db push`),
bukan `prisma migrate`.
