import { useEffect, useMemo, useRef, useState } from 'react';
import { WILAYAH_CSV } from '../lib/constants';

// Pencarian wilayah domisili dalam SATU kotak (autocomplete), bukan bertingkat.
// Ketik mis. "cih" → muncul daftar kecamatan se-Indonesia dengan label bertingkat
// "Provinsi, Kabupaten/Kota, Kecamatan". Nilai tersimpan = label terpilih (cocok
// dengan `participant.address`). Data: idn-area-data (CSV) — dimuat sekali & dicache.

interface Opt {
  v: string; // label, mis. "Jawa Barat, Kabupaten Garut, Cihurip"
  s: string; // label lowercase untuk pencarian
}

interface RegionPickerProps {
  value: string;
  onChange: (combined: string) => void;
  ariaInvalid?: boolean;
  idPrefix?: string;
}

const LS_KEY = 'sp.wilayah.kecamatan.v1';

// ----- pemuatan & cache (dibagikan semua instance) -------------------------
let memCache: Opt[] | null = null;
let inflight: Promise<Opt[]> | null = null;

// Pisahkan baris CSV menjadi `fields` kolom; kolom terakhir (nama) boleh apa adanya.
function splitLine(line: string, fields: number): string[] {
  const parts: string[] = [];
  let idx = 0;
  for (let i = 0; i < fields - 1; i++) {
    const c = line.indexOf(',', idx);
    if (c < 0) return [];
    parts.push(line.slice(idx, c));
    idx = c + 1;
  }
  parts.push(line.slice(idx));
  return parts;
}
function rows(text: string, fields: number): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '' && !l.startsWith('code,'))
    .map((l) => splitLine(l, fields))
    .filter((p) => p.length === fields);
}

async function buildLabels(): Promise<string[]> {
  const [provCsv, regCsv, distCsv] = await Promise.all([
    fetch(`${WILAYAH_CSV}/provinces.csv`).then((r) => r.text()),
    fetch(`${WILAYAH_CSV}/regencies.csv`).then((r) => r.text()),
    fetch(`${WILAYAH_CSV}/districts.csv`).then((r) => r.text()),
  ]);
  const provMap = new Map<string, string>();
  for (const [code, name] of rows(provCsv, 2)) provMap.set(code, name);
  const regMap = new Map<string, { prov: string; name: string }>();
  for (const [code, prov, name] of rows(regCsv, 3)) regMap.set(code, { prov, name });

  const labels: string[] = [];
  for (const [, reg, name] of rows(distCsv, 3)) {
    const r = regMap.get(reg);
    if (!r) continue;
    const prov = provMap.get(r.prov) ?? '';
    const dist = name.replace(/^Kecamatan\s+/i, '');
    labels.push(`${prov}, ${r.name}, ${dist}`);
  }
  return labels;
}

async function loadOpts(): Promise<Opt[]> {
  if (memCache) return memCache;
  if (inflight) return inflight;
  inflight = (async () => {
    let labels: string[] | null = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) labels = JSON.parse(raw) as string[];
    } catch {
      /* ignore */
    }
    if (!labels || labels.length === 0) {
      labels = await buildLabels();
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(labels));
      } catch {
        /* kuota localStorage — abaikan */
      }
    }
    memCache = labels.map((v) => ({ v, s: v.toLowerCase() }));
    return memCache;
  })();
  return inflight;
}

// ----- komponen -------------------------------------------------------------
export function RegionPicker({ value, onChange, ariaInvalid, idPrefix = 'reg' }: RegionPickerProps) {
  const [query, setQuery] = useState(value);
  const [all, setAll] = useState<Opt[] | null>(memCache);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Selaraskan tampilan input bila nilai diubah dari luar (mode edit).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Tutup dropdown saat klik di luar; kembalikan teks ke nilai terpilih.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(valueRef.current);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function ensureLoaded() {
    if (all || loading) return;
    setLoading(true);
    setErr(false);
    loadOpts()
      .then((d) => setAll(d))
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!all || q.length < 2) return [];
    const out: Opt[] = [];
    for (const d of all) {
      if (d.s.includes(q)) {
        out.push(d);
        if (out.length >= 50) break;
      }
    }
    return out;
  }, [all, q]);

  function pick(opt: Opt) {
    setQuery(opt.v);
    onChangeRef.current(opt.v);
    setOpen(false);
  }
  function clear() {
    setQuery('');
    onChangeRef.current('');
    setOpen(true);
  }

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
        placeholder="Ketik kecamatan/kota domisili… (mis. Cih)"
        value={query}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery(valueRef.current);
          }
        }}
      />
      {query && (
        <button
          type="button"
          onClick={clear}
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
          {loading && <div className="px-4 py-3 text-sm text-slate-500">Memuat data wilayah…</div>}
          {err && (
            <div className="px-4 py-3 text-sm text-red-600">
              Gagal memuat data wilayah. Periksa koneksi lalu klik ulang kolom ini.
            </div>
          )}
          {!loading && !err && q.length < 2 && (
            <div className="px-4 py-3 text-sm text-slate-400">Ketik minimal 2 huruf untuk mencari.</div>
          )}
          {!loading && !err && q.length >= 2 && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400">Tidak ditemukan. Coba kata kunci lain.</div>
          )}
          {results.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt);
              }}
              className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-brand-50"
            >
              {opt.v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
