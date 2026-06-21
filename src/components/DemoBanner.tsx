import { DEMO_MODE } from '../lib/mode';

// Bilah penanda mode demo. Hanya tampil saat DEMO_MODE aktif (build portofolio),
// supaya pengunjung tahu data yang ditampilkan hanya contoh — bukan data asli.
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div
      role="status"
      className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      Mode Demo — data yang ditampilkan hanya contoh, bukan data asli.
    </div>
  );
}
