import { useEffect, useMemo, useRef, useState } from 'react';
import {
  joinRegion,
  loadKecamatanOptions,
  loadVillageIndex,
  resolveKecamatan,
  searchVillages,
  type KecamatanOption,
  type VillageIndex,
} from '../lib/region';

// Pemilih wilayah domisili — SATU kotak, dan setiap baris rekomendasi selalu
// menampilkan label selengkap yang akan tersimpan:
//
//   "Jawa Barat, Kabupaten Bandung Barat, Parongpong, Cihanjuang"
//
// Dua jalan menuju baris itu, keduanya di kotak yang sama:
//   1. Ketik nama desanya ("cihanjuang") — dicari langsung ke 83.762 desa.
//   2. Ketik kecamatannya ("parong"), pilih, lalu daftar desa kecamatan itu
//      menggantikan isi rekomendasi di kotak yang sama.
//
// Daftar desa (708 KB ter-brotli) diunduh saat kotak ini pertama DISENTUH, bukan
// saat halaman dimuat — dan pencarian kecamatan sudah bisa dipakai selagi unduhan
// itu berjalan, jadi tidak ada yang menunggu kotak kosong.
//
// Nilai tersimpan tetap SATU string di `participant.address`. Data lama yang
// hanya sampai kecamatan tetap sah.

const MAX_RESULTS = 50;
const MAX_VILLAGE_HITS = 25;
const MIN_CHARS = 2;

interface Row {
  key: string;
  /** Teks yang ditampilkan — selalu label penuh yang akan tersimpan. */
  text: string;
  /** Nilai yang disimpan saat baris ini dipilih. */
  commit: string;
  /**
   * true = memilih baris ini belum selesai; kotak tetap terbuka dan berpindah
   * memperlihatkan daftar desa kecamatan tersebut.
   */
  drill: boolean;
  note?: string;
}

interface RegionPickerProps {
  value: string;
  onChange: (combined: string) => void;
  ariaInvalid?: boolean;
  idPrefix?: string;
}

