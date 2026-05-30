# SP Portal — Frontend

Frontend untuk **SP Portal (Soero Pramono Reunion Portal)** — sistem pendaftaran
reuni keluarga besar Soero Pramono, lengkap dengan auto-blasting (WA/Email).
Dibangun sesuai PRD v2.0.

> **Mobile-first, ramah lansia, dan aksesibel.** React + TypeScript + Vite + Tailwind CSS.

## Menjalankan

```bash
npm install
npm run dev      # mode pengembangan (http://localhost:5173)
npm run build    # build produksi -> dist/
npm run preview  # pratinjau hasil build
```

## Catatan Data Layer (penting)

Backend FastAPI belum disertakan. Agar aplikasi langsung dapat dijalankan dan
didemokan, seluruh data ditangani oleh **mock API berbasis `localStorage`** di
[`src/lib/api.ts`](src/lib/api.ts). Setiap fungsi di file tersebut memetakan 1:1
ke endpoint backend yang dijelaskan di PRD. Untuk menyambungkan ke backend asli,
ganti isi fungsi-fungsi tersebut dengan `fetch(import.meta.env.VITE_API_URL + ...)`
yang mengembalikan bentuk data yang sama (lihat `src/types.ts`).

Data contoh (pendaftar, pengaturan acara, akun panitia) otomatis di-_seed_ saat
pertama dibuka. Untuk mereset: jalankan `localStorage.clear()` di DevTools.

### Akun demo panitia

| Email                | Kata sandi | Peran       |
| -------------------- | ---------- | ----------- |
| `admin@spportal.id`  | `admin123` | super_admin |

## Fitur (sesuai PRD)

**Area Publik (Peserta)**
- Halaman utama: info acara + peta lokasi + hitung kuota.
- Form pendaftaran dinamis dengan validasi, normalisasi nomor WA (→ `62…`),
  honeypot anti-spam, dan **persetujuan privasi wajib**.
- Pencegahan data ganda (WA/email) → diarahkan untuk memperbarui data.
- Status kuota/tenggat: form ditutup dengan pesan ramah.
- Halaman sukses: **kode/QR check-in**, ringkasan, detail acara, tautan kelola.
- Kelola mandiri via token (tanpa login): **edit** & **batalkan** kehadiran.

**Area Panitia (Admin)**
- Login (JWT-style session) + role-based (super-admin vs panitia).
- Dashboard pendaftar: tabel/kartu, **pencarian & filter** (trah/status), ekspor CSV.
- Manajemen data (CRUD): koreksi, hapus, toggle check-in & status.
- **Statistik & laporan**: total orang, rekap per trah, tren, ekspor CSV (UTF-8/Excel).
- **Broadcast pengingat massal** (segmentasi, WA/Email, templat H-7/H-1/Hari-H).
- **Log notifikasi** dengan status & **retry**.
- **Check-in Hari-H**: cari/scan kode, tandai hadir.
- **Pengaturan acara**: nama, tanggal, lokasi/peta, kuota, tenggat, buka/tutup.
- **Akun panitia** (super-admin): tambah/nonaktifkan.

## Struktur

```
src/
  components/      # UI primitives & layout (PublicLayout, AdminLayout)
  lib/             # api (mock), auth context, format helpers, constants
  pages/public/    # Home, Register, Success, Manage
  pages/admin/     # Login, Dashboard, Detail, Statistics, Broadcast,
                   # Checkin, NotificationLogs, EventSettings, Committees
  types.ts         # tipe domain (mengikuti skema DB di PRD)
```
