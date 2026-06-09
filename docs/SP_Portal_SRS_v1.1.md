# SP Portal — Software Requirements Specification (SRS)
**Versi:** 1.1
**Proyek:** Soero Pramono Reunion Portal
**Tanggal:** Juni 2026
**Status:** Selaras dengan implementasi frontend v3.1
**Referensi PRD:** SP Portal PRD v3.1

> **Perubahan v1.0 → v1.1:** Model `Registrant` → `RegistrationSession` + `Participant`; tanpa Data Pendata; `last_occupation` & `accommodation` opsional; pencegahan duplikat dihapus; tanpa kuota; halaman & rute baru (Pengelompokan SP Induk, Detail Sesi).

---

## 1. Pendahuluan

### 1.1 Tujuan
SRS ini mendokumentasikan spesifikasi perangkat lunak SP Portal secara teknis dan fungsional — perilaku yang sudah diimplementasikan di frontend (React/TypeScript) maupun target backend (FastAPI). Menjadi acuan pengembangan, pengujian, dan migrasi mock → backend nyata.

### 1.2 Ruang Lingkup
- Portal publik untuk peserta mendaftar dan mengelola kehadiran (tanpa login, via token).
- Panel admin untuk panitia mengelola data, statistik, notifikasi, dan check-in.

### 1.3 Definisi
| Istilah | Definisi |
|---------|----------|
| Sesi | Satu transaksi pendaftaran (mengelompokkan beberapa peserta yang didaftarkan bersama) |
| Peserta | Individu yang didaftarkan untuk hadir |
| SP Induk | Level pertama kode SP, mis. `SP4` dari `SP4.1.3A` |
| Manage Token | Token unik untuk kelola mandiri tanpa login |
| Check-in Code | Kode human-readable `SP-XXXXXX` per sesi |
| Mock Layer | `src/lib/api.ts` — implementasi localStorage yang memetakan 1:1 ke backend |

### 1.4 Stack Teknologi
| Komponen | Teknologi |
|----------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Routing | React Router DOM v6 |
| QR Code | `qrcode.react` |
| Datepicker | `flowbite-datepicker` (field tanggal lahir) |
| Data Wilayah | `idn-area-data` (CSV) — autocomplete kecamatan domisili |
| Backend (target) | FastAPI (Python) |
| Mock Data Layer | `localStorage` via `src/lib/api.ts` |
| Auth | JWT-style session (mock: key `sp.session`) |

---

## 2. Arsitektur Sistem

### 2.1 Struktur Direktori Frontend
```
src/
├── App.tsx                       # Router + route guards
├── types.ts                      # Domain types (snake_case)
├── components/
│   ├── ui.tsx                    # UI primitives
│   ├── DatePicker.tsx            # Flowbite datepicker (tanggal lahir)
│   ├── RegionPicker.tsx          # autocomplete kecamatan (alamat domisili)
│   ├── PublicLayout.tsx
│   └── AdminLayout.tsx
├── lib/
│   ├── api.ts                    # Mock API layer (localStorage)
│   ├── auth.tsx                  # AuthContext + useAuth
│   ├── format.ts                 # normalizeWhatsApp, isValidSpCode, spInduk, compareSpCode, dll
│   └── constants.ts              # ACCOMMODATION_OPTIONS, SP_CODE_HINT, SP_CODE_EXAMPLES
└── pages/
    ├── public/  HomePage, RegisterPage, SuccessPage, ManagePage
    └── admin/   LoginPage, DashboardPage, SessionDetailPage, GroupingPage,
                 StatisticsPage, BroadcastPage, CheckinPage,
                 NotificationLogsPage, EventSettingsPage, CommitteesPage
```
> `RegistrantDetailPage.tsx` dipertahankan sebagai re-export tipis ke `SessionDetailPage` (kompatibilitas).

### 2.2 Peta Route
| Path | Komponen | Guard |
|------|----------|-------|
| `/` | `HomePage` | — |
| `/daftar` | `RegisterPage` | — |
| `/sukses/:token` | `SuccessPage` | — |
| `/kelola/:token` | `ManagePage` | — |
| `/admin/login` | `LoginPage` | — |
| `/admin` | `DashboardPage` | `RequireAuth` |
| `/admin/sesi/:id` | `SessionDetailPage` | `RequireAuth` |
| `/admin/pengelompokan` | `GroupingPage` | `RequireAuth` |
| `/admin/statistik` | `StatisticsPage` | `RequireAuth` |
| `/admin/broadcast` | `BroadcastPage` | `RequireAuth` |
| `/admin/checkin` | `CheckinPage` | `RequireAuth` |
| `/admin/notifikasi` | `NotificationLogsPage` | `RequireAuth` |
| `/admin/pengaturan` | `EventSettingsPage` | `RequireAuth` |
| `/admin/panitia` | `CommitteesPage` | `RequireAuth` + `RequireSuperAdmin` |
| `*` | Redirect ke `/` | — |

