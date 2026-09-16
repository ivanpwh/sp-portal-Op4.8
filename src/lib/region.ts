// ---------------------------------------------------------------------------
// SP Portal — data wilayah domisili (provinsi → kabupaten/kota → kecamatan →
// kelurahan/desa).
//
// Nilai yang disimpan ke `participant.address` adalah SATU string label
// bertingkat, mis. "Jawa Barat, Kabupaten Bandung Barat, Parongpong, Cihanjuang".
// Tidak ada kolom terpisah per tingkat — lihat komentar di src/types.ts.
//
// Data lama hanya punya TIGA tingkat (tanpa kelurahan) dan tetap sah. Semua
// fungsi di sini wajib memperlakukannya sebagai nilai yang benar, bukan cacat.
//
// Berkas ini sengaja dipisah dari RegionPicker.tsx: bagian yang paling mudah
// salah — penguraian CSV dan pemecahan kembali label tersimpan — jadi bisa diuji
// tanpa merender komponen apa pun.
// ---------------------------------------------------------------------------

import { WILAYAH_CSV } from './constants';

export interface KecamatanOption {
  /** Kode kecamatan idn-area, mis. "32.17.02". Dipakai mencari daftar desanya. */
  code: string;
  /** Label bertingkat "Provinsi, Kabupaten/Kota, Kecamatan". */
  label: string;
}

/** Peta kode kecamatan → daftar nama kelurahan/desa di bawahnya. */
export type VillageIndex = Record<string, string[]>;

// ----- penguraian CSV -------------------------------------------------------

/**
 * Lepas tanda kutip pembungkus gaya CSV dan kembalikan `""` menjadi `"`.
 *
 * Diperlukan sejak kelurahan ikut dipakai: dua nama desa memuat koma dan karena
 * itu dikutip di sumbernya — "Lubuk Pakam I,II" dan "Lambang Sari I, II, III".
 * Provinsi, kabupaten, dan kecamatan tidak pernah memuat koma, itu sebabnya
 * penguraian lama tidak pernah membutuhkan ini.
 */
function unquote(field: string): string {
  const s = field.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

/**
 * Pecah satu baris menjadi `fields` kolom. Kolom TERAKHIR diambil apa adanya,
 * sehingga nama yang memuat koma tidak ikut terpotong — kolom nama memang selalu
 * yang terakhir di ketiga berkas sumber.
 */
function splitLine(line: string, fields: number): string[] | null {
  const parts: string[] = [];
  let idx = 0;
  for (let i = 0; i < fields - 1; i++) {
    const c = line.indexOf(',', idx);
    if (c < 0) return null;
    parts.push(line.slice(idx, c));
    idx = c + 1;
  }
  parts.push(line.slice(idx));
  return parts.map(unquote);
}

/** Baris CSV tanpa header dan tanpa baris kosong, tiap kolom sudah dilepas kutipnya. */
export function parseCsvRows(text: string, fields: number): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('code,')) continue;
    const parts = splitLine(line, fields);
    if (parts && parts.length === fields) out.push(parts);
  }
  return out;
}

// ----- pembangunan opsi -----------------------------------------------------

export function buildKecamatanOptions(
  provincesCsv: string,
  regenciesCsv: string,
  districtsCsv: string,
): KecamatanOption[] {
  const provMap = new Map<string, string>();
  for (const [code, name] of parseCsvRows(provincesCsv, 2)) provMap.set(code, name);

  const regMap = new Map<string, { prov: string; name: string }>();
  for (const [code, prov, name] of parseCsvRows(regenciesCsv, 3)) regMap.set(code, { prov, name });

  const out: KecamatanOption[] = [];
  for (const [code, reg, name] of parseCsvRows(districtsCsv, 3)) {
    const r = regMap.get(reg);
    if (!r) continue;
    const prov = provMap.get(r.prov) ?? '';
    // Sumbernya kadang menulis "Kecamatan X"; label kita sudah menyiratkan
    // tingkatannya lewat posisi, jadi awalannya dibuang.
    const dist = name.replace(/^Kecamatan\s+/i, '');
    out.push({ code, label: `${prov}, ${r.name}, ${dist}` });
  }
  return out;
}

