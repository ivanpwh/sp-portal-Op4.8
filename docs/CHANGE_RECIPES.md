# Change Recipes — SP Portal

> **Untuk AI coding agent.** Checklist file-per-file untuk jenis perubahan
> paling sering terjadi di proyek ini. Setiap daftar file diverifikasi
> langsung dari kode (bukan ditebak). Baca sebelum memulai perubahan yang
> menyentuh field data, endpoint baru, atau aturan validasi lintas
> frontend-backend — lihat juga [KNOWN_GOTCHAS.md](KNOWN_GOTCHAS.md),
> [API_REFERENCE.md](API_REFERENCE.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## a. Menambah field baru ke Participant

Contoh: field `diet` atau `nomor_kursi`. Field Participant terduplikasi di
**8 tempat** — ubah semuanya, urut dependency:

1. `backend/prisma/schema.prisma` — tambah kolom di model `Participant`
   (pakai `@map("snake_case_name")` mengikuti pola field lain).
2. Terapkan skema ke DB: `npm run prisma:push` (di `backend/`) — proyek ini
   **tidak** pakai file migrasi Prisma, `prisma db push` langsung
   menyamakan skema DB dengan `schema.prisma`.
3. `backend/src/serializers.ts` — tambah field baru ke `participantDict()`
   (dan `flatten()` bila field harus tampil di view gabungan
   session+participant seperti check-in search/grouping).
4. `backend/src/schemas.ts` — tambah field baru ke `participantInputSchema`
   (dipakai registrasi publik + admin create) **dan** ke
   `participantPatchSchema` (admin edit) sebagai `.optional()`.
5. `backend/src/services.ts` — tambah field ke `buildParticipantData()`
   (default value saat create) dan ke `CSV_HEADERS` bila field harus ikut
   diekspor CSV (lihat `exportCsv()` — kolom di luar `CSV_HEADERS` tidak
   pernah muncul di file ekspor meski ada di DB/response JSON).
6. `backend/src/routes/admin.ts` — tambah entri ke map `participantPatchToData()`
   (snake_case → camelCase Prisma) supaya PATCH admin benar-benar
   menyimpan field baru; juga tambah field yang sama ke blok `update` di
   `backend/src/routes/public.ts` (`PATCH /registrations/token/:token`) bila
   field harus bisa diedit lewat ManagePage swadaya.
7. `src/types.ts` — tambah field ke interface `Participant` (dan
   `ParticipantInput` bila field diisi saat registrasi/tambah peserta,
   `ParticipantWithSession` otomatis ikut karena extends `Participant`).
8. `src/lib/api.mock.ts` — tambah field ke `buildParticipant()` (default
   mock) dan ke data seed (`seed()`) supaya data contoh konsisten.
9. Form terkait di frontend — `src/pages/public/RegisterPage.tsx` (form
   pendaftaran/tambah peserta) dan/atau
   `src/pages/admin/RegistrantDetailPage.tsx` (edit peserta admin) — tambah
   input field baru dan sertakan di payload yang dikirim.
10. Test terkait — `backend/src/services.test.ts` (bila `buildParticipantData`
    atau `exportCsv` diuji dengan field spesifik) dan `src/lib/format.test.ts`
    bila field baru punya helper format/validasi baru.

**Verification:** `npm run build` (backend, dari `backend/`) dan `npm test`
(backend); `npm run lint && npm run build` lalu `npm run test` (frontend,
dari root) — semua harus lulus sebelum menganggap field selesai ditambahkan.

## b. Menambah endpoint admin baru

Ikuti pola lengkap di [backend/CLAUDE.md](../backend/CLAUDE.md) bagian "Pola
wajib: menambah endpoint baru" (`schemas.ts` → `services.ts` bila perlu →
`serializers.ts` bila bentuk response baru → `routes/admin.ts` dengan
`asyncHandler`/`parseBody` → `requireSuperAdmin` bila endpoint khusus super
admin). Setelah endpoint backend jalan, tambahkan pasangan fungsi di
`src/lib/api.mock.ts` + `src/lib/api.real.ts` + ekspor di `src/lib/api.ts`
(lihat [src/CLAUDE.md](../src/CLAUDE.md) — 3 file ini wajib berubah
bersamaan), lalu update [API_REFERENCE.md](API_REFERENCE.md) dengan baris
tabel endpoint baru supaya dokumen tetap akurat.

