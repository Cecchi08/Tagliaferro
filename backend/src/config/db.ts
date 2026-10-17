import pg from 'pg';
import { env } from './env.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  // Each warm serverless instance reuses one pool. Keep per-instance
  // concurrency modest so parallel Vercel instances fit Supabase limits.
  max: 3,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: env.NODE_ENV === 'development' && /localhost|127\.0\.0\.1/.test(env.DATABASE_URL)
    ? false
    : { rejectUnauthorized: false },
});

pool.on('error', () => console.error('Error inesperado en una conexión inactiva de PostgreSQL.'));