### 2.3 localStorage Keys (Mock Layer)
| Key | Tipe | Keterangan |
|-----|------|-----------|
| `sp.sessions` | `RegistrationSession[]` | Sesi pendaftaran |
| `sp.participants` | `Participant[]` | Seluruh peserta |
| `sp.committees` | `Committee[]` | Akun panitia |
| `sp.event_settings` | `EventSettings` | Pengaturan acara |
| `sp.notification_logs` | `NotificationLog[]` | Log notifikasi |
| `sp.session` | `Session \| null` | Sesi login aktif |
| `sp.passwords` | `Record<string,string>` | Password (mock plain-text) |
| `sp.seeded.v3_2` | `boolean` | Flag seed data awal |
| `sp.wilayah.kecamatan.v1` | `string[]` | Cache label kecamatan untuk `RegionPicker` |

---

## 3. Domain Types (`src/types.ts`)

```typescript
interface RegistrationSession {
  id: string;
  manage_token: string;
  privacy_consent: boolean;
  registered_at: string;          // ISO 8601
  updated_at: string | null;
}

interface Participant {
  id: string;
  session_id: string;
  full_name: string;              // wajib
  nickname: string;               // OPSIONAL (boleh "")
  sp_code: string;                // wajib (mis. SP4.1.3A)
  birth_date: string;             // wajib, ISO "YYYY-MM-DD" (Flowbite datepicker); umur dihitung
  address: string;                // wajib; region domisili: "Provinsi, Kab/Kota, Kecamatan" via RegionPicker (autocomplete idn-area-data)
  address_detail: string;         // OPSIONAL (boleh "") — alamat lengkap bebas: jalan, RT/RW, dll.
  last_occupation: string;        // OPSIONAL (boleh "")
  accommodation: string;          // OPSIONAL (boleh "")
  email: string | null;           // opsional
  whatsapp_number: string | null; // opsional, normalisasi 62…
  attendance_status: 'will_attend' | 'cancelled';
  is_checked_in: boolean;
  checked_in_at: string | null;
}

interface ParticipantInput {       // payload form
  full_name: string; nickname?: string; sp_code: string; birth_date: string; address: string; address_detail?: string;
  last_occupation?: string; accommodation?: string; email?: string; whatsapp_number?: string;
}

interface RegistrationInput {
  privacy_consent: boolean;
  participants: ParticipantInput[];
  website?: string;                // honeypot
}

interface SessionWithParticipants extends RegistrationSession { participants: Participant[]; }
interface ParticipantWithSession extends Participant { manage_token: string; registered_at: string; }

interface EventSettings {
  id: string; event_name: string; tagline: string; event_date: string; location: string; address: string;
  maps_query: string; registration_deadline: string | null; registration_open: boolean; updated_at: string;
}

interface RegistrationStatus {
  open: boolean; reason: 'open' | 'closed_manual' | 'past_deadline';
  message: string; total_sessions: number; total_people: number; deadline: string | null;
}

interface Stats {
  total_sessions: number; total_people: number; total_cancelled: number; total_checked_in: number;
  by_sp_induk: { induk: string; sessions: number; people: number }[];
  trend: { date: string; count: number }[];
}

interface NotificationLog {
  id: string; session_id: string | null;
  type: 'participant_confirmation' | 'committee_blast' | 'reminder';
  channel: 'whatsapp' | 'email'; status: 'sent' | 'failed' | 'dry_run';
  error_message: string | null; created_at: string;
}
```

> **Dihapus dari v1.0:** `Registrant`, `family_branch`, `group_size`, `group_details`, `max_capacity`, `DuplicateError`, dan field `registrar_*`.

---

## 4. Spesifikasi Fungsional — Area Publik

