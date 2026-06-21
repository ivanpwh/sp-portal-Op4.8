// Single shared PrismaClient instance (was database.py SessionLocal/engine).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * SQLite tuning, applied once at startup. WAL lets readers run concurrently with
 * a writer (the default rollback journal blocks them), and busy_timeout makes a
 * blocked writer wait/retry instead of failing immediately with SQLITE_BUSY —
 * both matter once several committees/registrants hit the API at once.
 * journal_mode=WAL is persisted in the DB file; busy_timeout is per-connection.
 */
export async function initDb(): Promise<void> {
  await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
  await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
}
