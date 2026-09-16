import { describe, it, expect } from 'vitest';
import {
  buildKecamatanOptions,
  groupVillagesByDistrict,
  hasKelurahan,
  joinRegion,
  parseCsvRows,
  resolveKecamatan,
  searchVillages,
  type KecamatanOption,
} from './region';

// Potongan data asli dari idn-area-data, termasuk contoh yang dipakai saat
// merancang fitur ini: Parongpong harus memuat Cihanjuang.
const PROVINCES = ['code,name', '32,Jawa Barat', '12,Sumatera Utara'].join('\n');
const REGENCIES = [
  'code,province_code,name',
  '32.17,32,Kabupaten Bandung Barat',
  '12.07,12,Kabupaten Deli Serdang',
].join('\n');
const DISTRICTS = [
  'code,regency_code,name',
  '32.17.02,32.17,Parongpong',
  '32.17.03,32.17,Cihanjuang Raya',
  '12.07.01,12.07,Lubuk Pakam',
].join('\n');
const VILLAGES = [
  'code,district_code,name',
  '32.17.02.2001,32.17.02,Karyawangi',
  '32.17.02.2002,32.17.02,Cihanjuang',
  '32.17.02.2003,32.17.02,Cihanjuangrahayu',
  // Dua nama desa di Indonesia memuat koma dan karena itu dikutip di sumbernya.
  '12.07.01.1001,12.07.01,"Lubuk Pakam I,II"',
].join('\n');

const OPTIONS: KecamatanOption[] = buildKecamatanOptions(PROVINCES, REGENCIES, DISTRICTS);

const PARONGPONG = 'Jawa Barat, Kabupaten Bandung Barat, Parongpong';
const LUBUK_PAKAM = 'Sumatera Utara, Kabupaten Deli Serdang, Lubuk Pakam';

describe('parseCsvRows', () => {
  it('membuang header dan baris kosong', () => {
    expect(parseCsvRows(PROVINCES, 2)).toEqual([
      ['32', 'Jawa Barat'],
      ['12', 'Sumatera Utara'],
    ]);
  });

  // Kolom nama selalu yang terakhir, jadi koma di dalamnya tidak boleh memotong.
  it('mempertahankan koma di dalam nama dan melepas tanda kutipnya', () => {
    const rows = parseCsvRows(VILLAGES, 3);
    expect(rows.find((r) => r[0] === '12.07.01.1001')?.[2]).toBe('Lubuk Pakam I,II');
  });

  it('mengembalikan tanda kutip ganda menjadi satu', () => {
    expect(parseCsvRows('code,name\n1,"Desa ""Baru"""', 2)[0][1]).toBe('Desa "Baru"');
  });

  it('membuang baris yang kolomnya kurang', () => {
    expect(parseCsvRows('code,name\n32', 2)).toEqual([]);
  });
});

describe('buildKecamatanOptions', () => {
  it('menyusun label bertingkat beserta kodenya', () => {
    expect(OPTIONS).toContainEqual({ code: '32.17.02', label: PARONGPONG });
  });

  it('membuang awalan "Kecamatan" dari sumbernya', () => {
    const built = buildKecamatanOptions(
      PROVINCES,
      REGENCIES,
      'code,regency_code,name\n32.17.09,32.17,Kecamatan Lembang',
    );
    expect(built[0].label).toBe('Jawa Barat, Kabupaten Bandung Barat, Lembang');
  });

  it('melewati kecamatan yang kabupatennya tidak dikenal', () => {
    const built = buildKecamatanOptions(
      PROVINCES,
      REGENCIES,
      'code,regency_code,name\n99.99.99,99.99,Antah Berantah',
    );
    expect(built).toEqual([]);
  });
});