### 4.1 FR-PUB-01: Halaman Utama (`/`)
Menampilkan info acara (`getEventSettings`) + status (`getRegistrationStatus`), peta embed, jumlah pendaftaran masuk (`total_sessions`) & total peserta (`total_people`), serta tombol "Mulai Pendaftaran" (di bagian langkah pendaftaran) bila `open`. Field `tagline` ditampilkan sebagai teks sambutan di bawah nama acara pada hero section.

### 4.2 FR-PUB-02: Form Pendaftaran (`/daftar`)
**Guard:** jika tutup/deadline lewat → halaman "Pendaftaran Ditutup".

Form berisi **daftar peserta langsung** (tanpa Data Pendata) + satu checkbox persetujuan.

| Field peserta | Validasi |
|-------|----------|
| `full_name` | Wajib |
| `sp_code` | Wajib, `isValidSpCode()` (regex `^SP\d+(\.\d+)*A?$`, case-insensitive) |
| `birth_date` | Wajib; ISO `YYYY-MM-DD` via Flowbite datepicker (`<DatePicker>`); tidak boleh di masa depan; umur dihitung di sisi panitia |
| `address` | Wajib; dipilih via `<RegionPicker>` (autocomplete kecamatan nasional, idn-area-data); tersimpan sebagai gabungan "Provinsi, Kab/Kota, Kecamatan" |
| `last_occupation` | Opsional |
| `accommodation` | Opsional |
| `email` | Opsional; bila diisi `isValidEmail()` |
| `whatsapp_number` | Opsional; bila diisi `isValidWhatsApp()` |
| `privacy_consent` | Wajib `true` (level pendaftaran) |
| `website` | Honeypot — harus kosong |

**Alur submit:** validasi client → scroll ke error pertama → `submitRegistration(input)` → sukses redirect `/sukses/:manage_token`. `RegistrationClosedError` → pesan error. **Tidak ada `DuplicateError`.**

**Side effects (mock):** log 4 notifikasi per sesi (`committee_blast` WA+email, `participant_confirmation` WA+email).

### 4.3 FR-PUB-03: Normalisasi WhatsApp
Sama seperti v1.0. Berlaku saat peserta mengisi WA. Validasi `^62\d{8,13}$`.

### 4.4 FR-PUB-04: Halaman Sukses (`/sukses/:token`)
Kode check-in sesi `shortCode(session)` = `SP-XXXXXX` + QR; daftar peserta + kode SP; detail acara; URL kelola + tombol salin. Sapaan memakai nama peserta pertama.

### 4.5 FR-PUB-05: Kelola Mandiri (`/kelola/:token`)
Akses via token. Fitur: edit tiap peserta, tambah/hapus peserta, batalkan kehadiran seluruh sesi (semua peserta → `cancelled`). Validasi sama dengan form daftar. Side effect: log `committee_blast` (WA) saat update/cancel.

---

## 5. Spesifikasi Fungsional — Area Admin

### 5.1 FR-ADM-01: Autentikasi
Login email+password, role `super_admin`/`committee`, guard `RequireAuth` & `RequireSuperAdmin`.

### 5.2 FR-ADM-02: Dashboard (`/admin`)
Stat cards: Sesi Terdaftar, Total Peserta, Sudah Check-in, Sesi Dibatalkan. Daftar sesi: perwakilan (peserta pertama), jumlah peserta, SP Induk (badge), kontak perwakilan, status, terdaftar. Pencarian (nama peserta/kode SP/WA), filter SP Induk & status. Ekspor CSV.

### 5.3 FR-ADM-03: Detail Sesi (`/admin/sesi/:id`)
Info sesi (read-only) + daftar peserta. Per peserta: edit (modal), toggle check-in, toggle status, hapus. Tambah peserta. Hapus seluruh sesi. QR + kode check-in sesi.

### 5.4 FR-ADM-04: Pengelompokan per SP Induk (`/admin/pengelompokan`)
Grup per SP Induk (`getGroupedBySpInduk`). Expand/collapse, urut kode SP, kolom: Nama, Kode SP, Alamat, Umur/Tgl Lahir, Pekerjaan, Menginap, Email, WA. Ekspor per induk & ekspor semua. Filter hanya `will_attend` (default) atau semua.

### 5.5 FR-ADM-05: Statistik (`/admin/statistik`)
Stat cards + bar per SP Induk (`people`, `sessions`) + tren harian (per sesi). Ekspor CSV.

### 5.6 FR-ADM-06: Broadcast (`/admin/broadcast`)
Segmentasi: SP Induk / semua, `onlyAttending`, channel WA/email. Template H-7/H-1/Hari-H. Satu pesan per sesi. ~6% gagal (simulasi).

