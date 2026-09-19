# Glossary — SP Portal

> **Untuk AI coding agent.** Istilah domain yang wajib dipahami sebelum
> menyentuh kode. Setiap istilah diverifikasi terhadap kode sumber atau
> `docs/README.md` (keputusan produk), bukan diasumsikan dari nama.

## SP Code, SP Induk, suffix "A"

**SP Code** adalah identitas silsilah wajib per peserta. Format persis
(`SP_CODE_RE`, terduplikasi identik di `src/lib/format.ts` dan
`backend/src/utils.ts`):

```
/^SP\d+(\.\d+)*A?$/
```

— diawali `SP`, diikuti satu atau lebih segmen angka dipisah titik
(`SP4`, `SP4.1`, `SP4.1.3`), opsional diakhiri huruf `A` yang menandai
**pasangan (istri/suami)** dari pemegang kode induknya (`SP4A` = pasangan
dari `SP4`). Disimpan selalu **UPPERCASE tanpa spasi** via `normalizeSpCode()`.
Contoh valid: `SP4`, `SP4A`, `SP4.1`, `SP4.1.3A`.

**SP Induk** = token pertama dari SP Code, dihitung oleh `spInduk()`:
`"SP4.1.3A"` → `"SP4"`. Dipakai untuk mengelompokkan peserta per cabang
keluarga (`GET /api/admin/sp-induk`, `GET /api/admin/participants/grouped`,
halaman publik `/peserta`). Lihat pemetaan file di
[ARCHITECTURE.md → Where does X live](ARCHITECTURE.md#where-does-x-live).

## 4 pengidentifikasi yang sering tertukar

| Identifier | Bentuk | Dipegang oleh | Fungsi |
|---|---|---|---|
| **`manage_token`** | string 24 karakter alfanumerik acak (`genToken()`, `crypto.randomInt` — bukan `Math.random`) | Kolom `RegistrationSession.manageToken`, unik | **Capability token** — siapa pun yang memegang string ini bisa GET/PATCH/cancel sesi tanpa login (`/api/registrations/token/:token`). Jangan pernah di-log atau dikirim ke pihak ketiga (lihat CLAUDE.md). |
| **Short code (`SP-XXXXXX`)** | `'SP-' + manageToken.slice(0,6).toUpperCase()` — dihitung oleh `shortCode()` (`backend/src/utils.ts`), **bukan** kolom DB tersendiri | Diturunkan on-the-fly dari `manage_token` | Kode pendek yang ditunjukkan/discan di meja check-in (lebih pendek dari token penuh); dicari lewat `GET /api/admin/checkin/search?q=`. |
| **Session id** | UUID v4 (`uid()`) | Primary key `RegistrationSession.id` | Identitas internal sesi pendaftaran; dipakai di URL admin (`/api/admin/sessions/:id`) dan sebagai FK `Participant.sessionId`. Tidak pernah diekspos ke alur publik selain lewat `manage_token`. |
| **Participant id** | UUID v4 (`uid()`) | Primary key `Participant.id` | Identitas satu baris peserta individual; dipakai di `PATCH/DELETE /api/admin/participants/:id`, checkin, status. Satu sesi bisa punya banyak participant id. |

Aturan cepat: **URL publik pakai `manage_token`**, **URL admin pakai
`session id` / `participant id`**, dan **`SP-XXXXXX` hanya untuk pencarian
manusia di meja check-in**, bukan primary key apa pun.

## RegistrationSession vs Participant

Satu `RegistrationSession` = satu pendaftaran = **banyak** `Participant`
(relasi 1-ke-n, `Participant.sessionId` FK dengan `onDelete: Cascade`).
**Tidak ada entitas "pendata" terpisah** — keputusan produk v3.1: peserta
diinput langsung 1..n dalam satu sesi, satu token kelola + satu kode/QR
check-in **per sesi** (bukan per peserta). Lihat `docs/README.md` bagian
"Ringkasan keputusan produk" untuk konteks historis (dokumen produk formal,
jangan diedit — hanya rujukan).

Implikasi teknis: menambah/menghapus peserta dalam satu sesi via
`PATCH /api/registrations/token/:token` **tidak** membuat/menghapus sesi baru
— sesi tetap sama, hanya baris `Participant` yang berubah (lihat logic
diffing di [ARCHITECTURE.md alur b](ARCHITECTURE.md#b-kelola-mandiri-via-token-managepage--bagian-paling-kompleks-di-repo)).

## `attendance_status`

Enum dua nilai saja (`statusInputSchema`, `participantPatchSchema` di
`backend/src/schemas.ts`):

- `'will_attend'` — default saat peserta dibuat (`buildParticipantData()`),
  dihitung ke `total_people`/`total_sessions` di stats & status pendaftaran.
- `'cancelled'` — diset lewat cancel-by-token (semua peserta di sesi
  sekaligus) atau admin `POST /api/admin/participants/:id/status` (per
  peserta). **Bukan penghapusan** — baris tetap ada di DB, hanya
  disembunyikan dari daftar publik (`publicParticipants()`) dan check-in
  search (`findForCheckin()` mengecualikan `cancelled`).

Tidak ada nilai lain (tidak ada `pending`, `no_show`, dsb.) — jangan
mengasumsikan enum lebih besar dari ini.

## `NotificationLog.status`

Tiga nilai: `'sent' | 'failed' | 'dry_run'`.

- **`dry_run` BUKAN error/kegagalan** — ini adalah **mode normal** saat
  `NOTIFICATIONS_ENABLED=false` (default; lihat `backend/src/config.ts`).
  Berarti sistem mencatat niat mengirim notifikasi tanpa benar-benar
  mengirim WA/Email nyata (`logNotification()` di `backend/src/services.ts`).
- `sent` hanya muncul jika `NOTIFICATIONS_ENABLED=true` — tapi perlu dicatat
  **belum ada implementasi gateway WA/Email nyata** di balik flag ini per
  kode saat ini ditulis; membalik flag hanya mengubah string status, bukan
  benar-benar mengirim pesan.
- `failed` didefinisikan di skema tapi tidak pernah di-set oleh kode saat
  ini (tidak ada path yang menghasilkan status ini — semua `logNotification()`
  call menghasilkan `sent` atau `dry_run` saja).

## DEMO_MODE vs REAL_MODE

Dikontrol `src/lib/mode.ts` via env `VITE_DEMO_MODE` (dibaca **saat build**,
bukan runtime):

- **DEMO** (default; `VITE_DEMO_MODE` kosong atau bukan `"false"`) →
  `src/lib/api.mock.ts`, data contoh disimpan di `localStorage` browser,
  jalan tanpa backend sama sekali.
- **REAL** (`VITE_DEMO_MODE=false`) → `src/lib/api.real.ts`, fetch ke
  backend Express via `VITE_API_URL` (default `http://localhost:8000`).

**Data kedua mode terpisah total dan tidak pernah sinkron** — mengubah data
di mode DEMO (localStorage) tidak memengaruhi database PostgreSQL mode REAL,
dan sebaliknya. Ini disengaja: DEMO ada supaya build portofolio publik tidak
pernah menyentuh data keluarga asli (lihat CLAUDE.md).

## Committee role: `super_admin` vs `committee`

Kolom `Committee.role`, dua nilai (`committeeCreateSchema`,
`committeeUpdateSchema`). Perbedaan hak akses — endpoint yang memakai
middleware `requireSuperAdmin` (persis dari `backend/src/routes/admin.ts`,
di-chain **setelah** `requireCommittee`):

- `GET /api/admin/committees`
- `POST /api/admin/committees`
- `PATCH /api/admin/committees/:id`
- `POST /api/admin/committees/:id/toggle`
- `DELETE /api/admin/committees/:id`

Semua endpoint lain (sessions, participants, checkin, sp-induk, stats,
export, notifications, event settings) hanya butuh `requireCommittee` —
role `committee` biasa sudah cukup.

Proteksi tambahan khusus super_admin (dicek di handler, bukan middleware):
tidak boleh mendemosikan (`PATCH .../:id` ubah role) atau menghapus
(`DELETE .../:id`) super_admin **terakhir** — dicegah dengan menghitung
`otherSupers` sebelum aksi, melempar `400` jika hasilnya nol. Ini mencegah
lockout total dari panel admin.

## Pool undian

Kumpulan peserta yang masih **berhak** diundi pada
`GET /api/admin/lottery/pool` (`services.getLotteryPool()`). Dua syarat, dan
hanya dua:

1. `attendance_status === 'will_attend'` — peserta yang sudah membatalkan
   kehadiran tidak ikut diundi.
2. `Participant.id`-nya belum pernah muncul di tabel `lottery_draws`
   (anti-join) — sekali menang, keluar dari pool.

Yang **tidak** memengaruhi pool: status check-in (`is_checked_in`) sengaja
diabaikan, jadi peserta yang belum sempat check-in tetap bisa menang. Tidak ada
**pembobotan** per SP Induk — tiap `Participant` adalah satu entri independen,
termasuk pasangan ber-suffix `A` (lihat "SP Code, SP Induk, suffix A" di atas),
sehingga kelompok besar tidak "dikecilkan" dan kelompok kecil tidak dinaikkan
peluangnya.

**Filter kelompok SP** (`induk` pada `POST /api/admin/lottery/draw`) adalah
syarat ketiga yang bersifat **opsional dan per undian**: panitia mencentang SP
Induk mana saja yang ikut babak ini, mis. `['SP1','SP2','SP3']`. Aturan yang
gampang terbalik: **daftar kosong berarti SELURUH kelompok ikut**, bukan tidak
ada satu pun — itulah sebabnya halaman kontrol tidak mengizinkan seluruh
centang dilepas, dan entri yang bentuknya salah ditolak (422) alih-alih dibuang.
Pencocokan memakai `spInduk()` dan **bukan** `startsWith`: sebagai prefix `SP1`
juga cocok dengan `SP10`/`SP12`. Filter ini hanya membatasi siapa yang bisa
terundi pada babak itu — peserta kelompok lain tetap utuh di pool dan tidak
"terpakai".

Peserta **kembali** ke pool lewat tiga jalan, dan semuanya *soft void* —
barisnya ditandai, tidak dihapus: `POST /lottery/undo` (membatalkan seluruh
undian terakhir), `POST /lottery/winners/:id/void` (membatalkan satu pemenang
tertentu), atau `POST /lottery/reset` (mengosongkan seluruh daftar pemenang,
permanen). Menghapus `Participant`-nya justru **tidak** mengembalikannya —
baris `lottery_draws` menyimpan snapshot nama/kode SP dan `participant_id`-nya
hanya soft reference, sehingga riwayat pemenang tetap utuh.
