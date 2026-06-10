# SP Portal — System Design Document (SDD)
**Versi:** 1.1
**Proyek:** Soero Pramono Reunion Portal
**Tanggal:** 10 Juni 2026
**Referensi:** PRD v3.2, SRS v1.2, IMPROVEMENT_PLAN.md
**Status:** Acuan desain untuk migrasi mock (localStorage) → backend nyata (FastAPI + PostgreSQL)

> **Perubahan v1.0 → v1.1:** Endpoint publik `/api/participants/public` + proyeksi `PublicParticipant` (halaman `/peserta`); perbaikan desain check-in (limit query kosong, check-in per sesi, hitungan hadir global).

---

## 1. Ikhtisar & Tujuan

SDD ini menjabarkan arsitektur teknis SP Portal: lapisan sistem, desain basis data, kontrak API, dan struktur backend. Tujuannya menjadi cetak biru implementasi backend FastAPI yang menggantikan mock `localStorage` tanpa mengubah kontrak yang sudah dipakai frontend.

**Prinsip desain:**
1. **Kontrak stabil** — bentuk request/response identik dengan mock `src/lib/api.ts`, sehingga frontend cukup mengganti base URL.
2. **Pemisahan tegas** — Session (wadah) vs Participant (individu). Tidak ada identitas "pendata".
3. **Mobile-first & ringan** — payload kecil, endpoint sederhana.
4. **Aman secara bawaan** — hash password, JWT, validasi server-side, honeypot.
5. **Notifikasi non-blocking** — fire-and-forget, di-log, bisa retry.

---

## 2. Arsitektur Sistem

### 2.1 Diagram Lapisan

```
┌─────────────────────────────────────────────────────────────┐
│                        KLIEN (Browser)                       │
│   React 18 + TS + Vite + Tailwind  ·  React Router v6        │
│   Pages ──► src/lib/api.ts (HTTP client)  ──► JWT di header  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / JSON (CORS)
┌───────────────────────────▼─────────────────────────────────┐
│                     API GATEWAY / FastAPI                    │
│  Routers ─► Dependencies (auth, db) ─► Services ─► Repos     │
│  Pydantic schemas (validasi)  ·  OAuth2/JWT  ·  rate limit   │
└───────────┬───────────────────────────────┬─────────────────┘
            │                               │ async tasks
┌───────────▼───────────┐        ┌──────────▼─────────────────┐
│   PostgreSQL          │        │  Notification Workers       │
│  sessions, participants│       │  WhatsApp Gateway (Fonnte/  │
│  committees, event,    │       │  Wablas)  ·  Email (SMTP)   │
│  notification_logs     │        └────────────────────────────┘
└────────────────────────┘
```

### 2.2 Aliran Data Utama

**Pendaftaran (publik):**
```
RegisterPage → POST /api/registrations
  → validasi Pydantic + honeypot
  → buat RegistrationSession + Participant[] (transaksi DB)
  → enqueue notifikasi (committee_blast + participant_confirmation)
  → 201 { session + participants }
```

**Check-in (admin):**
```
CheckinPage → GET /api/admin/checkin?q=... (JWT)   [q kosong → limit 50]
  → POST /api/admin/participants/{id}/checkin
  → update is_checked_in + checked_in_at → 200 participant
  → q cocok shortCode sesi → POST /api/admin/sessions/{id}/checkin-all (v1.1)
```

**Peserta publik (v1.1):**
```
ParticipantsPage (/peserta) → GET /api/participants/public
  → filter will_attend → proyeksi minimal (nama, panggilan, kode SP, WA, email)
  → group by sp_induk, urut compareSpCode → 200 PublicSpIndukGroup[]
```

### 2.3 Strategi Migrasi Mock → Nyata
- Setiap fungsi di `src/lib/api.ts` = satu endpoint (lihat §4).
- Ganti body fungsi: `localStorage` → `fetch(import.meta.env.VITE_API_URL + path, { headers: authHeader })`.
- Bentuk JSON keluaran **harus identik** dengan tipe di `src/types.ts`.
- `RegistrationClosedError` dipetakan dari HTTP `423 Locked` (atau `409`).
- Tambahkan `.env.production` → `VITE_API_URL`.

---

## 3. Desain Basis Data (PostgreSQL)

### 3.1 ERD (ringkas)
```
event_settings (1) ─ konfigurasi tunggal
committees (N) ─ akun panitia

registration_sessions (1) ──< participants (N)
registration_sessions (1) ──< notification_logs (N)   [session_id nullable]
```