### 5.7 FR-ADM-07: Log Notifikasi (`/admin/notifikasi`)
Riwayat + retry (80% sukses simulasi).

### 5.8 FR-ADM-08: Check-in (`/admin/checkin`)
Cari peserta by nama/kode SP/kode check-in. Toggle `is_checked_in` per peserta.

### 5.9 FR-ADM-09: Pengaturan Acara (`/admin/pengaturan`)
Edit nama/tanggal/lokasi/alamat/maps_query/deadline, toggle buka-tutup. Tanpa kuota.

### 5.10 FR-ADM-10: Akun Panitia (`/admin/panitia`, super-admin)
List, tambah, aktif/nonaktif committee.

---

## 6. Non-Fungsional
- **NFR-01 Mobile-first & aksesibilitas:** usable di 375px; `inputMode`/`aria-invalid`/`autoComplete`; scroll ke error; loading state.
- **NFR-02 Bahasa:** seluruh UI Bahasa Indonesia; tanggal `id-ID`.
- **NFR-03 Performa:** delay mock 350ms; `useMemo` untuk filter dashboard.
- **NFR-04 Keamanan (target):** hash password, JWT expiry+verify, validasi honeypot di backend, manage token entropi ≥24 char.
- **NFR-05 Notifikasi:** fire-and-forget; kegagalan tidak membatalkan pendaftaran; semua percobaan dicatat.

---

## 7. API Contract (Mock → Backend)

### Public
| Fungsi Mock | Endpoint | Method |
|-------------|----------|--------|
| `getEventSettings()` | `/api/event` | GET |
| `getRegistrationStatus()` | `/api/event/status` | GET |
| `submitRegistration(input)` | `/api/registrations` | POST |
| `getSessionByToken(token)` | `/api/registrations/token/{token}` | GET |
| `updateSessionByToken(token, patch)` | `/api/registrations/token/{token}` | PATCH |
| `cancelRegistrationByToken(token)` | `/api/registrations/token/{token}/cancel` | POST |

### Admin (JWT)
| Fungsi Mock | Endpoint | Method |
|-------------|----------|--------|
| `login` / `logout` | `/api/auth/login` · `/api/auth/logout` | POST |
| `listSessions()` | `/api/admin/sessions` | GET |
| `getSessionById(id)` | `/api/admin/sessions/{id}` | GET |
| `deleteSession(id)` | `/api/admin/sessions/{id}` | DELETE |
| `addParticipant(session_id, input)` | `/api/admin/sessions/{id}/participants` | POST |
| `updateParticipant(id, patch)` | `/api/admin/participants/{id}` | PATCH |
| `deleteParticipant(id)` | `/api/admin/participants/{id}` | DELETE |
| `checkInParticipant(id, value)` | `/api/admin/participants/{id}/checkin` | POST |
| `setParticipantStatus(id, status)` | `/api/admin/participants/{id}/status` | POST |
| `findForCheckIn(q)` | `/api/admin/checkin?q=` | GET |
| `getGroupedBySpInduk(opts)` | `/api/admin/grouping` | GET |
| `listSpInduk()` | `/api/admin/sp-induk` | GET |
| `getStats()` | `/api/admin/stats` | GET |
| `exportCsv(opts)` | `/api/admin/export/csv` | GET |
| `broadcastReminder(opts)` | `/api/admin/notifications/broadcast` | POST |
| `listLogs()` / `retryLog(id)` | `/api/admin/notifications/logs` · `/{id}/retry` | GET · POST |
| `updateEventSettings(patch)` | `/api/admin/event` | PATCH |
| `listCommittees` / `createCommittee` / `setCommitteeActive` | `/api/admin/committees…` | GET/POST |

---

## 8. Seed Data (Development)
Seed otomatis saat `sp.seeded.v3_2` kosong. Akun default `admin@spportal.id` / `admin123` (super_admin). 6 sesi contoh (≈13 peserta) lintas SP1–SP4; 1 sesi dibatalkan; beberapa sudah check-in. Reset: `localStorage.clear()`.

## 9. Rencana Migrasi ke Backend
Pertahankan `src/types.ts`; ganti isi `src/lib/api.ts` dengan `fetch(import.meta.env.VITE_API_URL + ...)` mengembalikan shape identik; `RegistrationClosedError` dipetakan ke status HTTP khusus (mis. 423/409).
