import { configureSupabaseTestDatabase } from '../testing/supabase-test-db.js';

try {
  configureSupabaseTestDatabase();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'DATABASE_URL_TEST no es válida.');
  process.exitCode = 1;
}
