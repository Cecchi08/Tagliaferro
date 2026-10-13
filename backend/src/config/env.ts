import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  COOKIE_SECURE: z.string().default('false').transform((v) => v === 'true'),
  SESSION_COOKIE_NAME: z.string().min(1).default('tienda_session'),
  INITIAL_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),
  INITIAL_ADMIN_PASSWORD: z.string().min(12).optional().or(z.literal('')),
});

export const env = schema.parse(process.env);
