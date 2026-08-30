# Architecture — SP Portal

> **Untuk AI coding agent.** Peta struktural + 5 alur inti, diverifikasi dari
> kode (bukan reka-reka urutan). Untuk kontrak field per endpoint, lihat
> [API_REFERENCE.md](API_REFERENCE.md). Untuk istilah domain, lihat
> [GLOSSARY.md](GLOSSARY.md).

## Diagram tingkat tinggi

```mermaid
flowchart TD
    Browser["Browser"] --> React["React app (src/)"]
    React --> ApiSwitch["src/lib/api.ts\n(switch transparan berdasar mode.ts)"]
    ApiSwitch -->|"VITE_DEMO_MODE=true (default)"| Mock["src/lib/api.mock.ts"]
    Mock --> LS["localStorage\n(data contoh, tidak pernah sinkron ke server)"]
    ApiSwitch -->|"VITE_DEMO_MODE=false"| Real["src/lib/api.real.ts\nfetch(VITE_API_URL + path)"]
    Real --> App["backend/src/app.ts\n(Express: helmet, cors, express.json)"]
    App --> Routes["routes/{public,auth,admin}.ts"]
    Routes --> Services["services.ts (logika bisnis)"]
    Routes --> Serializers["serializers.ts (camelCase -> snake_case)"]
    Services --> Prisma["Prisma Client (db.ts)"]
    Prisma --> PG[("PostgreSQL")]
```

Komponen React **tidak boleh** mengimpor langsung dari `api.mock.ts` atau
`api.real.ts` — selalu lewat `src/lib/api.ts` (lihat CLAUDE.md).

## Alur inti

### a. Pendaftaran publik baru

Sumber: `src/pages/public/RegisterPage.tsx` → `submitRegistration()`
(`src/lib/api.real.ts`) → `POST /api/registrations`
(`backend/src/routes/public.ts`).

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant RP as RegisterPage.tsx
    participant API as api.real.ts: submitRegistration()
    participant R as public.ts: POST /registrations
    participant SV as services.ts
    participant DB as Prisma/PostgreSQL

    U->>RP: isi form (peserta 1..n)
    RP->>API: submitRegistration(input)
    API->>R: POST /api/registrations {privacy_consent, participants, website}
    R->>R: parseBody(registrationInputSchema) — strip unknown keys
    alt honeypot terisi (body.website)
        R-->>API: 400 "Pengiriman ditolak."
    end
    R->>SV: computeRegistrationStatus()
    alt pendaftaran tertutup (manual/deadline)
        R-->>API: 403 {regStatus.message}
        API-->>RP: throw RegistrationClosedError
    end
    R->>R: validateParticipants() — nama wajib, sp_code harus lolos SP_CODE_RE
    alt tidak lolos validasi
        R-->>API: 400 (kosong) / 422 (nama/sp_code invalid)
    end
    R->>DB: create RegistrationSession {id: uid(), manageToken: genToken()} + create Participant[] (buildParticipantData per peserta)
    R->>SV: logNotification(sessionId, 'committee_blast', 'whatsapp')
    R->>SV: logNotification(sessionId, 'committee_blast', 'email')
    R->>SV: logNotification(sessionId, 'participant_confirmation', 'whatsapp')
    R->>SV: logNotification(sessionId, 'participant_confirmation', 'email')
    Note over SV,DB: NotificationLog.status = 'dry_run' (default, NOTIFICATIONS_ENABLED=false) — tidak ada WA/email nyata terkirim
    R->>DB: findUniqueOrThrow(session + participants)
    R-->>API: 201 sessionDict(session)
    API-->>RP: SessionWithParticipants
    RP->>U: redirect ke SuccessPage (bawa manage_token)
```

Catatan: keempat `logNotification` dipanggil **berurutan dan di-await**
(bukan fire-and-forget paralel) sebelum response dikirim — lihat
`public.ts` baris ~90-93.

### b. Kelola mandiri via token (ManagePage) — bagian paling kompleks di repo

Sumber: `src/pages/public/ManagePage.tsx` → `getSessionByToken()` /
`updateSessionByToken()` → `GET`/`PATCH /api/registrations/token/:token`
(`backend/src/routes/public.ts`).

```mermaid
sequenceDiagram
    participant MP as ManagePage.tsx
    participant API as api.real.ts
    participant R as public.ts: PATCH /registrations/token/:token
    participant TX as Prisma $transaction
    participant DB as PostgreSQL

    MP->>API: getSessionByToken(token)
    API->>R: GET /api/registrations/token/:token
    R-->>API: sessionDict atau null (200 di kedua kasus, BUKAN 404)
    MP->>MP: user edit daftar peserta (tambah/ubah/hapus baris di form)
    MP->>API: updateSessionByToken(token, {participants: [...]})
    API->>R: PATCH body {participants}
    R->>DB: findUnique session by manageToken (+participants)
    alt token tak ditemukan
        R-->>API: 404 "Data pendaftaran tidak ditemukan."
    end
    R->>R: validateParticipants(patch.participants) jika != null
    R->>TX: begin transaction
    loop untuk setiap item di patch.participants
        alt item.id ADA dan cocok participant existing (Map by id)
            TX->>DB: participant.update(prev.id, {field-field dari input})
            Note right of TX: attendance_status & is_checked_in/checked_in_at TIDAK disentuh — dipertahankan dari sebelumnya
            TX->>TX: keepIds.add(prev.id)
        else item.id kosong ATAU tidak match existing manapun
            TX->>DB: participant.create(buildParticipantData(...)) — peserta BARU
            TX->>TX: keepIds.add(newId)
        end
    end
    TX->>TX: removeIds = existing keys - keepIds
    alt removeIds tidak kosong
        TX->>DB: participant.deleteMany({id: {in: removeIds}}) — peserta yang DIHAPUS dari form
    end
    TX->>DB: registrationSession.update({updatedAt: nowIso()})
    R->>R: logNotification(sessionId, 'committee_blast', 'whatsapp')
    R->>DB: findUniqueOrThrow(session + participants)
    R-->>API: sessionDict(updated)
