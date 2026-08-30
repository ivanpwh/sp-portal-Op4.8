// Shared helper for integration tests: checks whether the local Postgres test
// database (sp_portal_test, see backend/.env.test) is reachable, and truncates
// all tables between tests. Integration tests must call `dbAvailable()` and
// skip themselves (describe.skipIf) rather than fail hard when no local
// Postgres is running — see the DB constraint in the test-suite task brief.
// The schema itself is pushed once in test/globalSetup.ts (a single process,
// so it can never race with itself across parallel test-file workers).
import { prisma } from '../src/db';

let cached: boolean | null = null;

export async function dbAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    await prisma.$queryRaw`SELECT 1`;
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Delete all rows from every table, in FK-safe order. Call in beforeEach/afterEach. */
export async function resetDb(): Promise<void> {
  await prisma.notificationLog.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.registrationSession.deleteMany();
  await prisma.committee.deleteMany();
  await prisma.eventSettings.deleteMany();
}
