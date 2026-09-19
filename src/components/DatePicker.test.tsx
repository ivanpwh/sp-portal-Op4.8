import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from './DatePicker';

// Kontrak inti komponen ini: yang DILIHAT "17/08/1965", yang DISIMPAN
// "1965-08-17". Kalau keduanya pernah tertukar, tanggal lahir orang tersimpan
// salah tanpa satu pun pesan galat — karena itu kedua arah diuji di sini.

const box = () => screen.getByRole('textbox') as HTMLInputElement;

describe('DatePicker', () => {
  it('menampilkan nilai ISO dalam format Indonesia', () => {
    render(<DatePicker value="1965-08-17" onChange={() => {}} />);
    expect(box().value).toBe('17/08/1965');
  });

  it('mengeluarkan ISO, bukan teks yang tampil di layar', () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} />);

    // Urutan ini menirukan orang yang MENGETIK, bukan memilih dari kalender:
    // satu tombol karakter membuat datepicker masuk mode ketik, Enter
    // mengurainya. Tanpa tombol karakter itu, Enter memilih tanggal yang sedang
    // disorot kalender (hari ini) dan ujinya menguji hal yang salah.
    fireEvent.focus(box());
    fireEvent.keyDown(box(), { key: '1' });
    fireEvent.change(box(), { target: { value: '17/08/1965' } });
    fireEvent.keyDown(box(), { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith('1965-08-17');
    expect(box().value).toBe('17/08/1965');
  });

  it('nilai baru dari luar ikut tampil dalam format Indonesia', () => {
    const { rerender } = render(<DatePicker value="1965-08-17" onChange={() => {}} />);
    rerender(<DatePicker value="1990-01-02" onChange={() => {}} />);
    expect(box().value).toBe('02/01/1990');
  });

  // Tanggal lahir opsional sejak v3.2 — mengosongkannya harus benar-benar
  // mengosongkan kotaknya, bukan menyisakan tanggal sebelumnya.
  it('nilai kosong mengosongkan kotak', () => {
    const { rerender } = render(<DatePicker value="1965-08-17" onChange={() => {}} />);
    rerender(<DatePicker value="" onChange={() => {}} />);
    expect(box().value).toBe('');
  });

  /**
   * REGRESI zona waktu: `new Date("1965-08-17")` diurai sebagai UTC, jadi di
   * zona waktu barat tanggalnya mundur sehari. Tanggal lahir tidak boleh
   * bergeser karena perangkat yang dipakai mendaftar.
   */
  it('tidak menggeser tanggal karena zona waktu', () => {
    render(<DatePicker value="2000-01-01" onChange={() => {}} />);
    expect(box().value).toBe('01/01/2000');
  });
});