describe('groupVillagesByDistrict', () => {
  it('mengelompokkan desa di bawah kode kecamatannya', () => {
    const index = groupVillagesByDistrict(VILLAGES);
    expect(index['32.17.02']).toEqual(['Karyawangi', 'Cihanjuang', 'Cihanjuangrahayu']);
  });

  it('kecamatan tanpa desa tidak muncul sebagai kunci', () => {
    expect(groupVillagesByDistrict(VILLAGES)['32.17.03']).toBeUndefined();
  });
});

describe('joinRegion', () => {
  it('menggabung empat tingkat', () => {
    expect(joinRegion(PARONGPONG, 'Cihanjuang')).toBe(`${PARONGPONG}, Cihanjuang`);
  });

  it('kelurahan kosong menghasilkan nilai tiga tingkat, bukan koma menggantung', () => {
    expect(joinRegion(PARONGPONG, '')).toBe(PARONGPONG);
    expect(joinRegion(PARONGPONG, '   ')).toBe(PARONGPONG);
  });

  it('kecamatan kosong menghasilkan string kosong', () => {
    expect(joinRegion('', 'Cihanjuang')).toBe('');
  });
});

describe('resolveKecamatan', () => {
  it('mengenali kecamatan dari nilai empat tingkat beserta sisanya', () => {
    const m = resolveKecamatan(`${PARONGPONG}, Cihanjuang`, OPTIONS);
    expect(m?.option.code).toBe('32.17.02');
    expect(m?.rest).toBe('Cihanjuang');
  });

  /**
   * REGRESI — janji inti fitur ini: data lama yang hanya sampai kecamatan tetap
   * sah, tidak boleh dianggap cacat, dan tidak boleh memaksa siapa pun
   * melengkapinya saat mengedit.
   */
  it('nilai lama tiga tingkat dikenali utuh tanpa sisa', () => {
    const m = resolveKecamatan(PARONGPONG, OPTIONS);
    expect(m?.option.label).toBe(PARONGPONG);
    expect(m?.rest).toBe('');
  });

  /**
   * REGRESI — ini yang akan gagal kalau seseorang menyederhanakannya jadi
   * value.split(','). Nama desanya memuat koma, dan membelahnya berarti merusak
   * alamat orang saat data mereka diedit.
   */
  it('nama desa yang memuat koma tidak terbelah', () => {
    expect(resolveKecamatan(`${LUBUK_PAKAM}, Lubuk Pakam I,II`, OPTIONS)?.rest).toBe(
      'Lubuk Pakam I,II',
    );
  });

  it('nama desa dengan koma DAN spasi juga tidak terbelah', () => {
    expect(resolveKecamatan(`${LUBUK_PAKAM}, Lambang Sari I, II, III`, OPTIONS)?.rest).toBe(
      'Lambang Sari I, II, III',
    );
  });

  // "Parongpong" adalah awalan dari "Parongpong Raya" bila dicocokkan sembarangan.
  it('memilih awalan TERPANJANG saat dua kecamatan saling berawalan', () => {
    const tricky = buildKecamatanOptions(
      PROVINCES,
      REGENCIES,
      ['code,regency_code,name', '32.17.02,32.17,Parongpong', '32.17.04,32.17,Parongpong Raya'].join(
        '\n',
      ),
    );
    const m = resolveKecamatan(
      'Jawa Barat, Kabupaten Bandung Barat, Parongpong Raya, Sukamaju',
      tricky,
    );
    expect(m?.option.label).toBe('Jawa Barat, Kabupaten Bandung Barat, Parongpong Raya');
    expect(m?.rest).toBe('Sukamaju');
  });

  it('kecamatan yang namanya berawalan sama tidak tertukar', () => {
    const m = resolveKecamatan('Jawa Barat, Kabupaten Bandung Barat, Cihanjuang Raya', OPTIONS);
    expect(m?.option.code).toBe('32.17.03');
    expect(m?.rest).toBe('');
  });

  /**
   * Begitu kecamatan dipilih, isi kotak menjadi "…Parongpong, " — spasi di ujung
   * itulah yang menandakan daftar desa harus muncul. Membuangnya (mis. dengan
   * trim biasa) membuat daftar desanya tidak pernah tampil sama sekali.
   */
  it('spasi di ujung setelah koma tidak membatalkan pengenalan', () => {
    const m = resolveKecamatan(`${PARONGPONG}, `, OPTIONS);
    expect(m?.option.label).toBe(PARONGPONG);
    expect(m?.rest).toBe('');
  });

  it('koma tanpa spasi (mis. setelah backspace) tetap dikenali', () => {
    expect(resolveKecamatan(`${PARONGPONG},`, OPTIONS)?.option.label).toBe(PARONGPONG);
  });

  it('ketikan yang belum menyentuh kecamatan mana pun menghasilkan null', () => {
    expect(resolveKecamatan('cihanjuang', OPTIONS)).toBeNull();
    expect(resolveKecamatan('', OPTIONS)).toBeNull();
    expect(resolveKecamatan('   ', OPTIONS)).toBeNull();
    expect(resolveKecamatan(PARONGPONG, [])).toBeNull();
  });

  it('bolak-balik lewat joinRegion menghasilkan nilai yang sama', () => {
    const value = `${PARONGPONG}, Cihanjuang`;
    const m = resolveKecamatan(value, OPTIONS);
    expect(joinRegion(m!.option.label, m!.rest)).toBe(value);
  });
});

