// Entry point: seed the DB (first super-admin + event), then start the server.
// Table creation is handled by `prisma db push` / `prisma migrate` (see README).
import { createApp } from './app';
import { bootstrap } from './seed';
import { initDb, prisma } from './db';
import { assertProductionSafe, settings } from './config';

async function main() {
  assertProductionSafe();
  await initDb();
  await bootstrap();
  const app = createApp();
  app.listen(settings.port, () => {
    console.log(`SP Portal API listening on http://localhost:${settings.port}`);
  });
}

main()
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  })
  .finally(() => {
    // Clean shutdown of Prisma on process exit.
    process.on('SIGINT', async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
