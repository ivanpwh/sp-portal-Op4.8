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

> **Catatan:** sejak penambahan animasi perayaan, proyek memakai dependensi baru
> [`lottie-react`](https://www.npmjs.com/package/lottie-react). Jalankan
> `npm install` sekali lagi setelah menarik perubahan ini agar paket tersebut
> terpasang.

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

## Tampilan & Animasi

Antarmuka dirancang **halus, hidup, tetapi tetap ramah lansia**. Seluruh gerakan
otomatis dijinakkan bila pengguna mengaktifkan _"kurangi gerakan"_ pada perangkat
(`prefers-reduced-motion`), sehingga aksesibilitas tetap terjaga.

- **Latar "gradient mesh"** — gumpalan warna hijau & pasir yang mengambang sangat
  perlahan di belakang konten (bukan lagi warna polos). Didefinisikan di
  [`src/index.css`](src/index.css) via `body::before`/`body::after`. Area admin
  memakai gradasi `slate` yang lembut.
- **Animasi masuk (entrance)** — kartu, hero, dan daftar muncul dengan _fade-in-up_
  bertahap (kelas `.stagger-1` … `.stagger-5`).
- **Mikro-interaksi** — tombol utama sedikit terangkat saat di-hover, kartu yang
  dapat diklik memakai `.card-interactive`, dan modal muncul dengan _scale-in_.
- **Angka menghitung naik** (`CountUp`) pada statistik di Beranda & halaman Peserta.
- **Konfeti perayaan (Lottie)** pada halaman sukses — animasi vektor
  [`src/assets/celebration.json`](src/assets/celebration.json) yang dirender lewat
  `lottie-react`, dibungkus `SafeBoundary` agar halaman tetap aman bila animasi
  gagal dimuat, dan dilewati saat pengguna meminta kurangi gerakan.

Keyframe & utilitas animasi (mis. `animate-fade-in-up`, `animate-pop-in`,
`animate-float`, `animate-shimmer`) didefinisikan di
[`tailwind.config.js`](tailwind.config.js). Komponen pendukung baru
(`CountUp`, `usePrefersReducedMotion`, `SafeBoundary`) ada di
[`src/components/ui.tsx`](src/components/ui.tsx).

## Fitur (sesuai PRD)

**Area Publik (Peserta)**
- Halaman utama: info acara + peta lokasi + hitung kuota.
- Form pendaftaran dinamis dengan validasi, normalisasi nomor WA (→ `62…`),
  honeypot anti-spam, dan **persetujuan privasi wajib**.
- Pencegahan data ganda (WA/email) → diarahkan untuk memperbarui data.
- Status kuota/tenggat: form ditutup dengan pesan ramah.
- Halaman sukses: **kode/QR check-in** (hanya bila fitur QR check-in aktif),
  ringkasan, detail acara, tautan kelola.
- Direktori peserta publik (`/peserta`): daftar per SP Induk + pencarian.
  **Nomor WhatsApp disamarkan** (mis. `+62 812-•••••-890`) dan **tidak bisa
  diklik** demi privasi (data sensitif). Lihat `maskWhatsApp()` di
  [`src/lib/format.ts`](src/lib/format.ts).
- Kelola mandiri via token (tanpa login): **edit** & **batalkan** kehadiran.

**Area Panitia (Admin)**
- Login (JWT-style session) + role-based (super-admin vs panitia).
- Dashboard pendaftar: tabel/kartu, **pencarian & filter** (trah/status), ekspor CSV.
- Manajemen data (CRUD): koreksi, hapus, toggle check-in & status.
- **Statistik & laporan**: total orang, rekap per trah, tren, ekspor CSV (UTF-8/Excel).
- **Broadcast pengingat massal** (segmentasi, WA/Email, templat H-7/H-1/Hari-H).
- **Log notifikasi** dengan status & **retry**.
- **Check-in Hari-H**: cari/scan kode, tandai hadir.
- **Pengaturan acara**: nama, tanggal, lokasi/peta, kuota, tenggat, buka/tutup,
  serta **aktif/nonaktif fitur QR check-in**.
- **Akun panitia** (super-admin) — **CRUD penuh**: tambah, **ubah**
  (nama/email/peran + atur ulang kata sandi opsional), aktif/nonaktif, dan
  **hapus**. Pengaman: email wajib unik, dan **minimal satu Super Admin**
  selalu dipertahankan (Super Admin terakhir tidak bisa dihapus/diturunkan).
  Saat akun yang sedang login diubah, sesi auth ikut disinkronkan.

> **Fitur QR Check-in (toggle).** Di **Pengaturan Acara** panitia dapat
> mematikan fitur QR check-in (`qr_checkin_enabled`). Saat dimatikan, kartu
> **"Kode Check-in Pendaftaran"** beserta QR di halaman sukses **disembunyikan**
> (begitu pula baris "Kode:" di halaman kelola). Menu **Check-in Hari-H** dan
> kode/QR di area admin **tetap tersedia**, sehingga panitia masih bisa
> melakukan check-in seperti biasa. Nilai bawaan: **aktif**.

## Struktur

```
src/
  assets/          # aset statis (mis. celebration.json — animasi Lottie konfeti)
  components/      # UI primitives & layout (PublicLayout, AdminLayout)
  lib/             # api (mock), auth context, format helpers, constants
  pages/public/    # Home, Register, Success, Manage, Participants
  pages/admin/     # Login, Dashboard, Detail, Statistics, Broadcast,
                   # Checkin, NotificationLogs, EventSettings, Committees
  index.css        # base Tailwind, latar gradient-mesh, utilitas animasi
  types.ts         # tipe domain (mengikuti skema DB di PRD)
```