describe('searchVillages', () => {
  const INDEX = groupVillagesByDistrict(VILLAGES);

  // Inilah yang membuat satu kotak cukup: mengetik nama desa saja sudah
  // memunculkan label empat tingkatnya, tanpa menebak kecamatannya dulu.
  it('menemukan desa dari namanya saja', () => {
    expect(searchVillages(INDEX, 'cihanjuang', 10)).toContainEqual({
      districtCode: '32.17.02',
      village: 'Cihanjuang',
    });
  });

  it('tidak peduli besar-kecil huruf dan cocok di tengah kata', () => {
    expect(searchVillages(INDEX, 'WANGI', 10).map((h) => h.village)).toContain('Karyawangi');
  });

  it('menghormati batas jumlah hasil', () => {
    expect(searchVillages(INDEX, 'ci', 2)).toHaveLength(2);
  });

  it('ketikan kosong tidak mengembalikan apa pun', () => {
    expect(searchVillages(INDEX, '   ', 10)).toEqual([]);
  });

  // Pemanggilan kedua memakai bentuk huruf kecil yang sudah disiapkan; hasilnya
  // harus tetap sama persis.
  it('hasilnya konsisten saat dipanggil berulang', () => {
    expect(searchVillages(INDEX, 'cihanjuang', 10)).toEqual(
      searchVillages(INDEX, 'cihanjuang', 10),
    );
  });
});

describe('hasKelurahan', () => {
  it('membedakan nilai empat tingkat dari tiga tingkat', () => {
    expect(hasKelurahan(`${PARONGPONG}, Cihanjuang`)).toBe(true);
    expect(hasKelurahan(PARONGPONG)).toBe(false);
    expect(hasKelurahan('')).toBe(false);
  });

  /**
   * Validasi jalan sinkron saat submit, jadi fungsi ini tidak boleh bergantung
   * pada daftar opsi yang dimuat lewat jaringan — alamat lengkap tidak boleh
   * ditolak hanya karena daftarnya belum sempat termuat.
   */
  it('bekerja tanpa daftar opsi sama sekali', () => {
    expect(hasKelurahan('Jawa Barat, Kabupaten Bandung Barat, Parongpong, Cihanjuang')).toBe(true);
  });

  // Arah salahnya harus aman: nama desa berkoma menambah potongan, tidak
  // mengurangi, jadi alamat yang sudah lengkap tidak pernah dianggap kurang.
  it('nama desa berkoma tetap terbaca sudah punya kelurahan', () => {
    expect(hasKelurahan(`${LUBUK_PAKAM}, Lambang Sari I, II, III`)).toBe(true);
  });
});
