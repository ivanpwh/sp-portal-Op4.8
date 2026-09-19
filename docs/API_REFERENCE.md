# API Reference — SP Portal Backend

> **Untuk AI coding agent.** Dokumen ini adalah kontrak HTTP lengkap backend
> Express (`backend/src/routes/*.ts`), diverifikasi baris-per-baris dari kode
> sumber (bukan dari komentar atau nama fungsi). Tujuannya supaya agent tidak
> perlu membaca ulang `routes/`, `schemas.ts`, atau `serializers.ts` untuk tahu
> field request/response satu endpoint. **Field JSON semuanya snake_case**
> meski model Prisma memakai camelCase — lihat `backend/src/serializers.ts`.
>
> **Jumlah endpoint terverifikasi (2026-08-30):** 40 total —
> `public.ts` 8, `auth.ts` 3, `admin.ts` 29 (dihitung dari
> `grep -oE '(publicRouter|authRouter|adminRouter)\.(get|post|patch|delete)\(' backend/src/routes/*.ts | wc -l`
> per file). Tabel di bawah berisi persis 40 baris endpoint.
>
> **Mounting** (`backend/src/app.ts`): `publicRouter` di `/api`, `authRouter`
> di `/api/auth`, `adminRouter` di `/api/admin`. Semua route `adminRouter`
> melewati `adminRouter.use(requireCommittee)` (admin.ts baris ~35) — jadi
> **setiap** endpoint admin butuh JWT valid minimal role `committee`, kecuali
> yang eksplisit ditandai `requireSuperAdmin` di tabel di bawah.
>
> Error response selalu `{ "detail": "<pesan>" }` (lihat error handler di
> `backend/src/app.ts`). Body request divalidasi zod di `backend/src/schemas.ts`
> — skema **strip unknown keys** secara default (field ekstra pada PATCH tidak
> berpengaruh, tidak error).

## Public router (`/api/...`) — `backend/src/routes/public.ts`, tanpa login

| Method + Path | Auth | Rate limit | Request body (skema zod) | Response shape | Error eksplisit | Frontend caller (`src/lib/api.real.ts`) |
|---|---|---|---|---|---|---|
| `GET /api/setup-status` | publik | — | — | `{ only_default_admin: boolean }` | — | `getSetupStatus()` |
| `GET /api/event` | publik | — | — | `eventDict` (lihat bawah) | — | `getEventSettings()` |
| `GET /api/event/status` | publik | — | — | `computeRegistrationStatus()`: `{ open, reason: 'open'\|'closed_manual'\|'past_deadline', message, total_sessions, total_people, deadline }` | — | `getRegistrationStatus()` |
| `POST /api/registrations` | publik | — | `registrationInputSchema`: `{ privacy_consent?: bool (default false), participants: ParticipantInput[] (default []), website?: string\|null }` (`website` = honeypot anti-bot) | 201, `sessionDict` | 400 jika `website` terisi ("Pengiriman ditolak."); 403 jika `regStatus.open===false` (pesan dari status); 400 jika `participants` kosong; 422 jika nama kosong atau `sp_code` tidak valid regex | `submitRegistration()` — melempar `RegistrationClosedError` khusus saat 403 |
| `GET /api/registrations/token/:token` | publik (token = capability) | — | — | `sessionDict` atau `null` (200; tidak 404 saat token tak ditemukan) | — | `getSessionByToken()` |
| `PATCH /api/registrations/token/:token` | publik (token) | — | `sessionFullUpdateSchema`: `{ participants?: (ParticipantInput & { id?: string\|null })[] \| null }` | `sessionDict` | 404 jika token tak ditemukan; 422 jika ada peserta dengan nama kosong/`sp_code` invalid (divalidasi sebelum transaksi) | `updateSessionByToken()` |
| `POST /api/registrations/token/:token/cancel` | publik (token) | — | — (tidak butuh body) | `sessionDict`, semua peserta di sesi → `attendance_status: 'cancelled'` | 404 jika token tak ditemukan | `cancelRegistrationByToken()` |
| `GET /api/participants/public` | publik | — | — | `services.publicParticipants()`: `PublicSpIndukGroup[]` — `{ induk, participants: { full_name, nickname, sp_code, whatsapp_number, email }[] }[]`, hanya peserta `will_attend`. **`whatsapp_number` dan `email` SELALU tersamar** (`maskWhatsapp()`/`maskEmail()` di `backend/src/utils.ts`) — endpoint ini tanpa login dan tanpa rate limit, jadi nilai mentah tidak boleh pernah keluar. Diregresi di `backend/src/routes/public.test.ts` ("never sends raw contact details…") | — | `getPublicParticipants()` |

