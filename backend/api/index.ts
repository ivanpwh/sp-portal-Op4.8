// Vercel serverless entry point — wraps the Express app.
//
// TIDAK ADA bootstrap()/seed di sini. Penyemaian dijalankan sekali lewat
// `npm run db:seed` saat deploy (lihat backend/README.md). Memanggilnya dari
// handler berarti tiap kontainer baru membayar dua query count() lintas
// jaringan sebelum permintaan pertamanya dilayani — ~0,85 detik terukur, dan
// kontainer baru sering muncul pada portal dengan trafik sporadis.
//
// initDb() tetap dipanggil: isinya hanya PRAGMA khusus SQLite dan langsung
// keluar pada PostgreSQL, jadi biayanya nol di produksi.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';
import { initDb } from '../src/db';
import { assertProductionSafe } from '../src/config';

assertProductionSafe();

const app = createApp();

let initialized: Promise<void> | null = null;
function initialize(): Promise<void> {
  // Disimpan sebagai promise, bukan flag boolean: dua permintaan yang tiba
  // bersamaan pada kontainer yang sama harus menunggu inisialisasi YANG SAMA,
  // bukan menjalankannya dua kali.
  initialized ??= initDb();
  return initialized;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await initialize();
  return app(req as any, res as any);
}
