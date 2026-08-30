import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';
import path from 'path';

// Load .env.test explicitly (NOT the developer's .env, which points at the
// docker-compose dev database) so `npm test` never touches sp_portal_dev or
// production. dotenv.config()'s `.parsed` is passed through as `test.env` so
// it reaches the worker processes even if they don't inherit process.env.
const parsed = loadEnv({ path: path.resolve(__dirname, '.env.test') }).parsed ?? {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: parsed,
    globalSetup: ['./test/globalSetup.ts'],
    // Integration test files share ONE real Postgres test DB and each resets
    // it in beforeEach/afterEach — running files in parallel would let one
    // file's resetDb() wipe data another file is mid-test with. Serialize.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