/**
 * Kelompokkan desa per kecamatan.
 *
 * Bentuk BERKELOMPOK, bukan daftar label rata: label rata untuk 83.762 desa
 * memakan ~4,7 MB JSON dan menembus kuota localStorage, sedangkan bentuk ini
 * ~1,1 MB. Ia juga bentuk yang memang dibutuhkan UI — daftar desa baru
 * diperlukan setelah kecamatannya dipilih.
 */
export function groupVillagesByDistrict(villagesCsv: string): VillageIndex {
  const out: VillageIndex = {};
  for (const [, districtCode, name] of parseCsvRows(villagesCsv, 3)) {
    (out[districtCode] ??= []).push(name);
  }
  return out;
}

// ----- gabung & pecah nilai tersimpan ---------------------------------------

/** Satukan kecamatan + kelurahan jadi nilai `address`. Kelurahan kosong = 3 tingkat. */
export function joinRegion(kecamatanLabel: string, kelurahan: string): string {
  const kec = kecamatanLabel.trim();
  const kel = kelurahan.trim();
  if (!kec) return '';
  return kel ? `${kec}, ${kel}` : kec;
}

export interface KecamatanMatch {
  option: KecamatanOption;
  /** Sisa ketikan setelah label kecamatan — dipakai memfilter daftar desanya. */
  rest: string;
}

/**
 * Kenali kecamatan yang menjadi awalan sebuah ketikan/nilai tersimpan.
 *
 * MEMAKAI PENCOCOKAN AWALAN TERPANJANG, BUKAN split(','). Dua nama desa memuat
 * koma ("Lambang Sari I, II, III"), jadi memecah per koma akan membelah nama
 * desa jadi beberapa potong dan merusak alamat orang saat diedit. Awalan yang
 * dicocokkan harus diikuti persis ", " agar "…, Cihanjuang Rahayu" tidak pernah
 * salah dianggap sebagai "…, Cihanjuang" + sisa.
 *
 * Spasi di UJUNG sengaja tidak dibuang: begitu pengguna memilih kecamatan, isi
 * kotak menjadi "…Parongpong, " dan justru spasi itulah tandanya ia siap
 * mengetik nama desa.
 *
 * null = ketikan belum menyentuh satu kecamatan pun (masih mencari kecamatan,
 * atau sedang mencari nama desa secara langsung).
 */
export function resolveKecamatan(
  query: string,
  options: KecamatanOption[],
): KecamatanMatch | null {
  const q = query.replace(/^\s+/, '');
  if (!q) return null;

  let best: KecamatanOption | null = null;
  let rest = '';
  for (const o of options) {
    if (best && o.label.length <= best.label.length) continue;
    if (q === o.label || q === `${o.label},`) {
      best = o;
      rest = '';
    } else if (q.startsWith(`${o.label}, `)) {
      best = o;
      rest = q.slice(o.label.length + 2);
    }
  }
  return best ? { option: best, rest } : null;
}

export interface VillageHit {
  districtCode: string;
  village: string;
}

// Menyiapkan bentuk huruf kecil SEKALI per indeks, bukan tiap ketikan: tanpa ini
// setiap huruf yang diketik mengalokasikan 83.762 string baru hanya untuk dibuang
// lagi. WeakMap supaya tidak menahan indeksnya tetap hidup.
const flatCache = new WeakMap<VillageIndex, { d: string; n: string; l: string }[]>();

function flatten(index: VillageIndex) {
  let flat = flatCache.get(index);
  if (!flat) {
    flat = [];
    for (const [d, names] of Object.entries(index)) {
      for (const n of names) flat.push({ d, n, l: n.toLowerCase() });
    }
    flatCache.set(index, flat);
  }
  return flat;
}

/**
 * Cari nama desa di seluruh Indonesia. Inilah yang membuat mengetik "cihanjuang"
 * langsung memunculkan "…, Parongpong, Cihanjuang" tanpa harus menebak
 * kecamatannya lebih dulu.
 */