export function RegionPicker({
  value,
  onChange,
  ariaInvalid,
  idPrefix = 'reg',
}: RegionPickerProps) {
  const [options, setOptions] = useState<KecamatanOption[] | null>(null);
  const [index, setIndex] = useState<VillageIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [err, setErr] = useState(false);

  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Nilai yang baru kita kirim sendiri tidak boleh memantul balik menimpa isi
  // kotak: setelah memilih kecamatan, isinya "…Parongpong, " sementara `value`
  // hanya "…Parongpong" — tanpa penjaga ini spasi penanda itu langsung hilang
  // dan daftar desanya tidak pernah sempat muncul.
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    if (emitted.current === value) return;
    setQuery(value);
  }, [value]);

  function emit(next: string, nextQuery: string) {
    emitted.current = next;
    setQuery(nextQuery);
    onChangeRef.current(next);
  }

  function ensureData() {
    if (!options && !loading) {
      setLoading(true);
      setErr(false);
      loadKecamatanOptions()
        .then(setOptions)
        .catch(() => setErr(true))
        .finally(() => setLoading(false));
    }
    if (!index && !indexLoading) {
      setIndexLoading(true);
      loadVillageIndex()
        .then(setIndex)
        .catch(() => setErr(true))
        .finally(() => setIndexLoading(false));
    }
  }

  // Tidak ada pramuat saat mount, sengaja: kotak ini menampilkan `value` apa
  // adanya, jadi data wilayah hanya dibutuhkan oleh daftar rekomendasi. Memuatnya
  // lebih awal berarti setiap halaman kelola/admin menarik 708 KB untuk kolom
  // yang mungkin tidak pernah disentuh.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [value]);

  const byCode = useMemo(() => {
    const m = new Map<string, KecamatanOption>();
    for (const o of options ?? []) m.set(o.code, o);
    return m;
  }, [options]);

  const match = useMemo(
    () => (options ? resolveKecamatan(query, options) : null),
    [query, options],
  );

  const rows = useMemo<Row[]>(() => {
    if (!options) return [];
    const out: Row[] = [];

    // Kecamatannya sudah jelas → tawarkan desa-desanya, sebagai label penuh.
    if (match) {
      const rest = match.rest.trim().toLowerCase();
      // Berhenti di kecamatan selalu ditawarkan: domisili sendiri opsional, jadi
      // tidak ada keadaan di mana kelurahan boleh dipaksakan.
      out.push({
        key: 'kec-self',
        text: match.option.label,
        commit: match.option.label,
        drill: false,
        note: 'tanpa kelurahan',
      });
      for (const name of index?.[match.option.code] ?? []) {
        if (rest && !name.toLowerCase().includes(rest)) continue;
        out.push({
          key: `desa-${name}`,
          text: joinRegion(match.option.label, name),
          commit: joinRegion(match.option.label, name),
          drill: false,
        });
        if (out.length >= MAX_RESULTS) break;
      }
      return out;
    }

    const q = query.trim().toLowerCase();
    if (q.length < MIN_CHARS) return out;

    // Nama desa didahulukan: itulah yang dicari orang, dan barisnya sudah lengkap
    // empat tingkat sehingga bisa langsung dipilih tanpa langkah kedua.
    if (index) {
      for (const hit of searchVillages(index, q, MAX_VILLAGE_HITS)) {
        const opt = byCode.get(hit.districtCode);
        if (!opt) continue;
        const text = joinRegion(opt.label, hit.village);
        out.push({ key: `hit-${hit.districtCode}-${hit.village}`, text, commit: text, drill: false });
      }
    }

    for (const o of options) {
      if (!o.label.toLowerCase().includes(q)) continue;
      out.push({
        key: `kec-${o.code}`,
        text: o.label,
        commit: o.label,
        drill: true,
        note: 'pilih untuk melihat kelurahan/desa',
      });
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [options, index, byCode, match, query]);

  function pick(r: Row) {
    if (r.drill) {
      // Nilainya tetap disimpan lebih dulu, jadi yang berhenti di sini tidak
      // kehilangan apa pun; ", " di ujung membuka daftar desanya.
      emit(r.commit, `${r.commit}, `);
      ensureData();
      return;
    }
    emit(r.commit, r.commit);
    setOpen(false);
  }

  const busy = loading || (match !== null && index === null && indexLoading);

  return (
    <div className="relative" ref={boxRef}>
      <input
        id={idPrefix}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        autoComplete="off"
        className="input-base pr-10"
        placeholder="Ketik kelurahan atau kecamatan… (mis. Cihanjuang)"
        value={query}
        onFocus={() => {
          ensureData();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(value);
          }
        }}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            emit('', '');
            setOpen(true);
          }}
          aria-label="Hapus pilihan"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {busy && <div className="px-4 py-3 text-sm text-slate-500">Memuat data wilayah…</div>}
          {err && !busy && (
            <div className="px-4 py-3 text-sm text-red-600">
              Gagal memuat data wilayah. Periksa koneksi lalu klik ulang kolom ini.
            </div>
          )}
          {!busy && !err && !match && query.trim().length < MIN_CHARS && (
            <div className="px-4 py-3 text-sm text-slate-400">
              Ketik minimal {MIN_CHARS} huruf untuk mencari.
            </div>
          )}
          {!busy && !err && rows.length === 0 && query.trim().length >= MIN_CHARS && (
            <div className="px-4 py-3 text-sm text-slate-400">
              Tidak ditemukan. Coba kata kunci lain.
            </div>
          )}

          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-brand-50"
            >
              {r.text}
              {r.note && <span className="ml-2 text-xs text-slate-400">— {r.note}</span>}
            </button>
          ))}

          {/* Selagi 708 KB daftar desa masih turun, pencarian kecamatan sudah
              jalan. Tanpa keterangan ini, mengetik nama desa lebih dulu tampak
              seperti desanya memang tidak ada. */}
          {indexLoading && !busy && (
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Daftar kelurahan/desa masih dimuat…
            </div>
          )}
          {rows.length >= MAX_RESULTS && (
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Menampilkan {MAX_RESULTS} teratas — persempit pencarian bila belum ketemu.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
