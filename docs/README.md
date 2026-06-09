# SP Portal — Dokumentasi

Kumpulan dokumen perancangan & spesifikasi **SP Portal** (Soero Pramono Reunion Portal). Semua selaras dengan implementasi frontend terkini.

| Dokumen | Versi | Isi |
|---------|:---:|-----|
| [PRD](SP_Portal_PRD_v3.1.md) | 3.1 | Product Requirements — latar belakang, konsep Kode SP, model data, fitur publik & admin, aturan bisnis |
| [SRS](SP_Portal_SRS_v1.1.md) | 1.1 | Software Requirements — arsitektur, rute, tipe domain, spesifikasi fungsional (FR), kontrak API |
| [SDD](SP_Portal_SDD_v1.0.md) | 1.0 | System Design — arsitektur lapisan, skema DB (PostgreSQL), desain REST API, struktur backend FastAPI |
| [UI/UX Flow](SP_Portal_UIUX_Flow_v1.0.md) | 1.1 | Design system, peta navigasi, user flow (Mermaid), wireframe, state komponen, aksesibilitas |
| [Task Breakdown](SP_Portal_Task_Breakdown_v1.0.md) | 1.0 | WBS — fase, epik, tugas, status, estimasi, dependensi, milestone |

## Ringkasan keputusan produk (terkini)

- **Tanpa "Data Pendata"** — peserta diinput langsung (1..n) dalam satu sesi; satu token kelola + satu kode/QR check-in per sesi.
- **Kode SP wajib** per peserta; **SP Induk** = token pertama kode SP (mis. `SP4`). Ada halaman **Pengelompokan per SP Induk**.
- **Wajib**: Nama, Kode SP, Tanggal Lahir, Alamat Domisili. **Opsional**: Pekerjaan, Menginap, Email, WhatsApp.
- **Tanggal Lahir** dipilih via **datepicker** (Flowbite, Bahasa Indonesia); **umur dihitung otomatis** di sisi panitia (tidak diinput) — tampil di Detail Sesi, Pengelompokan, dan kolom `age` pada ekspor CSV.
- **Alamat Domisili** dipilih lewat **satu kotak pencarian kecamatan** se-Indonesia (autocomplete; label "Provinsi, Kabupaten/Kota, Kecamatan"); data dari `idn-area-data`.
- **Tanpa kuota** dan **tanpa pencegahan duplikat** (kontrol via tools admin).
- Identitas sesi di admin diwakili **peserta pertama** (kolom "Perwakilan").

## Stack ringkas

React 18 + TypeScript + Vite + Tailwind CSS · React Router v6 · `qrcode.react` · `flowbite-datepicker` · data wilayah `idn-area-data`. Backend target: FastAPI + PostgreSQL (saat ini di-mock via `localStorage` di `src/lib/api.ts`).

> Dependensi runtime baru: jalankan `npm install` sebelum `npm run build` / `npm run dev`.
