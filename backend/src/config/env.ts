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
  MP_ACCESS_TOKEN: z.string().refine((v) => !v || v.startsWith('TEST-'), 'MP_ACCESS_TOKEN debe ser una credencial de prueba TEST-').optional().or(z.literal('')),
  MP_WEBHOOK_SECRET: z.string().optional().or(z.literal('')),
  PUBLIC_API_URL: z.string().url().optional().or(z.literal('')),
  CRON_SECRET: z.string().optional().or(z.literal('')),
  PAYMENT_RETURN_URL: z.string().url().default('http://localhost:5173/?payment=return'),
});

const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === 'production' && parsed.FRONTEND_URL === 'http://localhost:5173') {
  throw new Error('FRONTEND_URL debe configurarse con el origen HTTPS del frontend en producción.');
}
if (parsed.NODE_ENV === 'production' && parsed.PAYMENT_RETURN_URL.startsWith('http://localhost')) {
  throw new Error('PAYMENT_RETURN_URL debe configurarse con una URL HTTPS pública en producción.');
}
export const env = parsed;