```

**Logic diffing (persis, jangan disederhanakan saat membaca kode):** array
`participants` yang dikirim client adalah **representasi penuh** daftar akhir
yang diinginkan, bukan delta. Backend membangun `Map<id, existing>` dari data
lama, lalu untuk tiap item terima:
- **update in place** jika `item.id` cocok dengan participant yang sudah ada —
  field editable diperbarui, tapi `attendance_status`, `is_checked_in`,
  `checked_in_at` **tidak ikut diubah oleh endpoint ini** (hanya bisa diubah
  lewat endpoint admin `PATCH /api/admin/participants/:id` atau
  `POST .../status`, `.../checkin`).
- **create** jika `item.id` kosong/null atau tidak cocok existing manapun.
- **delete** untuk id lama yang **tidak muncul** di array yang dikirim —
  artinya menghilangkan sebuah baris dari form ManagePage = permintaan hapus
  peserta tersebut secara permanen.

Seluruh operasi dibungkus `prisma.$transaction` (`public.ts` PATCH handler)
supaya kegagalan di tengah loop tidak meninggalkan sesi separuh ter-update.

`POST /api/registrations/token/:token/cancel` **tidak** memakai logic
diffing ini — cukup `updateMany` semua participant di sesi jadi
`attendance_status: 'cancelled'`, sesi & peserta tetap ada di DB.

### c. Login admin + request terautentikasi

Sumber: `src/pages/admin/LoginPage.tsx` → `login()` (`api.real.ts`) →
`POST /api/auth/login` → `requireCommittee` middleware untuk request
selanjutnya.

```mermaid
sequenceDiagram
    participant LP as LoginPage.tsx
    participant API as api.real.ts
    participant AR as auth.ts: POST /login
    participant MW as middleware/auth.ts: requireCommittee
    participant DB as PostgreSQL

    LP->>API: login(email, password)
    API->>AR: POST /api/auth/login {email, password}
    Note over AR: dibatasi expres-rate-limit: 10x / 15 menit / IP, sukses tidak dihitung
    AR->>DB: committee.findFirst({email: trim().toLowerCase()})
    alt tidak ditemukan ATAU verifyPassword() gagal
        AR-->>API: 401 "Email atau kata sandi salah."
    else committee.isActive === false
        AR-->>API: 403 "Akun panitia ini telah dinonaktifkan."
    end
    AR->>AR: createAccessToken(committee.id, committee.role) — JWT HS256, exp 24h default
    AR-->>API: {token, committee: committeeDict}
    API->>API: localStorage.setItem('sp.session', {token, committee})
    LP->>LP: navigate('/admin')

    Note over API,MW: setiap request admin berikutnya
    API->>MW: fetch(...) + header Authorization: Bearer <token>
    MW->>MW: decodeAccessToken(token)
    alt token hilang/invalid/expired
        MW-->>API: 401
    end
    MW->>DB: committee.findUnique(payload.sub)
    alt tidak ditemukan
        MW-->>API: 401
    else isActive === false
        MW-->>API: 403
    end
    MW->>MW: req.committee = committee; next()
```

`requireSuperAdmin` (dipanggil setelah `requireCommittee` pada route
committees) hanya mengecek `req.committee.role === 'super_admin'`, tidak
query DB tambahan.

### d. Check-in hari-H

Sumber: `src/pages/admin/CheckinPage.tsx` → `findForCheckIn()` /
`checkInParticipant()` / `checkInSession()`.

```mermaid
sequenceDiagram
    participant CP as CheckinPage.tsx
    participant API as api.real.ts
    participant R as admin.ts

    CP->>API: findForCheckIn(query)
    API->>R: GET /api/admin/checkin/search?q=...
    R-->>API: flatten(participant,session)[] — exclude attendance_status='cancelled', match full_name/sp_code/shortCode(manage_token)/whatsapp_number
    CP->>CP: render daftar hasil pencarian

    alt petugas centang 1 peserta
        CP->>API: checkInParticipant(id, !is_checked_in)
        API->>R: POST /api/admin/participants/:id/checkin {value}
        R-->>API: participantDict — is_checked_in + checked_in_at (nowIso() jika value=true, null jika false)
    else petugas centang semua peserta 1 sesi (mis. rombongan keluarga)
        CP->>API: checkInSession(sessionId, !allChecked)
        API->>R: POST /api/admin/sessions/:id/checkin-all {value}
        R->>R: filter participants != 'cancelled', updateMany
        R-->>API: {count} — jumlah yang ter-update
    end
