import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL no está configurada.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.NODE_ENV === 'development' && /localhost|127\.0\.0\.1/.test(url)
    ? false
    : { rejectUnauthorized: false },
});

const requiredTables = [
  'users','sessions','categories','products','product_variants','inventory','inventory_movements',
  'pos_sales','pos_sale_items','store_orders','store_order_items','stock_reservations',
  'payment_notifications','projects','project_phases','project_tasks','project_task_events',
];
const requiredMigrations = [
  '1791849600000_users_and_sessions','1791936000000_product_catalog_inventory',
  '1791985668046_pos_sales','1792072000000_store_orders_payments_projects',
];

try {
  await pool.query('SELECT 1');
  console.log('SELECT 1: conexión PostgreSQL disponible.');
  const migrations = await pool.query('SELECT name FROM public.pgmigrations WHERE name=ANY($1::text[])', [requiredMigrations]);
  const applied = new Set(migrations.rows.map((row) => row.name));
  const missingMigrations = requiredMigrations.filter((name) => !applied.has(name));
  if (missingMigrations.length) throw new Error(`Faltan migraciones: ${missingMigrations.join(', ')}. Ejecutá npm run db:migrate.`);
  const { rows } = await pool.query(
    `SELECT table_name, (to_regclass('public.'||table_name) IS NOT NULL) AS table_exists,
       COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||table_name)),false) AS rls_enabled
     FROM unnest($1::text[]) AS required(table_name)`, [requiredTables],
  );
  const missing = rows.filter((row) => !row.table_exists || !row.rls_enabled);
  if (missing.length) throw new Error('Faltan tablas o RLS. Ejecutá npm run db:migrate.');
  console.log('Conexión, esquema y RLS verificados.');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const category = code === '28P01' ? 'Falló la autenticación: revisá usuario/contraseña y el encoding de caracteres reservados.'
    : error instanceof TypeError && error.message === 'Invalid URL' ? 'DATABASE_URL no se puede interpretar. Codificá los caracteres reservados de la contraseña (%23, %3F, %2F, %40, %3A).'
    : code === 'ENOTFOUND' ? 'No se resolvió el host de PostgreSQL; revisá el hostname del pooler y DNS.'
    : code === 'ECONNREFUSED' ? 'El host rechazó la conexión; revisá host/puerto y disponibilidad del pooler.'
    : code === 'ETIMEDOUT' || code === 'ECONNRESET' ? 'La conexión expiró o fue interrumpida; revisá red/firewall y pooler.'
    : code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ? 'Falló la validación TLS del certificado.'
    : undefined;
  console.error(category ?? (error instanceof Error ? error.message : 'No se pudo comprobar PostgreSQL.'));
  if (code) console.error(`Código del driver PostgreSQL/red: ${code}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