**Verification:** `npm run build && npm test` di `backend/`; jika ada
pemanggil baru di frontend, `npm run lint && npm run build && npm run test`
di root juga.

## c. Mengubah aturan validasi Kode SP

`SP_CODE_RE` (`/^SP\d+(\.\d+)*A?$/`) terduplikasi identik dan independen di
**dua tempat tanpa shared package**:

1. `backend/src/utils.ts` (`isValidSpCode`, `normalizeSpCode`).
2. `src/lib/format.ts` (`isValidSpCode`, `normalizeSpCode` — versi frontend).

Mengubah regex atau logic normalisasi di salah satu file **wajib** diikuti
perubahan identik di file pasangannya pada commit yang sama — kalau tidak,
validasi client (form) dan server (endpoint) akan berbeda, menghasilkan
kasus "lolos di form tapi ditolak backend" atau sebaliknya.

**Verification:** `npm test` di `backend/` (meng-cover `utils.test.ts`) dan
`npm run test` di root (meng-cover `format.test.ts`) — keduanya harus lulus
dengan assertion yang konsisten satu sama lain.

## d. Menambah channel notifikasi baru (selain whatsapp/email)

Titik yang harus disentuh (diverifikasi dari kode saat ini):

1. `backend/src/schemas.ts` — tambah nilai enum ke
   `broadcastInputSchema.channels` (`z.enum(['whatsapp', 'email'])`).
2. `backend/prisma/schema.prisma` — `NotificationLog.channel` adalah
   `String` bebas (bukan enum DB), jadi tidak perlu migrasi skema, tapi
   komentar di model (`// whatsapp | email`) harus diperbarui.
3. `src/types.ts` — `NotificationChannel` (`'whatsapp' | 'email'`) tambah
   nilai baru.
4. `src/pages/admin/BroadcastPage.tsx` — UI pemilihan channel untuk
   broadcast.
5. Backend **tidak** punya gateway pengiriman nyata untuk channel manapun
   saat ini (lihat [KNOWN_GOTCHAS.md](KNOWN_GOTCHAS.md)) — menambah channel
   baru hanya menambah opsi log-only kecuali gateway pengiriman
   diimplementasikan terpisah di `services.ts:logNotification()`.

**Verification:** `npm test` di `backend/` (`schemas.test.ts`,
`services.test.ts`); `npm run build` di root untuk memastikan tipe frontend
konsisten.

## e. Menambah role Committee baru (selain super_admin/committee)

1. `backend/prisma/schema.prisma` — `Committee.role` adalah `String` bebas
   (default `"committee"`), tidak perlu migrasi skema untuk nilai baru.
2. `backend/src/schemas.ts` — perluas enum di `committeeCreateSchema.role`
   dan `committeeUpdateSchema.role` (`z.enum(['super_admin', 'committee'])`).
3. `backend/src/middleware/auth.ts` — `requireSuperAdmin` mengecek
   `req.committee.role === 'super_admin'` secara eksak; role baru **tidak**
   otomatis mendapat akses super_admin — putuskan middleware/pengecekan baru
   bila role ini butuh akses berbeda dari `committee` biasa.
4. `src/types.ts` — `CommitteeRole` tambah nilai baru.
5. `src/pages/admin/CommitteesPage.tsx` — UI pemilihan/tampilan role.
6. Cek ulang proteksi "jangan sampai super_admin terakhir terhapus/didemosi"
   di `backend/src/routes/admin.ts` (`otherSupers` count pada `PATCH` dan
   `DELETE /committees/:id`) — logic ini spesifik untuk nilai string
   `'super_admin'`, pastikan tidak perlu proteksi serupa untuk role baru.

**Verification:** `npm test` di `backend/` (`routes/admin.test.ts` meng-cover
proteksi super_admin terakhir); `npm run build` di root.