### 3.2 DDL

```sql
CREATE TYPE attendance_status AS ENUM ('will_attend', 'cancelled');
CREATE TYPE committee_role   AS ENUM ('super_admin', 'committee');
CREATE TYPE notif_type       AS ENUM ('participant_confirmation','committee_blast','reminder');
CREATE TYPE notif_channel    AS ENUM ('whatsapp','email');
CREATE TYPE notif_status     AS ENUM ('sent','failed','dry_run');

CREATE TABLE registration_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manage_token    VARCHAR(48) NOT NULL UNIQUE,
  privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE TABLE participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES registration_sessions(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  sp_code           VARCHAR(64) NOT NULL,          -- disimpan UPPERCASE; regex ^SP\d+(\.\d+)*A?$
  sp_induk          VARCHAR(16) NOT NULL,          -- token pertama, mis. 'SP4' (didenormalisasi utk query cepat)
  birth_date        DATE NOT NULL,                 -- ISO; umur = age(birth_date) dihitung, tidak disimpan
  address           TEXT NOT NULL,                -- gabungan wilayah "Provinsi, Kab/Kota, Kecamatan" (pencarian kecamatan di frontend)
  last_occupation   TEXT NOT NULL DEFAULT '',      -- opsional
  accommodation     TEXT NOT NULL DEFAULT '',      -- opsional
  email             CITEXT,                        -- opsional
  whatsapp_number   VARCHAR(20),                   -- opsional, normalisasi 62…
  attendance_status attendance_status NOT NULL DEFAULT 'will_attend',
  is_checked_in     BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at     TIMESTAMPTZ
);
CREATE INDEX idx_participants_session ON participants(session_id);
CREATE INDEX idx_participants_induk   ON participants(sp_induk);
CREATE INDEX idx_participants_status  ON participants(attendance_status);
CREATE INDEX idx_participants_name_trgm ON participants USING gin (full_name gin_trgm_ops);

CREATE TABLE committees (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                     -- bcrypt/argon2
  role       committee_role NOT NULL DEFAULT 'committee',
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name            TEXT NOT NULL,
  event_date            TIMESTAMPTZ NOT NULL,
  location              TEXT NOT NULL,
  address               TEXT NOT NULL,
  maps_query            TEXT NOT NULL,
  registration_deadline TIMESTAMPTZ,               -- null = tanpa batas
  registration_open     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES registration_sessions(id) ON DELETE SET NULL,
  type          notif_type NOT NULL,
  channel       notif_channel NOT NULL,
  status        notif_status NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_status ON notification_logs(status);
```

### 3.3 Catatan Desain Skema
- **`sp_induk` didenormalisasi** dari `sp_code` saat insert/update untuk mempercepat filter & pengelompokan (FR-ADM-04/05). Dijaga konsisten oleh service layer atau trigger.
- **`ON DELETE CASCADE`** pada `participants` → hapus sesi menghapus pesertanya (FR-ADM-03).
- **Tanpa pencegahan duplikat** (PRD B9): tidak ada unique constraint pada kontak peserta.
- **`manage_token` unik** + entropi ≥ 24 char (NFR-04).
- Ekstensi: `pgcrypto` (gen_random_uuid), `citext` (email case-insensitive), `pg_trgm` (pencarian nama).

---

## 4. Desain API (REST)

### 4.1 Konvensi
- Base path `/api`. JSON `snake_case`. Waktu ISO-8601 UTC.
- Auth admin: `Authorization: Bearer <jwt>`.
- Error seragam: `{ "detail": "<pesan>", "code": "<machine_code>" }`.

### 4.2 Kode Status
| Kode | Makna |
|------|-------|
| 200 | OK |
| 201 | Created (pendaftaran/peserta) |
| 400 | Validasi gagal |
| 401 | Tidak terautentikasi |
| 403 | Tidak berwenang (role) |
| 404 | Tidak ditemukan |
| 423 | Pendaftaran ditutup (`RegistrationClosedError`) |

### 4.3 Endpoint Publik