export function searchVillages(
  index: VillageIndex,
  query: string,
  limit: number,
): VillageHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: VillageHit[] = [];
  for (const row of flatten(index)) {
    if (!row.l.includes(q)) continue;
    out.push({ districtCode: row.d, village: row.n });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * true bila nilainya sudah memuat kelurahan. Dipakai validasi form.
 *
 * Sengaja TIDAK memakai `splitRegion`: validasi berjalan sinkron saat tombol
 * simpan ditekan, sedangkan daftar opsi dimuat asinkron dan bisa saja belum
 * siap — memakai splitRegion berarti alamat yang sudah lengkap bisa ditolak
 * hanya karena jaringan lambat.
 *
 * Menghitung koma aman DI SINI meski tidak aman di `splitRegion`: nama provinsi,
 * kabupaten/kota, dan kecamatan tidak pernah memuat koma, jadi nilai tiga
 * tingkat selalu tepat tiga potong. Nama desa berkoma hanya menambah potongan,
 * jadi tetap terbaca sebagai "sudah ada kelurahan" — arah salahnya pun aman.
 */
export function hasKelurahan(value: string): boolean {
  return value.trim().split(',').length >= 4;
}

// ----- pemuatan & cache -----------------------------------------------------

const LS_KECAMATAN = 'sp.wilayah.kecamatan.v2'; // v2: kini menyimpan kode, bukan label saja
const LS_KELURAHAN = 'sp.wilayah.kelurahan.v1';

let kecMem: KecamatanOption[] | null = null;
let kecInflight: Promise<KecamatanOption[]> | null = null;
let vilMem: VillageIndex | null = null;
let vilInflight: Promise<VillageIndex> | null = null;

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kuota penuh atau storage diblokir. Sesi ini tetap jalan dari cache memori;
    // yang hilang hanya keuntungan kunjungan berikutnya.
  }
}

export async function loadKecamatanOptions(): Promise<KecamatanOption[]> {
  if (kecMem) return kecMem;
  if (kecInflight) return kecInflight;

  kecInflight = (async () => {
    const cached = readCache<KecamatanOption[]>(LS_KECAMATAN);
    if (cached && cached.length > 0) {
      kecMem = cached;
      return cached;
    }
    const [prov, reg, dist] = await Promise.all([
      fetch(`${WILAYAH_CSV}/provinces.csv`).then((r) => r.text()),
      fetch(`${WILAYAH_CSV}/regencies.csv`).then((r) => r.text()),
      fetch(`${WILAYAH_CSV}/districts.csv`).then((r) => r.text()),
    ]);
    const opts = buildKecamatanOptions(prov, reg, dist);
    writeCache(LS_KECAMATAN, opts);
    kecMem = opts;
    return opts;
  })();

  // Promise yang gagal TIDAK boleh tersimpan: dulu `inflight` tidak pernah
  // dikosongkan saat gagal, sehingga pesan "klik ulang kolom ini" tidak pernah
  // benar-benar bisa memulihkan keadaan sampai halaman dimuat ulang.
  kecInflight.catch(() => {
    kecInflight = null;
  });
  return kecInflight;
}

/**
 * Daftar desa dimuat MALAS — hanya saat kotak kelurahan pertama kali dibuka.
 * Berkasnya 2,8 MB mentah, tapi jsDelivr menyajikannya ter-brotli sekitar 708 KB.
 * Tidak ada gunanya menanggung itu untuk orang yang belum memilih kecamatan.
 */
export async function loadVillageIndex(): Promise<VillageIndex> {
  if (vilMem) return vilMem;
  if (vilInflight) return vilInflight;

  vilInflight = (async () => {
    const cached = readCache<VillageIndex>(LS_KELURAHAN);
    if (cached && Object.keys(cached).length > 0) {
      vilMem = cached;
      return cached;
    }
    const csv = await fetch(`${WILAYAH_CSV}/villages.csv`).then((r) => r.text());
    const index = groupVillagesByDistrict(csv);
    writeCache(LS_KELURAHAN, index);
    vilMem = index;
    return index;
  })();

  vilInflight.catch(() => {
    vilInflight = null;
  });
  return vilInflight;
}

/** Hanya untuk pengujian: kosongkan cache memori antar-test. */
export function __resetRegionCacheForTests(): void {
  kecMem = null;
  kecInflight = null;
  vilMem = null;
  vilInflight = null;
}
