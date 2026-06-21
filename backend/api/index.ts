// Vercel serverless entry point — wraps the Express app with one-time initialization.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/app';
import { bootstrap } from '../src/seed';
import { initDb } from '../src/db';
import { assertProductionSafe } from '../src/config';

assertProductionSafe();

const app = createApp();

let initialized = false;
async function initialize() {
  if (!initialized) {
    await initDb();
    await bootstrap();
    initialized = true;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await initialize();
  return app(req as any, res as any);
}
