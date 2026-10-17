import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { expireSafeOrders } from './modules/commerce/commerce.service.js';

try {
  await pool.query('SELECT 1');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') console.error('No se pudo validar el certificado TLS. Descargá el CA desde Supabase y guardalo en DATABASE_SSL_CA_PATH.');
  else console.error('No se pudo conectar a PostgreSQL. Verificá DATABASE_URL y el estado de Supabase.');
  await pool.end();
  process.exit(1);
}

const server = app.listen(env.PORT, () => console.log(`API disponible en http://localhost:${env.PORT}`));
const reservationSweep = env.MP_ACCESS_TOKEN ? setInterval(() => {
  void expireSafeOrders().catch(() => console.error('No se pudieron conciliar reservas vencidas; permanecen retenidas.'));
}, 60_000) : undefined;
reservationSweep?.unref();
let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  if (reservationSweep) clearInterval(reservationSweep);
  console.log(`Cerrando API (${signal}).`);
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