**POST `/api/registrations`** — buat sesi + peserta.
```jsonc
// Request
{
  "privacy_consent": true,
  "website": "",                       // honeypot (harus kosong)
  "participants": [
    { "full_name": "Yoso Pramono", "sp_code": "SP4", "birth_date": "1958-05-05",
      "address": "Jawa Barat, Kabupaten Bandung, Kertasari", "last_occupation": "Guru",
      "accommodation": "Hotel / Penginapan", "email": null, "whatsapp_number": "08120000001" }
  ]
}
// 201 Response → SessionWithParticipants
{ "id": "…", "manage_token": "…", "privacy_consent": true,
  "registered_at": "2026-06-08T…Z", "updated_at": null,
  "participants": [ { "id":"…","sp_code":"SP4","attendance_status":"will_attend", … } ] }
// 423 → { "detail": "Maaf, batas waktu pendaftaran telah berakhir.", "code": "registration_closed" }
```

| Method | Path | Fungsi mock | Auth |
|--------|------|-------------|------|
| GET | `/api/event` | `getEventSettings` | — |
| GET | `/api/event/status` | `getRegistrationStatus` | — |
| POST | `/api/registrations` | `submitRegistration` | — |
| GET | `/api/registrations/token/{token}` | `getSessionByToken` | — |
| PATCH | `/api/registrations/token/{token}` | `updateSessionByToken` | — |
| POST | `/api/registrations/token/{token}/cancel` | `cancelRegistrationByToken` | — |
| GET | `/api/participants/public` | `getPublicParticipants` *(v1.1)* | — |

**GET `/api/participants/public`** *(v1.1)* — daftar peserta untuk halaman publik `/peserta`.
```jsonc
// 200 Response → PublicSpIndukGroup[]
[
  { "induk": "SP4",
    "participants": [
      { "full_name": "Yoso Pramono", "nickname": "", "sp_code": "SP4",
        "whatsapp_number": "6281200000001", "email": null }
    ] }
]
// Aturan server: hanya will_attend; TANPA manage_token/session_id/alamat/tanggal lahir;
// urut compareSpCode; respons boleh di-cache singkat (mis. 60 dtk).
```

> PATCH by token menerima `{ participants: [{ id?, … }] }`: id ada → update; tanpa id → tambah; peserta lama yang tidak disertakan → dihapus.

### 4.4 Endpoint Admin (JWT)

| Method | Path | Fungsi mock |
|--------|------|-------------|
| POST | `/api/auth/login` | `login` |
| POST | `/api/auth/logout` | `logout` |
| GET | `/api/admin/sessions` | `listSessions` |
| GET | `/api/admin/sessions/{id}` | `getSessionById` |
| DELETE | `/api/admin/sessions/{id}` | `deleteSession` |
| POST | `/api/admin/sessions/{id}/participants` | `addParticipant` |
| PATCH | `/api/admin/participants/{id}` | `updateParticipant` |
| DELETE | `/api/admin/participants/{id}` | `deleteParticipant` |
| POST | `/api/admin/participants/{id}/checkin` | `checkInParticipant` |
| POST | `/api/admin/participants/{id}/status` | `setParticipantStatus` |
| GET | `/api/admin/checkin?q=&limit=50` | `findForCheckIn` *(limit v1.1)* |
| POST | `/api/admin/sessions/{id}/checkin-all` | `checkInSession` *(baru v1.1)* |
| GET | `/api/admin/grouping?only_attending=` | `getGroupedBySpInduk` |
| GET | `/api/admin/sp-induk` | `listSpInduk` |
| GET | `/api/admin/stats` | `getStats` |
| GET | `/api/admin/export/csv?induk=` | `exportCsv` |
| POST | `/api/admin/notifications/broadcast` | `broadcastReminder` |
| GET | `/api/admin/notifications/logs` | `listLogs` |
| POST | `/api/admin/notifications/logs/{id}/retry` | `retryLog` |
| PATCH | `/api/admin/event` | `updateEventSettings` |
| GET/POST | `/api/admin/committees` | `listCommittees` / `createCommittee` |
| POST | `/api/admin/committees/{id}/toggle` | `setCommitteeActive` |

### 4.5 Autentikasi
- `POST /api/auth/login` → verifikasi `password_hash` (bcrypt) → terbitkan JWT `{ sub: committee_id, role, exp }` (mis. 12 jam).
- Middleware/Dependency `get_current_committee` memvalidasi signature + expiry + `is_active`.
- `RequireSuperAdmin` memeriksa `role == super_admin` untuk endpoint committee.

---

