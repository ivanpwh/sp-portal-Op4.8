import { useEffect, useRef } from 'react';
import Datepicker from 'flowbite-datepicker/Datepicker';

/** Format yang dilihat pengguna di kotak isian. ISO hanya dipakai di balik layar. */
const DISPLAY_FORMAT = 'dd/mm/yyyy';
/** Format nilai yang disimpan & dipertukarkan dengan backend. */
const ISO_FORMAT = 'yyyy-mm-dd';

/**
 * Nilai terpilih sebagai ISO "YYYY-MM-DD", atau "" bila kosong.
 *
 * `getDate(format)` ditik `Date | string` oleh paketnya dan mengembalikan
 * `undefined` saat tidak ada tanggal terpilih; penyempitan di sini membuat
 * hanya string ISO yang pernah keluar dari komponen.
 */
function isoValue(dp: Datepicker): string {
  const v = dp.getDate(ISO_FORMAT);
  return typeof v === 'string' ? v : '';
}

/**
 * Urai "YYYY-MM-DD" menjadi Date pada tengah malam WAKTU LOKAL.
 *
 * `new Date("1965-08-17")` diurai sebagai UTC, sehingga di zona waktu barat
 * tanggalnya mundur sehari — tanggal lahir orang tidak boleh bergeser karena
 * zona waktu perangkatnya.
 */
function parseIso(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lokalisasi kalender ke Bahasa Indonesia (didaftarkan sekali).
if (!Datepicker.locales.id) {
  Datepicker.locales.id = {
    days: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
    daysShort: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'],
    daysMin: ['Mg', 'Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb'],
    months: [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
    today: 'Hari Ini',
    monthsTitle: 'Bulan',
    clear: 'Hapus',
    weekStart: 1,
    format: DISPLAY_FORMAT,
    titleFormat: 'MM y',
  };
}

// Pembungkus React untuk Flowbite Datepicker (paket `flowbite-datepicker`).
//
// DUA FORMAT, SENGAJA BERBEDA:
//   - yang DITAMPILKAN di kotak: "17/08/1965" (hh/bb/tttt, lazim di Indonesia);
//   - yang DIKELUARKAN lewat onChange & diterima lewat `value`: ISO
//     "1965-08-17", sesuai penyimpanan `birth_date`, perhitungan umur, ekspor
//     CSV, dan kontrak backend.
//
// Karena itu nilai TIDAK BOLEH dibaca langsung dari `input.value` (itu teks
// tampilan) dan TIDAK BOLEH dikirim ke `setDate()` sebagai string ISO
// (`setDate` mengurai string memakai format tampilan, jadi "1965-08-17" akan
// terbaca salah). Jembatannya selalu `dp.getDate('yyyy-mm-dd')` dan objek Date
// dari `parseIso()`.
interface DatePickerProps {
  id?: string;
  value: string; // ISO "YYYY-MM-DD" atau "" — BUKAN teks yang tampil di layar
  onChange: (value: string) => void; // selalu ISO "YYYY-MM-DD" atau ""
  max?: string; // ISO "YYYY-MM-DD" — batas tanggal maksimum (mis. hari ini)
  placeholder?: string;
  ariaInvalid?: boolean;
}

export function DatePicker({ id, value, onChange, max, placeholder, ariaInvalid }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dpRef = useRef<Datepicker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Inisialisasi datepicker sekali saat mount.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const dp = new Datepicker(el, {
      autohide: true,
      language: 'id',
      format: DISPLAY_FORMAT,
      maxDate: (max ? parseIso(max) : null) ?? new Date(),
      todayHighlight: true,
      orientation: 'bottom auto',
    });
    dpRef.current = dp;
    const initial = parseIso(value);
    if (initial) dp.setDate(initial, { silent: true });

    // getDate(), bukan el.value: yang di layar "17/08/1965", yang disimpan ISO.
    // undefined = tanggal dikosongkan/tidak terurai — sah, kolomnya opsional.
    const handler = () => onChangeRef.current(isoValue(dp));
    el.addEventListener('changeDate', handler);
    return () => {
      el.removeEventListener('changeDate', handler);
      dp.destroy();
      dpRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronkan bila nilai diubah dari luar (hydrate saat edit / reset).
  useEffect(() => {
    const el = inputRef.current;
    const dp = dpRef.current;
    if (!el || !dp) return;
    // Dibandingkan dalam ISO di kedua sisi; membandingkan `el.value` (teks
    // tampilan) dengan `value` (ISO) tidak akan pernah sama dan membuat
    // datepicker disetel ulang di setiap render.
    if (isoValue(dp) !== value) {
      const next = parseIso(value);
      if (next) dp.setDate(next, { silent: true });
      else dp.setDate({ clear: true });
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      // Kosong, lalu diisi datepicker dalam format tampilan pada efek mount —
      // menaruh `value` di sini akan memperlihatkan ISO mentah sekejap.
      defaultValue=""
      placeholder={placeholder ?? 'Pilih tanggal (hh/bb/tttt)'}
      className="input-base"
      autoComplete="off"
      aria-invalid={ariaInvalid}
    />
  );
}
