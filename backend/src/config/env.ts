import 'dotenv/config';
import { z } from 'zod';

const frontendUrlSchema = z.string().trim().transform((input, context) => {
  const value = input.replace(/^['"]|['"]$/g, '').trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    context.addIssue({ code: 'custom', message: 'Usá el dominio del frontend, por ejemplo https://tienda.vercel.app' });
    return z.NEVER;
  }
});

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_URL: frontendUrlSchema.optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  MP_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  MP_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  PAYMENT_RETURN_URL: z.string().url().optional(),
});

const parsed = schema.parse(process.env);
const paymentValues = [parsed.MP_ACCESS_TOKEN, parsed.MP_WEBHOOK_SECRET, parsed.PUBLIC_API_URL, parsed.PAYMENT_RETURN_URL];
if (paymentValues.some(Boolean) && !paymentValues.every(Boolean)) {
  throw new Error('Para habilitar Mercado Pago, configurá MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, PUBLIC_API_URL y PAYMENT_RETURN_URL en conjunto.');
}
if (parsed.NODE_ENV === 'production' && !parsed.FRONTEND_URL) {
  throw new Error('FRONTEND_URL debe configurarse en Vercel con el dominio del frontend, por ejemplo https://tienda.vercel.app.');
}
if (parsed.NODE_ENV === 'production' && parsed.FRONTEND_URL) {
  const frontend = new URL(parsed.FRONTEND_URL);
  if (frontend.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(frontend.hostname)) {
    throw new Error('En producción, FRONTEND_URL debe ser el origen HTTPS público del frontend.');
  }
}
if (parsed.NODE_ENV === 'production' && paymentValues.every(Boolean)) {
  for (const value of [parsed.PUBLIC_API_URL!, parsed.PAYMENT_RETURN_URL!]) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error('Las URLs de Mercado Pago en producción deben usar HTTPS público.');
    }
  }
}
export const env = { ...parsed, FRONTEND_URL: parsed.FRONTEND_URL ?? 'http://localhost:5173' };