## 5. Struktur Backend (FastAPI)

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, router include, exception handlers
│   ├── core/
│   │   ├── config.py           # Settings (pydantic-settings): DB URL, JWT secret, gateway keys
│   │   ├── security.py         # hash/verify password, create/decode JWT
│   │   └── deps.py             # get_db, get_current_committee, require_super_admin
│   ├── db/
│   │   ├── base.py             # SQLAlchemy Base + session factory
│   │   └── models.py           # ORM: Session, Participant, Committee, EventSettings, NotificationLog
│   ├── schemas/                # Pydantic: registration.py, participant.py, event.py, auth.py, stats.py
│   ├── routers/
│   │   ├── public.py           # /api/event, /api/registrations…
│   │   ├── auth.py             # /api/auth…
│   │   ├── admin_sessions.py   # /api/admin/sessions, participants…
│   │   ├── admin_reports.py    # /api/admin/stats, grouping, export
│   │   ├── admin_notify.py     # /api/admin/notifications…
│   │   └── admin_committees.py # /api/admin/committees…
│   ├── services/
│   │   ├── registration.py     # buat sesi+peserta, sp_induk, status pendaftaran
│   │   ├── grouping.py         # pengelompokan & statistik SP Induk
│   │   ├── csv_export.py       # CSV UTF-8 BOM
│   │   └── notifications.py    # enqueue + kirim (WA/email) + log + retry
│   └── workers/
│       ├── whatsapp.py         # adapter gateway (Fonnte/Wablas)
│       └── email.py            # SMTP/transactional
├── alembic/                    # migrasi DB
├── tests/                      # pytest (unit + API)
├── .env.example
└── pyproject.toml
```

### 5.1 Tanggung Jawab Modul
- **services/registration.py** — logika `sp_induk` (token pertama), validasi format SP, status buka/tutup berdasarkan `event_settings`, transaksi sesi+peserta.
- **services/notifications.py** — dipanggil setelah commit pendaftaran (BackgroundTasks/queue); menulis `notification_logs`; tidak memblok response.
- **workers/** — adapter pluggable; gampang diganti gateway.
- **core/security.py** — argon2/bcrypt + JWT (PyJWT).

### 5.2 Helper Kode SP (paritas frontend `format.ts`)
```python
SP_RE = re.compile(r'^SP\d+(\.\d+)*A?$', re.IGNORECASE)
def normalize_sp(code: str) -> str: return re.sub(r'\s+', '', code).upper()
def is_valid_sp(code: str) -> bool: return bool(SP_RE.match(normalize_sp(code)))
def sp_induk(code: str) -> str:
    m = re.match(r'^SP\d+', normalize_sp(code)); return m.group(0) if m else '—'
```

---

## 6. Aspek Non-Fungsional

| Area | Keputusan |
|------|-----------|
| **Keamanan** | Password argon2/bcrypt; JWT exp+signature; honeypot divalidasi server; CORS terbatas ke domain frontend; rate-limit endpoint publik POST. |
| **Performa** | Index pada `session_id`, `sp_induk`, `attendance_status`; `pg_trgm` untuk pencarian nama; pagination pada list admin bila data besar. |
| **Observability** | Structured logging; `notification_logs` sebagai audit; health-check `/api/health`. |
| **Deploy** | Backend kontainer (Uvicorn/Gunicorn); PostgreSQL terkelola; frontend static (Vite build) di CDN/Nginx; HTTPS wajib. |
| **Config (env)** | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_MIN`, `WA_GATEWAY_KEY`, `SMTP_*`, `FRONTEND_ORIGIN`. |
| **Backup** | Snapshot DB harian; migrasi via Alembic. |

---

## 7. Risiko & Mitigasi
| Risiko | Mitigasi |
|--------|----------|
| Kode SP tidak konsisten (huruf/spasi) | Normalisasi server + regex; `sp_induk` dihitung backend, bukan input |
| Tanpa cegah duplikat → entri ganda | Sesuai PRD v3.1; sediakan tools admin (hapus peserta/sesi) + pencarian |
| Gateway WA/email gagal | Fire-and-forget + log + retry; kegagalan tak membatalkan pendaftaran |
| Token kelola bocor | Entropi tinggi, tanpa data sensitif kritis, bisa di-rotate bila perlu |
| Kontak WA tampil penuh di `/peserta` → scraping (v1.1) | Keputusan pemilik proyek (PRD §4.5); endpoint hanya memuat proyeksi minimal; mitigasi opsional: rate-limit, masking, atau tombol "tampilkan kontak" |
```