```

### e. Broadcast notifikasi (log-only)

Sumber: `src/pages/admin/BroadcastPage.tsx` → `broadcastReminder()` →
`POST /api/admin/notifications/broadcast` → `services.broadcast()`.

```mermaid
sequenceDiagram
    participant BP as BroadcastPage.tsx
    participant API as api.real.ts
    participant R as admin.ts: POST /notifications/broadcast
    participant SV as services.ts: broadcast()
    participant DB as PostgreSQL

    BP->>API: broadcastReminder({induk, onlyAttending, channels})
    API->>R: POST body {induk, onlyAttending, channels}
    Note over R: onlyAttending camelCase (bukan only_attending) — alias sengaja dari frontend, lihat broadcastInputSchema
    alt channels kosong
        R-->>API: 400 "Pilih minimal satu channel."
    end
    R->>SV: broadcast(induk, onlyAttending, channels)
    SV->>DB: findMany participants (+filter onlyAttending, +filter spInduk(p.spCode)===induk jika induk!='all')
    SV->>SV: kumpulkan session_id unik dari participants tersaring (urutan pertama muncul, tanpa duplikat)
    loop untuk setiap session_id x setiap channel
        SV->>DB: logNotification(sessionId, 'reminder', channel)
        Note over DB: NotificationLog.status = settings.notificationsEnabled ? 'sent' : 'dry_run'
    end
    SV-->>R: {total: jumlah sesi, sent, failed, logs: notificationLogDict[]}
    R-->>API: json response
    BP->>BP: tampilkan ringkasan hasil
```

`NOTIFICATIONS_ENABLED=false` adalah default (`backend/src/config.ts`) —
selama itu, **tidak ada** integrasi gateway WA/Email nyata di belakang flag
ini; `logNotification()` hanya menulis baris `notification_logs` dengan
status `dry_run`. Membalik flag ke `true` akan membuat status menjadi `sent`
tanpa benar-benar mengirim apa pun, karena belum ada kode pengiriman —
lihat komentar di `services.ts:logNotification()`.

## Where does X live

| Konsep bisnis | Frontend | Backend |
|---|---|---|
| Validasi format Kode SP (`SP_CODE_RE`) | `isValidSpCode()`, `normalizeSpCode()` — `src/lib/format.ts` | `isValidSpCode()`, `normalizeSpCode()` — `backend/src/utils.ts` |
| SP Induk (token pertama Kode SP) | `spInduk()` — `src/lib/format.ts` | `spInduk()` — `backend/src/utils.ts` |
| Pengurutan alami Kode SP | `compareSpCode()` — `src/lib/format.ts` | `compareSpCode()` — `backend/src/utils.ts` |
| Normalisasi nomor WhatsApp ke `62...` | `normalizeWhatsApp()` — `src/lib/format.ts` | `normalizeWhatsapp()` — `backend/src/utils.ts` |
| Kalkulasi umur dari `birth_date` | `calculateAge()` — `src/lib/format.ts` | `calculateAge()` — `backend/src/utils.ts` |
| **Masking WhatsApp untuk UI publik** | `maskWhatsApp()` — `src/lib/format.ts`, dipakai di `src/pages/public/ParticipantsPage.tsx` | — (backend mengirim nomor asli tanpa masking; masking murni tanggung jawab UI) |
| Guard produksi (tolak start dengan secret/password default) | — | `assertProductionSafe()` — `backend/src/config.ts` |
| CORS allowlist eksplisit | — | `corsOriginList` — `backend/src/config.ts`, dipakai di `app.ts` |
| Rate limit login | — | `loginLimiter` (`express-rate-limit`) — `backend/src/routes/auth.ts` |
| Mode data DEMO vs REAL | `src/lib/mode.ts` (`DEMO_MODE`, `API_BASE_URL`) | — |
| Serialisasi camelCase → snake_case | — | `backend/src/serializers.ts` (`participantDict`, `sessionDict`, `eventDict`, `committeeDict`, `notificationLogDict`, `flatten`) |
| Validasi body request | — | zod schemas — `backend/src/schemas.ts` |

**PENTING:** `isValidSpCode`, `normalizeSpCode`, `spInduk`, `compareSpCode`,
`normalizeWhatsApp`/`normalizeWhatsapp`, dan `calculateAge` **diimplementasikan
independen di dua tempat** (`src/lib/format.ts` untuk frontend,
`backend/src/utils.ts` untuk backend). **Tidak ada shared package** — kedua
implementasi harus dijaga identik secara manual. Saat mengubah salah satu
regex/logic (mis. `SP_CODE_RE`), agent WAJIB mengubah versi satunya juga di
file yang berpasangan, atau perilaku validasi client vs server akan berbeda.
