# SP Portal — Product Requirements Document (PRD)
**Versi:** 3.1
**Proyek:** Soero Pramono Reunion Portal
**Terakhir diperbarui:** Juni 2026
**Status:** Aktif
**Perubahan utama v3.0 → v3.1:** Menghilangkan konsep "Data Pendata" (peserta diinput langsung); Pekerjaan Terakhir & Rencana Lokasi Menginap menjadi opsional; pencegahan duplikat otomatis dihapus.

---

## 1. Latar Belakang

SP Portal adalah sistem pendaftaran reuni keluarga besar Soero Pramono. Portal ini memudahkan pendataan peserta yang hadir, lengkap dengan notifikasi otomatis (WA/Email) dan fitur check-in hari-H.

Sistem ini dibangun **mobile-first** dan harus ramah digunakan oleh lansia. Form dirancang seminimal mungkin: cukup masukkan peserta beserta Kode SP-nya.

---

## 2. Konsep Kode SP

Setiap anggota keluarga memiliki kode SP yang merepresentasikan posisi dalam silsilah keluarga besar Soero Pramono. Kode ini **wajib diisi** untuk setiap peserta.

### Format Kode SP

```
SP[no_anak].[no_anak_dari_anak].[dst]
Suffix A = pasangan (istri/suami)
```

**Contoh:**
| Kode | Arti |
|------|------|
| `SP4` | Anak ke-4 dari Soero Pramono |
| `SP4A` | Istri/suami dari SP4 |
| `SP4.1` | Anak pertama dari SP4 |
| `SP4.1A` | Pasangan dari SP4.1 |
| `SP4.1.3` | Anak ke-3 dari SP4.1 |
| `SP4.1.3A` | Pasangan dari SP4.1.3 |
| `SP4.1.3.1` | Anak pertama dari SP4.1.3 |

### SP Induk
SP Induk adalah level pertama, yaitu `SP1`, `SP2`, `SP3`, dst. Semua kode yang berawalan `SP4` (misal `SP4`, `SP4A`, `SP4.1`, `SP4.1.3A`) termasuk dalam **kelompok SP4**.

---

## 3. Model Data

### 3.1 Sesi Pendaftaran (`RegistrationSession`)

Satu sesi pendaftaran mewakili satu aksi pendataan — beberapa orang yang didaftarkan bersamaan. **Tidak ada identitas "pendata" terpisah**; peserta diinput langsung. Satu sesi berbagi satu token kelola dan satu kode check-in (QR).

| Field | Tipe | Keterangan |
|-------|------|-----------|
| `id` | string | UUID |
| `manage_token` | string | Token unik untuk kelola mandiri |
| `privacy_consent` | boolean | Wajib `true` |
| `registered_at` | datetime | Waktu pendaftaran |
| `updated_at` | datetime\|null | Waktu update terakhir |

> **Dihapus di v3.1:** `registrar_name`, `registrar_whatsapp`, `registrar_email` (tidak ada Data Pendata).

### 3.2 Peserta (`Participant`)

Setiap individu yang didaftarkan. Satu sesi bisa memiliki banyak peserta.

| Field | Tipe | Wajib | Keterangan |
|-------|------|:---:|-----------|
| `id` | string | — | UUID |
| `session_id` | string | — | FK ke `RegistrationSession` |
| `full_name` | string | ✅ | Nama lengkap |
| `sp_code` | string | ✅ | Kode SP |
| `birth_date` | string (ISO `YYYY-MM-DD`) | ✅ | Tanggal lahir via datepicker (Flowbite). **Umur dihitung otomatis** di sisi panitia — tidak diinput |
| `address` | string | ✅ | Domisili — dipilih dari **satu kotak pencarian** kecamatan se-Indonesia; tersimpan sebagai gabungan "Provinsi, Kabupaten/Kota, Kecamatan" |
| `last_occupation` | string | ➖ | Pekerjaan terakhir — **opsional (v3.1)** |
| `accommodation` | string | ➖ | Rencana lokasi menginap — **opsional (v3.1)** |
| `email` | string\|null | ➖ | Email (opsional) |
| `whatsapp_number` | string\|null | ➖ | No WA/HP (opsional) |
| `attendance_status` | enum | — | `will_attend` \| `cancelled` |
| `is_checked_in` | boolean | — | Status check-in hari-H |
| `checked_in_at` | datetime\|null | — | Waktu check-in |