`ParticipantInput` (skema `participantInputSchema`, dipakai di banyak endpoint):
`{ full_name: string, nickname?: string|null, sp_code: string, birth_date?: string|null, address?: string|null, address_detail?: string|null, last_occupation?: string|null, accommodation?: string|null, email?: string|null, whatsapp_number?: string|null }`.

## Auth router (`/api/auth/...`) — `backend/src/routes/auth.ts`

| Method + Path | Auth | Rate limit | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|---|---|
| `POST /api/auth/login` | publik | **10 percobaan / 15 menit per IP**, `skipSuccessfulRequests: true` (percobaan sukses tidak dihitung); balasan 429 default `{ detail: "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit." }` | `loginInputSchema`: `{ email: string, password: string }` | `{ token: string, committee: committeeDict }` | 401 jika committee tak ditemukan atau password salah (password dicek **sebelum** `is_active`, urutan sengaja meniru mock); 403 jika `committee.isActive === false` | `login()` — menyimpan `{token, committee}` ke `localStorage['sp.session']` |
| `GET /api/auth/me` | `requireCommittee` | — | — | `committeeDict(req.committee)` | 401 jika token hilang/invalid; 401 jika akun tak ditemukan; 403 jika akun nonaktif | tidak dipanggil dari `api.real.ts` (tidak ada fungsi `me()`/`getMe()`) |
| `POST /api/auth/logout` | publik (stateless) | — | — | 204 no body | — | `logout()` — best-effort fetch, hasil diabaikan; token JWT tidak direvoke server-side |

`committeeDict`: `{ id, name, email, role, is_active, created_at }` — **`password_hash` TIDAK PERNAH disertakan**, lihat `backend/src/serializers.ts:committeeDict`.

## Admin router (`/api/admin/...`) — `backend/src/routes/admin.ts`, semua butuh `requireCommittee`

### Sessions

| Method + Path | Auth tambahan | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|---|
| `GET /api/admin/sessions` | — | — | `sessionDict[]`, urut `registeredAt desc` | — | `listSessions()` |
| `GET /api/admin/sessions/:id` | — | — | `sessionDict` atau `null` | — | `getSessionById()` |
| `DELETE /api/admin/sessions/:id` | — | — | 204 (no-op jika tak ditemukan; delete cascade ke participants via FK) | — | `deleteSession()` |
| `POST /api/admin/sessions/:id/participants` | — | `participantInputSchema` | 201, `participantDict` | 404 jika sesi tak ditemukan; 422 jika `sp_code` invalid | `addParticipant()` |
| `POST /api/admin/sessions/:id/checkin-all` | — | `checkinInputSchema`: `{ value?: bool (default true) }` | `{ count: number }` — jumlah peserta non-`cancelled` yang di-update | 404 jika sesi tak ditemukan | `checkInSession()` (mengembalikan `.count` saja) |

### Participants

| Method + Path | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|
| `PATCH /api/admin/participants/:id` | `participantPatchSchema` (semua field optional): `full_name, nickname, sp_code, birth_date, address, address_detail, last_occupation, accommodation, email (nullable), whatsapp_number (nullable), attendance_status ('will_attend'\|'cancelled'), is_checked_in (bool), checked_in_at (nullable string)` | `participantDict` | 404 jika peserta tak ditemukan | `updateParticipant()` |
| `DELETE /api/admin/participants/:id` | — | 204 (no-op jika tak ditemukan) | — | `deleteParticipant()` |
| `POST /api/admin/participants/:id/checkin` | `checkinInputSchema`: `{ value?: bool (default true) }` | `participantDict` | 404 jika peserta tak ditemukan | `checkInParticipant()` |
| `POST /api/admin/participants/:id/status` | `statusInputSchema`: `{ status: 'will_attend'\|'cancelled' }` | `participantDict` | 404 jika peserta tak ditemukan | `setParticipantStatus()` |

`participantDict`: `{ id, session_id, full_name, nickname, sp_code, birth_date, address, address_detail, last_occupation, accommodation, email, whatsapp_number, attendance_status, is_checked_in, checked_in_at }`.

### Check-in search & SP Induk grouping

