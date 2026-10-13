import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { createInitialAdmin } from '../modules/auth/auth.service.js';
try {
  if (!env.INITIAL_ADMIN_EMAIL || !env.INITIAL_ADMIN_PASSWORD) throw new Error('Completá INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD en backend/.env (mínimo 12 caracteres).');
  const result = await createInitialAdmin(env.INITIAL_ADMIN_EMAIL, env.INITIAL_ADMIN_PASSWORD);
  console.log(result === 'created' ? 'Administrador inicial creado.' : 'El administrador indicado ya existe; no se modificó.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo inicializar el administrador.'); process.exitCode = 1;
} finally { await pool.end(); }