### 3.3 Pengaturan Acara (`EventSettings`)

| Field | Tipe | Keterangan |
|-------|------|-----------|
| `id` | string | UUID |
| `event_name` | string | Nama acara |
| `event_date` | datetime | Tanggal & waktu acara |
| `location` | string | Nama lokasi |
| `address` | string | Alamat lengkap |
| `maps_query` | string | Kata kunci Google Maps |
| `registration_deadline` | datetime\|null | Tenggat pendaftaran (null = tanpa batas) |
| `registration_open` | boolean | Buka/tutup form publik |
| `updated_at` | datetime | Waktu update terakhir |

> Tidak ada `max_capacity` — tidak ada batas kuota.

---

## 4. Fitur — Area Publik (Peserta)

### 4.1 Halaman Utama
- Tampilkan info acara: nama, tanggal, lokasi, peta (embed Google Maps).
- Tampilkan status pendaftaran (buka/tutup, sudah lewat tenggat).
- Tampilkan jumlah pendaftaran masuk & total peserta hadir.
- Tombol "Daftar Sekarang".

### 4.2 Form Pendaftaran Multi-Orang

Pengguna langsung mengisi daftar peserta — **tanpa bagian Data Pendata**.

**Daftar Peserta (minimal 1, bisa tambah lebih)**

Setiap peserta mengisi:
- Nama lengkap *(wajib)*
- Kode SP *(wajib)* — dengan hint format & contoh
- Tanggal lahir *(wajib)* — dipilih via **datepicker** (Flowbite), format `YYYY-MM-DD`; umur dihitung otomatis oleh panitia (tidak diinput pengguna)
- Alamat domisili *(wajib)* — **satu kolom pencarian**: ketik nama kecamatan/kota lalu pilih dari daftar (label "Provinsi, Kabupaten/Kota, Kecamatan", data wilayah Indonesia)
- Pekerjaan terakhir *(opsional)*
- Rencana lokasi menginap *(opsional, pilihan dropdown)*
- Email *(opsional)*
- No WA/HP *(opsional)*

**Persetujuan privasi:** satu checkbox (wajib) untuk seluruh pendaftaran.

**Interaksi form:**
- Tombol "+ Tambah Peserta" untuk menambah baris peserta baru.
- Tombol hapus (✕) pada tiap peserta (minimal 1 harus tetap ada).
- Validasi: kode SP harus sesuai format (regex: `^SP\d+(\.\d+)*A?$` — case-insensitive).
- Honeypot anti-spam (field tersembunyi `website` harus kosong).
- **Tidak ada pencegahan duplikat otomatis** (dihapus di v3.1).

### 4.3 Halaman Sukses
- Tampilkan kode check-in sesi + QR code.
- Daftar peserta yang terdaftar beserta kode SP masing-masing.
- Detail acara (tanggal, lokasi).
- Tautan "Kelola Pendaftaran" (via manage token).

### 4.4 Kelola Mandiri (via Token)
Diakses melalui tautan unik tanpa login.
- Edit data tiap peserta.
- Tambah/hapus peserta dari sesi.
- Batalkan kehadiran seluruh sesi.

---

## 5. Fitur — Area Panitia (Admin)

### 5.1 Autentikasi
- Login dengan email + password. Role-based: `super_admin` vs `committee`. Session JWT-style.

### 5.2 Dashboard Pendaftar
- Daftar seluruh sesi. Per baris: **perwakilan (peserta pertama)**, jumlah peserta, SP Induk, kontak (bila ada), status, tanggal daftar.
- Pencarian (nama peserta, kode SP, WA). Filter: status kehadiran, SP Induk. Ekspor CSV.

### 5.3 Detail Sesi
- Info sesi (kode, jumlah peserta, waktu daftar) — read-only.
- Tampilkan semua peserta + kode SP. Koreksi data peserta (tambah/edit/hapus). Toggle check-in & status per peserta. Hapus seluruh sesi.

### 5.4 Tampilan Pengelompokan per SP Induk ⭐
Halaman khusus (`/admin/pengelompokan`) menampilkan seluruh peserta dikelompokkan berdasarkan **SP Induk**.

**Kolom data per peserta:** Nama, Kode SP, Alamat, Umur/Tanggal Lahir, Pekerjaan Terakhir, Lokasi Menginap, Email, WA/No HP.