| Method + Path | Query params | Response shape | Frontend caller |
|---|---|---|---|
| `GET /api/admin/checkin/search` | `q` (string, opsional) | `services.findForCheckin(q)`: array `flatten(participant, session)` — `participantDict` + `manage_token` + `registered_at`; jika `q` kosong, kembalikan semua non-`cancelled` (tanpa limit); filter cocok pada `full_name`, `sp_code`, `shortCode(manage_token)`, atau `whatsapp_number` (case-insensitive substring) | `findForCheckIn()` |
| `GET /api/admin/sp-induk` | — | `string[]` — daftar SP Induk unik (mis. `["SP1","SP2",...]`), urut `compareSpCode` | `listSpInduk()` |
| `GET /api/admin/participants/grouped` | `only_attending` (string; **hanya `"false"` yang mematikan filter**, apa pun selain itu = true) | `SpIndukGroup[]`: `{ induk, participants: flatten(...)[] }[]`, keduanya diurut `compareSpCode` | `getGroupedBySpInduk()` |

### Stats & export

| Method + Path | Query params | Response shape | Frontend caller |
|---|---|---|---|
| `GET /api/admin/stats` | — | `services.computeStats()`: `{ total_sessions, total_people, total_cancelled, total_checked_in, by_sp_induk: {induk, sessions, people}[], trend: {date, count}[] }` (`total_sessions`/`total_people` hanya hitung `will_attend`) | `getStats()` |
| `GET /api/admin/export/csv` | `induk` (string, opsional; `"all"` atau kosong = tanpa filter) | `text/csv; charset=utf-8`, header `Content-Disposition: attachment; filename="sp-portal-peserta-YYYY-MM-DD.csv"`. Kolom: `full_name, nickname, sp_code, sp_induk, birth_date, age, address, address_detail, last_occupation, accommodation, email, whatsapp_number, attendance_status, is_checked_in, checked_in_at, registered_at`. UTF-8 BOM + CRLF (Excel-ready), semua field diinput semua peserta (termasuk `cancelled`, tidak difilter) | `exportCsv()` — **lihat catatan kontradiksi di bawah** |

### Notifications (log-only)

| Method + Path | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|
| `POST /api/admin/notifications/broadcast` | `broadcastInputSchema`: `{ induk?: string\|null, onlyAttending?: bool (default true, **camelCase, bukan snake_case**), channels: ('whatsapp'\|'email')[] }` | `services.broadcast(...)`: `{ total: number (jumlah sesi unik terpengaruh), sent: number, failed: number, logs: notificationLogDict[] }` | 400 jika `channels` kosong | `broadcastReminder()` |
| `GET /api/admin/notifications/logs` | — | `notificationLogDict[]`, urut `createdAt desc` | — | `listLogs()` |
| `POST /api/admin/notifications/logs/:id/retry` | — | `notificationLogDict` — status di-reset ke `sent` (jika `NOTIFICATIONS_ENABLED=true`) atau `dry_run` (default), `error_message` dikosongkan, `created_at` di-restamp | 404 jika log tak ditemukan | `retryLog()` |

`notificationLogDict`: `{ id, session_id, type, channel, status, error_message, created_at }`. `type` ∈ `participant_confirmation \| committee_blast \| reminder`; `channel` ∈ `whatsapp \| email`; `status` ∈ `sent \| failed \| dry_run`.

### Event settings

| Method + Path | Request body | Response shape | Frontend caller |
|---|---|---|---|
| `GET /api/admin/event` | — | `eventDict` (sama shape dengan `GET /api/event` publik) | (tidak ada fungsi terpisah — `getEventSettings()` publik dipakai juga di admin) |
| `PATCH /api/admin/event` | `eventSettingsPatchSchema` (semua optional): `event_name, tagline, event_date, location, address, maps_query, registration_deadline (nullable), registration_open (bool), qr_checkin_enabled (bool)` | `eventDict` | `updateEventSettings()` |

`eventDict`: `{ id, event_name, tagline, event_date, location, address, maps_query, registration_deadline, registration_open, qr_checkin_enabled, updated_at }`.

### Lottery / Undian — `requireCommittee` saja, **tanpa `requireSuperAdmin`**

Alat operasional yang dipakai live saat acara, bukan administrasi akun — jadi
role `committee` biasa sudah cukup. Model `LotteryDraw` (`lottery_draws`)
menyimpan **snapshot** `full_name`/`nickname`/`sp_code` peserta saat menang, dan
`participant_id` adalah **soft reference** (tanpa `@relation`/FK, pola sama
dengan `NotificationLog.sessionId`) — riwayat pemenang tetap utuh walau
`Participant`-nya kemudian diedit atau dihapus lewat
`DELETE /api/admin/participants/:id`.

