import { useEffect, useRef } from 'react';
import Datepicker from 'flowbite-datepicker/Datepicker';

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
    format: 'yyyy-mm-dd',
    titleFormat: 'MM y',
  };
}

// Pembungkus React untuk Flowbite Datepicker (paket `flowbite-datepicker`).
// Nilai disimpan & dikeluarkan dalam format ISO "YYYY-MM-DD" agar konsisten
// dengan penyimpanan `birth_date` dan perhitungan umur di sisi panitia.
interface DatePickerProps {
  id?: string;
  value: string; // "YYYY-MM-DD" atau ""
  onChange: (value: string) => void;
  max?: string; // "YYYY-MM-DD" — batas tanggal maksimum (mis. hari ini)
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
      format: 'yyyy-mm-dd',
      maxDate: max ? new Date(max) : new Date(),
      todayHighlight: true,
      orientation: 'bottom auto',
    });
    dpRef.current = dp;
    if (value) dp.setDate(value, { silent: true });

    const handler = () => onChangeRef.current(el.value);
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
    if (el.value !== value) {
      if (value) dp.setDate(value, { silent: true });
      else dp.setDate({ clear: true });
    }
  }, [value]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      defaultValue={value}
      placeholder={placeholder ?? 'Pilih tanggal (YYYY-MM-DD)'}
      className="input-base"
      autoComplete="off"
      aria-invalid={ariaInvalid}
    />
  );
}
