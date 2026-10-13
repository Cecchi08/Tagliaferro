export function configureSupabaseTestDatabase() {
  const testUrl = process.env.DATABASE_URL_TEST?.trim();
  if (!testUrl) {
    throw new Error('Falta DATABASE_URL_TEST. Configurá un proyecto Supabase de pruebas antes de ejecutar las pruebas de integración.');
  }

  let test: URL;
  try { test = new URL(testUrl); }
  catch { throw new Error('DATABASE_URL_TEST no es una URL PostgreSQL válida del Session Pooler de Supabase.'); }

  if (!['postgres:', 'postgresql:'].includes(test.protocol) || !test.hostname.endsWith('.pooler.supabase.com') || test.port !== '5432') {
    throw new Error('DATABASE_URL_TEST debe apuntar al Session Pooler de Supabase por el puerto 5432.');
  }

  const primaryUrl = process.env.DATABASE_URL?.trim();
  if (primaryUrl) {
    try {
      const primary = new URL(primaryUrl);
      const sameDatabase = primary.hostname === test.hostname && primary.port === test.port && primary.username === test.username && primary.pathname === test.pathname;
      if (sameDatabase) throw new Error('DATABASE_URL_TEST apunta al mismo proyecto/base que DATABASE_URL. Las pruebas de integración se cancelaron.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('mismo proyecto/base')) throw error;
      // The production URL is not needed to validate the test URL; keep it out of diagnostics.
    }
  }

  process.env.DATABASE_URL = testUrl;
  return testUrl;
}