**Membatalkan pemenang adalah soft void, bukan DELETE.** Kolom `voided_at`,
`voided_by_name`, dan `void_reason` (`'undo' | 'manual' | 'reset'`) menandai
baris alih-alih menghapusnya, sehingga setiap pengundian **dan** setiap
pembatalan meninggalkan jejak. `voided_at: null` berarti "pemenang aktif" —
itulah saringan yang dipakai `getLotteryPool()` dan `listLotteryWinners()`.
Ketiga kolom itu **tidak pernah diserialisasi ke klien**: jejak audit hidup di
basis data dan tidak dirender di mana pun.

| Method + Path | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|
| `GET /api/admin/lottery/pool` | — | `services.getLotteryPool()`: `{ id, full_name, nickname, sp_code }[]` — peserta `will_attend` yang tidak punya baris `lottery_draws` **aktif** (anti-join dengan `voidedAt: null`), urut `compareSpCode`. Status check-in **tidak** berpengaruh. Endpoint ini **selalu mengembalikan pool penuh, tanpa filter kelompok**: dari sinilah halaman kontrol menyusun daftar kelompok SP beserta jumlahnya, jadi menyaringnya di sini akan membuat kelompok yang tidak tercentang lenyap dari daftar | — | `getLotteryPool()` — `LotteryControlPage` |
| `GET /api/admin/lottery/winners` | — | `lotteryDrawDict[]` — hanya pemenang **aktif**, urut `drawn_at desc` | — | `getLotteryWinners()` — `LotteryControlPage` |
| `POST /api/admin/lottery/draw` | `{ count?: 1..20 = 1, round_label?: string (<=60) = '', induk?: string[] = [] }` — body opsional; POST kosong = satu pemenang tanpa label dari SELURUH kelompok. `induk` = daftar **SP Induk** (`SP1`, `SP12` — bukan kode SP lengkap) yang ikut diundi; **daftar kosong berarti semua kelompok ikut** | `{ winner, winners: lotteryDrawDict[], remaining, requested }`. `winner` adalah **alias `winners[0]`**, dipertahankan sementara agar pemanggil lama tetap benar — pakai `winners` untuk kode baru. `requested > winners.length` berarti pool habis di tengah undian: itu **undian sebagian, bukan galat**. `remaining` dihitung **di dalam filter**, bukan atas pool penuh. Semua baris dalam satu undian berbagi `drawn_at` yang sama | **400** `"Tidak ada peserta tersisa untuk diundi."` jika pool kosong, atau `"…pada kelompok SP2."` bila yang habis adalah kelompok terpilih; **422** jika `count` di luar 1..20, jika ada entri `induk` yang bukan SP Induk (mis. `SP1.2`, `SP4A`), atau jika `induk` lebih dari `MAX_INDUK_FILTER` (200) entri | `drawLotteryWinner()` — `LotteryControlPage` (dipanggil SEKALI per undian; animasi reel murni penundaan di klien) |
| `POST /api/admin/lottery/undo` | — | `lotteryDrawDict[]` — SELURUH undian terakhir (semua baris aktif yang berbagi `drawn_at` terbesar), bukan satu baris. Semua pesertanya kembali ke pool | **400** `"Belum ada undian untuk dibatalkan."` jika tidak ada pemenang aktif | `undoLastLotteryDraw()` — `LotteryControlPage` (di balik Modal konfirmasi) |
| `POST /api/admin/lottery/winners/:id/void` | `{ reason?: 'undo' \| 'manual' \| 'reset' = 'manual' }` | `lotteryDrawDict` dari baris yang dibatalkan — pesertanya kembali ke pool. Untuk kasus yang tidak bisa ditangani undo: yang harus dikeluarkan jarang sekali pemenang terakhir | **404** `"Pemenang tidak ditemukan atau sudah dibatalkan."` | `voidLotteryWinner()` — `LotteryControlPage` (tombol "Kembalikan" per baris) |
| `POST /api/admin/lottery/reset` | — | `{ count: number }` — jumlah pemenang yang dikosongkan. Mengosongkan SELURUH daftar pemenang sekaligus; `/lottery/undo` **tidak** bisa memulihkannya. Barisnya sendiri tetap tersimpan sebagai jejak audit (`void_reason: 'reset'`), tapi tidak muncul lagi di endpoint mana pun. Frontend wajib memasang konfirmasi berlapis, bukan satu klik | — | `resetLottery()` — `LotteryControlPage` (di balik konfirmasi BERLAPIS: wajib mengetik ulang kata `RESET`) |

