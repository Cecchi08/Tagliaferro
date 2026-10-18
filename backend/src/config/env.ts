import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
});

const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === 'production' && !parsed.FRONTEND_URL) {
  throw new Error('FRONTEND_URL debe configurarse en Vercel con el origen del frontend en producción.');
}
export const env = { ...parsed, FRONTEND_URL: parsed.FRONTEND_URL ?? 'http://localhost:5173' };
