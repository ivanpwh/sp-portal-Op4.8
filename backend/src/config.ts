// Application settings, read from environment (was config.py / pydantic Settings).
// dotenv loads .env into process.env; defaults below mirror the old Python defaults.
import 'dotenv/config';

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const DEFAULT_SECRET = 'dev-secret-change-me-please-use-a-long-random-string';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

export const settings = {
  appName: 'SP Portal API',

  nodeEnv: str('NODE_ENV', 'development'),

  // Auth / JWT
  secretKey: str('SECRET_KEY', DEFAULT_SECRET),
  algorithm: 'HS256' as const,
  accessTokenExpireMinutes: int('ACCESS_TOKEN_EXPIRE_MINUTES', 60 * 24), // 24h

  // CORS — comma-separated list of allowed frontend origins.
  corsOrigins: str('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,https://effortless-starlight-0ed3fe.netlify.app,https://reunisoeropramono.web.id'),

  // First super-admin + default event, created automatically when DB is empty.
  bootstrapAdminEmail: str('BOOTSTRAP_ADMIN_EMAIL', 'admin@spportal.id'),
  bootstrapAdminPassword: str('BOOTSTRAP_ADMIN_PASSWORD', 'admin123'),
  bootstrapAdminName: str('BOOTSTRAP_ADMIN_NAME', 'Panitia Inti'),

  // WhatsApp/Email blasting not implemented yet — notifications are log-only.
  notificationsEnabled: bool('NOTIFICATIONS_ENABLED', false),

  port: int('PORT', 8000),
};

export const corsOriginList = settings.corsOrigins
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const isProduction = settings.nodeEnv === 'production';

/**
 * Refuse to boot in production with insecure defaults. Called once at startup
 * (see seed/bootstrap) so misconfiguration fails fast instead of silently
 * shipping a forgeable JWT key or the well-known admin123 password.
 */
export function assertProductionSafe(): void {
  if (!isProduction) return;
  const problems: string[] = [];
  if (settings.secretKey === DEFAULT_SECRET || settings.secretKey.length < 32) {
    problems.push('SECRET_KEY must be set to a random string of at least 32 characters.');
  }
  if (settings.bootstrapAdminPassword === DEFAULT_ADMIN_PASSWORD) {
    problems.push('BOOTSTRAP_ADMIN_PASSWORD must be changed from the default.');
  }
  if (problems.length) {
    throw new Error(
      'Refusing to start in production with insecure configuration:\n  - ' +
        problems.join('\n  - '),
    );
  }
}