**Filter kelompok SP (`induk`) ditegakkan di server, bukan di komponen.**
`LotteryControlPage` memang menyaring salinan pool-nya sendiri untuk tampilan
(reel, hitungan chip, layar besar), tapi yang menentukan siapa boleh menang
adalah filter yang ikut terkirim ke `POST /lottery/draw`:
`services.drawLotteryWinner()` menghitung ulang pool **di dalam transaksi
Serializable** dengan filter yang sama. Pencocokannya lewat `spInduk()`,
**bukan `startsWith`** — sebagai prefix, `SP1` juga cocok dengan `SP10` dan
`SP12`, sehingga memilih SP1 saja akan diam-diam menyeret seluruh cabang
SP10-SP19 ikut terundi. Entri `induk` yang bentuknya salah **ditolak 422, bukan
dibuang diam-diam**: membuang satu-satunya entri dari `['SP1.2']` menyisakan
daftar kosong, dan daftar kosong berarti *semua kelompok* — panitia akan mengira
sudah mempersempit undian padahal justru melebarkannya.

`lotteryDrawDict`: `{ id, participant_id, full_name, nickname, sp_code, drawn_at, drawn_by_name, round_label }`
(`backend/src/serializers.ts`). **Tidak ada PII di sini** — tidak pernah ada
`whatsapp_number`, `email`, `birth_date`, `address`, `address_detail`,
`last_occupation`, atau `accommodation` di endpoint lottery manapun; field yang
diekspos persis sama dengan yang sudah publik lewat
`GET /api/participants/public`. Diregresi eksplisit di
`backend/src/routes/admin.test.ts` (`FORBIDDEN_PII`).

Catatan implementasi (`backend/src/services.ts`):

- Pemenang dipilih dengan `secureRandomInt()` (`backend/src/utils.ts`, wrapper
  `crypto.randomInt`) — **bukan `Math.random`**.
- `drawLotteryWinner()` menghitung ulang pool **di dalam** satu
  `prisma.$transaction` ber-isolation `Serializable` lalu me-retry sekali saat
  write conflict (P2034), supaya tombol undi yang diklik dobel tidak bisa
  menghasilkan pemenang ganda.
- `drawn_by_name` di-snapshot dari `req.committee.name` untuk akuntabilitas
  (bukan FK ke `Committee`).

Catatan sisi frontend: **hanya `LotteryControlPage` (`/admin/undian`) yang
memanggil kelima endpoint di atas.** Halaman layar besar
`LotteryPresentPage` (`/admin/undian/layar`) tidak pernah memanggil API undian
— ia hanya menampilkan state yang dikirim halaman kontrol lewat
`BroadcastChannel` (`src/lib/lotteryChannel.ts`), sehingga mustahil ada dua tab
yang meminta undian ke server secara bersamaan. Keduanya tetap di balik
`RequireAuth`.

### Committees — **`requireSuperAdmin`** di setiap route berikut

| Method + Path | Request body | Response shape | Error eksplisit | Frontend caller |
|---|---|---|---|---|
| `GET /api/admin/committees` | — | `committeeDict[]`, urut `createdAt asc` | — | `listCommittees()` |
| `POST /api/admin/committees` | `committeeCreateSchema`: `{ name: string, email: string, password: string, role?: 'super_admin'\|'committee' (default 'committee') }` | 201, `committeeDict` | 409 jika email sudah dipakai | `createCommittee()` |
| `PATCH /api/admin/committees/:id` | `committeeUpdateSchema` (semua optional): `{ name?, email?, role?, password? }` | `committeeDict` | 404 jika akun tak ditemukan; 409 jika email baru bentrok; **400** jika mendemosikan super_admin terakhir ("Minimal harus ada satu Super Admin.") | `updateCommittee()` |
| `POST /api/admin/committees/:id/toggle` | `committeeToggleSchema`: `{ is_active: boolean }` | `committeeDict` | 404 jika akun tak ditemukan | `setCommitteeActive()` |
| `DELETE /api/admin/committees/:id` | — | `{ id: string }` (bukan 204!) | 404 jika akun tak ditemukan; **400** jika menghapus satu-satunya super_admin | `deleteCommittee()` |

## Kontradiksi kode vs komentar (ditemukan saat verifikasi)

`src/lib/api.real.ts` baris ~8-9 (komentar header) menyatakan:
> "STATUS: KERANGKA ... Catatan khusus: `exportCsv` masih stub (lihat di bawah)."

**Ini tidak akurat.** Fungsi `exportCsv()` di file yang sama (baris ~232-246) sudah **full-implemented**: melakukan `fetch(GET /api/admin/export/csv)` dengan header `Authorization`, menangani error JSON, dan mengembalikan `res.text()`. Tidak ada bagian stub. Percayai kode, bukan komentar — komentar header ini sudah usang dan sebaiknya diperbarui/dihapus saat menyentuh file tersebut.
