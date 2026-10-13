import { configureSupabaseTestDatabase } from '../testing/supabase-test-db.js';

configureSupabaseTestDatabase();
const { pool } = await import('../config/db.js');
const requiredMigrations = ['1791849600000_users_and_sessions','1791936000000_product_catalog_inventory'];
try {
  await pool.query('SELECT 1');
  const { rows } = await pool.query('SELECT name FROM public.pgmigrations WHERE name = ANY($1::text[])', [requiredMigrations]);
  const applied = new Set(rows.map((row) => row.name));
  const missing = requiredMigrations.filter((name) => !applied.has(name));
  if (missing.length) throw new Error(`Faltan migraciones en la base de pruebas: ${missing.join(', ')}. Ejecutá npm run db:migrate:test.`);
  const { rows: tables } = await pool.query(
    `SELECT table_name, (to_regclass('public.'||table_name) IS NOT NULL) AS table_exists,
       COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||table_name)),false) AS rls_enabled
     FROM unnest($1::text[]) AS required(table_name)`,
    [['users','sessions','categories','products','product_variants','inventory','inventory_movements']],
  );
  if (tables.some((row) => !row.table_exists || !row.rls_enabled)) throw new Error('Faltan tablas o RLS en la base de pruebas. Revisá sus migraciones.');
  console.log('Conexión de pruebas, migraciones y RLS verificados.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo comprobar la base de pruebas.');
  process.exitCode = 1;
} finally { await pool.end(); }