**Fitur:** Expand/collapse per SP Induk; urut dalam grup berdasarkan kode SP; ekspor per SP Induk (CSV) atau ekspor semua; filter tampilkan hanya `will_attend` (default) atau semua.

### 5.5 Statistik & Laporan
- Total peserta (per status). Rekap per SP Induk: jumlah orang & jumlah sesi. Tren pendaftaran harian. Ekspor CSV.

### 5.6 Broadcast Notifikasi Massal
- Segmentasi penerima (semua / per SP Induk / per status). Channel: WhatsApp, Email. Template: H-7, H-1, Hari-H. Satu pesan per sesi.

### 5.7 Log Notifikasi
- Riwayat pengiriman. Status: `sent` / `failed` / `dry_run`. Retry untuk yang gagal.

### 5.8 Check-in Hari-H
- Cari peserta by nama / kode SP / kode check-in sesi. Toggle status `is_checked_in` per peserta.

### 5.9 Pengaturan Acara
- Edit nama acara, tanggal, lokasi, alamat, kata kunci peta, tenggat pendaftaran (opsional). Toggle buka/tutup pendaftaran. (Tanpa Kuota Maksimum.)

### 5.10 Akun Panitia (Super Admin)
- Tambah/nonaktifkan akun committee. Role: `super_admin` atau `committee`.

---

## 6. Aturan Bisnis

| # | Aturan |
|---|--------|
| B1 | Kode SP wajib untuk setiap peserta. Format: `SP[angka](.[angka])*[A]?` — case-insensitive. |
| B2 | SP Induk = token pertama dari kode SP. `SP4.1.3A` → induk = `SP4`. |
| B3 | Nomor WA (pada peserta yang mengisinya) dinormalisasi ke `62…`. |
| B4 | Nama, Kode SP, Tanggal Lahir, dan Alamat wajib per peserta. Pekerjaan, Menginap, Email, WA opsional. |
| B5 | Satu sesi boleh memiliki peserta dari SP Induk berbeda. |
| B6 | Form publik ditutup jika `registration_open = false` atau `registration_deadline` sudah lewat. |
| B7 | Persetujuan privasi (`privacy_consent`) wajib `true` untuk menyimpan data (satu centang per pendaftaran). |
| B8 | Tidak ada batas kuota peserta. |
| B9 | Tidak ada pencegahan duplikat otomatis (dihapus di v3.1). |

---

## 7. Normalisasi Nomor WhatsApp

```
Input        → Output
08123456789  → 628123456789
+628123456   → 628123456
62 812 345   → 628123456
0812-345-678 → 6281234567
```

Algoritma: (1) Hapus karakter non-digit/format; (2) jika diawali `0` → ganti `62`; (3) jika diawali `8` → tambahkan `62`.

---

## 8. Opsi Dropdown Standar

### Rencana Lokasi Menginap *(opsional)*
- Rumah Keluarga
- Hotel / Penginapan
- Rumah Sendiri (warga lokal)
- Belum Tahu

---

## 9. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Datepicker | flowbite-datepicker (untuk tanggal lahir) |
| Data Wilayah | idn-area-data (CSV via jsDelivr) — pencarian kecamatan domisili |
| Backend | FastAPI (Python) |
| Mock Layer (dev) | `localStorage` via `src/lib/api.ts` |
| Auth | JWT-style session |
| Notifikasi | WhatsApp API + Email (SMTP/transactional) |

---

## 10. Catatan Migrasi dari v3.0

| Perubahan | Detail |
|-----------|--------|
| ❌ Dihapus: Data Pendata | `registrar_name/whatsapp/email` dihapus dari `RegistrationSession`; peserta diinput langsung |
| 🔄 Opsional: Pekerjaan Terakhir | `last_occupation` tidak lagi wajib |
| 🔄 Opsional: Rencana Menginap | `accommodation` tidak lagi wajib |
| ❌ Dihapus: Pencegahan duplikat | Tidak ada lagi `DuplicateError`/cek WA-email pendata |
| 🔄 Identitas sesi di admin | Diwakili oleh peserta pertama (perwakilan) |
| ✅ Tetap | Kode SP wajib, pengelompokan SP Induk, tanpa kuota, persetujuan privasi |
