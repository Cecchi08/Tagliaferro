import { pool } from '../config/db.js';

const requiredTables = ['users','sessions','categories','products','product_variants','inventory','inventory_movements','pos_sales','pos_sale_items'];
const requiredMigrations = ['1791849600000_users_and_sessions','1791936000000_product_catalog_inventory','1791985668046_pos_sales'];
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
  if (code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') console.error('No se pudo validar el certificado TLS.');
  else console.error(error instanceof Error ? error.message : 'No se pudo comprobar la base de datos.');
  process.exitCode = 1;
} finally { await pool.end(); }
