import { z } from 'zod';
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load env vars before validation. In a monorepo the apps run with
 * `cwd = apps/backend`, but `.env` lives at the repo root — so we probe both the
 * local dir and two levels up. In Docker no `.env` exists (vars come from the
 * container environment), so this is a harmless no-op there. Idempotent: safe to
 * call from both `main.ts` (pre-bootstrap) and the ConfigModule loader.
 */
let envLoaded = false;
function ensureEnv() {
  if (envLoaded) return;
  envLoaded = true;
  for (const p of [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ]) {
    if (existsSync(p)) dotenv.config({ path: p });
  }
}

/**
 * Environment schema. Fails fast at boot if anything required is missing or
 * malformed — better than discovering a bad secret at request time.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900), // 15m
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000), // 30d

  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  ensureEnv();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Surface every problem at once instead of one-by-one.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    port: env.BACKEND_PORT,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    clientOrigin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()),
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
  };
}
