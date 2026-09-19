# SP Portal — Dokumentasi

Kumpulan dokumen perancangan & spesifikasi **SP Portal** (Soero Pramono Reunion Portal). Semua selaras dengan implementasi frontend terkini.

| Dokumen | Versi | Isi |
|---------|:---:|-----|
| [PRD](SP_Portal_PRD_v3.1.md) | 3.2 | Product Requirements — latar belakang, konsep Kode SP, model data, fitur publik & admin, aturan bisnis |
| [SRS](SP_Portal_SRS_v1.1.md) | 1.2 | Software Requirements — arsitektur, rute, tipe domain, spesifikasi fungsional (FR), kontrak API |
| [SDD](SP_Portal_SDD_v1.0.md) | 1.1 | System Design — arsitektur lapisan, skema DB (PostgreSQL), desain REST API, struktur backend FastAPI |
| [UI/UX Flow](SP_Portal_UIUX_Flow_v1.0.md) | 1.2 | Design system, peta navigasi, user flow (Mermaid), wireframe, state komponen, aksesibilitas |
| [Task Breakdown](SP_Portal_Task_Breakdown_v1.0.md) | 1.1 | WBS — fase, epik, tugas, status, estimasi, dependensi, milestone |
| [API Reference](API_REFERENCE.md) | 1.0 | Referensi AI-agent: tabel lengkap 35 endpoint HTTP backend (method, auth, body zod, response, error) |
| [Architecture](ARCHITECTURE.md) | 1.0 | Referensi AI-agent: diagram sistem, 5 sequence diagram alur inti, peta "where does X live" |
| [Glossary](GLOSSARY.md) | 1.0 | Referensi AI-agent: istilah domain (Kode SP, manage_token, attendance_status, dll.) dengan rujukan file |

## Ringkasan keputusan produk (terkini)

- **Tanpa "Data Pendata"** — peserta diinput langsung (1..n) dalam satu sesi; satu token kelola + satu kode/QR check-in per sesi.
- **Kode SP wajib** per peserta; **SP Induk** = token pertama kode SP (mis. `SP4`). Ada halaman **Pengelompokan per SP Induk**.
- **Wajib**: Nama, Kode SP. **Opsional**: Tanggal Lahir, Alamat Domisili, Pekerjaan, Menginap, Email, WhatsApp. (Tanggal Lahir & Alamat Domisili dilonggarkan jadi opsional — pendaftar sering tidak hafal data kerabat yang didaftarkannya; alamat boleh berhenti di tingkat mana pun, kelurahan tidak diwajibkan.)
- **Tanggal Lahir** dipilih via **datepicker** (Flowbite, Bahasa Indonesia), ditampilkan `hh/bb/tttt` (mis. `17/08/1965`) sementara nilai yang disimpan tetap ISO `YYYY-MM-DD`; **umur dihitung otomatis** di sisi panitia (tidak diinput) — tampil di Detail Sesi, Pengelompokan, dan kolom `age` pada ekspor CSV.
- **Alamat Domisili** dipilih lewat **satu kotak pencarian kecamatan** se-Indonesia (autocomplete; label "Provinsi, Kabupaten/Kota, Kecamatan"); data dari `idn-area-data`.
- **Tanpa kuota** dan **tanpa pencegahan duplikat** (kontrol via tools admin).
- Identitas sesi di admin diwakili **peserta pertama** (kolom "Perwakilan").
- **(v3.2)** Halaman publik **Peserta Terdaftar** (`/peserta`): per SP Induk, hanya nama + kode SP + kontak; nomor WhatsApp **disamarkan** (`maskWhatsApp()`, bukan tautan `wa.me`), email (jika WA kosong) tetap tampil penuh sebagai tautan `mailto:`; peserta batal disembunyikan.
- **(v3.2)** **Check-in dipertahankan** (meja registrasi hari-H) dengan perbaikan: limit query kosong, check-in per sesi, hitungan hadir global.

## Stack ringkas

React 18 + TypeScript + Vite + Tailwind CSS · React Router v6 · `qrcode.react` · `flowbite-datepicker` · data wilayah `idn-area-data`. Backend: Express + TypeScript + Prisma + PostgreSQL (lihat `backend/README.md`). Frontend punya dua mode data (`src/lib/mode.ts`, `VITE_DEMO_MODE`): DEMO (default) memakai mock `localStorage` di `src/lib/api.mock.ts` — cocok untuk build portofolio tanpa backend/data asli — sedangkan REAL memanggil backend ini lewat `src/lib/api.real.ts`.

> Dependensi runtime baru: jalankan `npm install` sebelum `npm run build` / `npm run dev`.
