// Entry sekali-jalan untuk menyemai database: `npm run db:seed`.
//
// Dipisahkan dari jalur permintaan DENGAN SENGAJA. Dulu `bootstrap()` dipanggil
// dari dalam handler serverless (api/index.ts), sehingga setiap kontainer baru
// Vercel membayar dua query `count()` lintas jaringan sebelum permintaan
// pertamanya dilayani — terukur ~0,85 detik pada permintaan pertama tiap
// kontainer, dan portal dengan trafik sporadis seperti ini sering sekali
// memulai kontainer baru.
//
// Konsekuensinya: menyemai kini WAJIB dijalankan manual setelah `prisma db
// push` pada database baru. Database kosong yang tidak di-seed akan hidup tanpa
// satu pun super-admin dan tanpa setelan event — lihat backend/README.md.
import { bootstrap } from './seed';
import { initDb, prisma } from './db';

async function main() {
  await initDb();
  await bootstrap();
  console.log('Seed selesai: super-admin + setelan event sudah tersedia.');
}

main()
  .catch((err) => {
    console.error('Seed gagal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
