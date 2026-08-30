// Vitest globalSetup: runs ONCE (in a separate process, before any test file/
// worker starts) so the Prisma schema push against the test DB never races
// with itself across parallel test workers (see test/db.ts for the per-test
// availability check). Silently no-ops when the test DB isn't reachable —
// integration test files detect that themselves via dbAvailable() and skip.
import { execSync } from 'child_process';
import path from 'path';
import { config as loadEnv } from 'dotenv';

export default function setup(): void {
  const parsed = loadEnv({ path: path.resolve(__dirname, '../.env.test') }).parsed ?? {};
  const env = { ...process.env, ...parsed };
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: path.resolve(__dirname, '..'),
      env,
      stdio: 'ignore',
    });
  } catch {
    // Test DB unreachable — integration tests will skip themselves.
  }
}
