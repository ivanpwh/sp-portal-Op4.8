// Single shared PrismaClient instance (was database.py SessionLocal/engine).
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// SQLite-only tuning — skipped when using PostgreSQL.
export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
  }
}
