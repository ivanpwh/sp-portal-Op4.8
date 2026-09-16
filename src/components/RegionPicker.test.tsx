import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegionPicker } from './RegionPicker';
import { __resetRegionCacheForTests } from '../lib/region';

// Potongan data asli; Parongpong memang memuat Cihanjuang.
const CSV: Record<string, string> = {
  'provinces.csv': 'code,name\n32,Jawa Barat',
  'regencies.csv': 'code,province_code,name\n32.17,32,Kabupaten Bandung Barat',
  'districts.csv': 'code,regency_code,name\n32.17.02,32.17,Parongpong',
  'villages.csv':
    'code,district_code,name\n32.17.02.2001,32.17.02,Karyawangi\n32.17.02.2002,32.17.02,Cihanjuang',
};

const PARONGPONG = 'Jawa Barat, Kabupaten Bandung Barat, Parongpong';
const LENGKAP = `${PARONGPONG}, Cihanjuang`;

beforeEach(() => {
  __resetRegionCacheForTests();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const name = Object.keys(CSV).find((f) => String(url).endsWith(f));
      if (!name) return Promise.reject(new Error(`URL tak terduga: ${url}`));
      return Promise.resolve({ text: () => Promise.resolve(CSV[name]) } as Response);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function boxes() {
  return screen.queryAllByRole('combobox');
}
// Proyek ini tidak memakai jest-dom, jadi properti DOM-nya diperiksa langsung.
function box(): HTMLInputElement {
  return boxes()[0] as HTMLInputElement;
}

describe('RegionPicker', () => {
  /**
   * Hanya boleh ADA SATU kolom. Versi sebelumnya memunculkan kotak kedua khusus
   * kelurahan begitu kecamatan dipilih, dan itu bukan yang diminta.
   */
  it('hanya menyediakan satu kolom, sebelum maupun sesudah ada nilai', async () => {
    const { rerender } = render(<RegionPicker value="" onChange={() => {}} />);
    expect(boxes()).toHaveLength(1);

    rerender(<RegionPicker value={LENGKAP} onChange={() => {}} />);
    expect(boxes()).toHaveLength(1);
    expect(box().value).toBe(LENGKAP);
  });

  /**
   * Kotaknya menampilkan `value` apa adanya, jadi data wilayah hanya perlu
   * diunduh oleh daftar rekomendasi. Memuatnya saat mount berarti tiap halaman
   * kelola menarik 708 KB untuk kolom yang mungkin tidak pernah disentuh.
   */
  it('tidak mengunduh apa pun sebelum kolomnya disentuh', async () => {
    render(<RegionPicker value={LENGKAP} onChange={() => {}} />);
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.focus(box());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  /**
   * Inti permintaannya: rekomendasi menampilkan label LENGKAP empat tingkat,
   * bukan potongan nama desa saja — mengetik nama desanya sudah cukup.
   */
  it('mengetik nama desa langsung menawarkan label empat tingkat', async () => {
    const onChange = vi.fn();
    render(<RegionPicker value="" onChange={onChange} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'cihanjuang' } });

    fireEvent.mouseDown(await screen.findByText(LENGKAP));
    expect(onChange).toHaveBeenLastCalledWith(LENGKAP);
  });

  // Jalan kedua menuju baris yang sama, tetap di kotak yang sama.
  it('memilih kecamatan menampilkan desa-desanya di kotak yang sama', async () => {
    const onChange = vi.fn();
    render(<RegionPicker value="" onChange={onChange} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'parong' } });
    fireEvent.mouseDown(await screen.findByText(PARONGPONG));

    // Kecamatannya sudah tersimpan, kotaknya tetap satu dan tetap terbuka.
    expect(onChange).toHaveBeenLastCalledWith(PARONGPONG);
    expect(boxes()).toHaveLength(1);
    expect(box().value).toBe(`${PARONGPONG}, `);

    fireEvent.mouseDown(await screen.findByText(LENGKAP));
    expect(onChange).toHaveBeenLastCalledWith(LENGKAP);
  });

  /**
   * REGRESI — janji inti fitur ini. Pendaftar lama yang alamatnya berhenti di
   * kecamatan harus bisa membuka halaman kelolanya tanpa dipaksa melengkapi
   * apa pun, dan nilainya tampil apa adanya.
   */
  it('nilai lama tiga tingkat tampil utuh tanpa dipaksa dilengkapi', () => {
    render(<RegionPicker value={PARONGPONG} onChange={() => {}} />);

    expect(box().value).toBe(PARONGPONG);
    expect(box().getAttribute('aria-invalid')).not.toBe('true');
  });

  // Untuk data lama, berhenti di kecamatan harus tetap bisa dipilih ulang.
  it('menawarkan berhenti di kecamatan hanya saat kelurahan tidak diwajibkan', async () => {
    const { rerender, unmount } = render(<RegionPicker value={PARONGPONG} onChange={() => {}} />);
    fireEvent.focus(box());
    expect(await screen.findByText('— tanpa kelurahan')).toBeTruthy();

    rerender(<RegionPicker value={PARONGPONG} onChange={() => {}} requireVillage />);
    expect(screen.queryByText('— tanpa kelurahan')).toBeNull();
    unmount();
  });

  /**
   * Mengganti kecamatan harus membuang kelurahan lamanya. Kalau tidak, alamat
   * bisa berakhir menunjuk desa yang tidak ada di kecamatan barunya — salah
   * secara diam-diam, dan tidak akan ketahuan sampai ada yang mengeceknya.
   */
  it('memilih ulang kecamatan membuang kelurahan yang sudah menempel', async () => {
    const onChange = vi.fn();
    render(<RegionPicker value={LENGKAP} onChange={onChange} />);

    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: 'parong' } });
    fireEvent.mouseDown(await screen.findByText(PARONGPONG));

    expect(onChange).toHaveBeenLastCalledWith(PARONGPONG);
  });
});
