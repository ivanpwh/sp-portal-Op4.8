// Express app setup: CORS, JSON body parsing, routers, meta routes, error handler.
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOriginList, isProduction, settings } from './config';
import { HttpError } from './errors';
import { publicRouter } from './routes/public';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';

export function createApp() {
  const app = express();

  // Behind a reverse proxy in production (so req.ip / rate-limiting key on the
  // real client IP from X-Forwarded-For rather than the proxy address).
  if (isProduction) app.set('trust proxy', 1);

  // Baseline security headers (this is a JSON API, so CSP isn't needed here).
  app.use(helmet());

  app.use(
    cors({
      origin: corsOriginList,
      // Bearer tokens are sent in the Authorization header, not cookies — no
      // credentialed (cookie) requests, so keep this off and list headers
      // explicitly (a literal '*' is invalid for credentialed CORS anyway).
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json());

  // Meta routes.
  app.get('/', (_req, res) => {
    res.json({ name: settings.appName, version: '3.2.0', health: '/api/health' });
  });
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: settings.appName,
      notifications_enabled: settings.notificationsEnabled,
    });
  });

  // Feature routers. Public is mounted under /api so its paths line up with the
  // FastAPI router (which used prefix="/api").
  app.use('/api', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);

  // Central error handler — returns { detail } so the frontend can read it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ detail: err.message });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ detail: 'Terjadi kesalahan pada server.' });
  });

  return app;
}
