import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors.js';
import type { AuthUser, Role } from './types.js';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (r: { id: string; name: string; email: string; role: Role; active: boolean }): AuthUser => r;

export async function register(name: string, email: string, password: string) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    const result = await pool.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'CUSTOMER') RETURNING id,name,email,role,active`,
      [name.trim(), email.trim().toLowerCase(), hash],
    );
    return publicUser(result.rows[0]);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') throw new AppError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese email.');
    throw e;
  }
}

export async function login(email: string, password: string) {
  const result = await pool.query('SELECT id,name,email,password_hash,role,active FROM users WHERE email=$1', [email.toLowerCase()]);
  const row = result.rows[0];
  if (!row || !row.active || !(await argon2.verify(row.password_hash, password))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
  await pool.query('INSERT INTO sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,$4)', [row.id, tokenHash(token), csrfToken, expires]);
  return { user: publicUser(row), token, csrfToken };
}

export async function authenticate(token: string | undefined) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id,u.name,u.email,u.role,u.active,s.csrf_token
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active=true`, [tokenHash(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { user: publicUser(row), csrfToken: row.csrf_token as string };
}

export async function logout(token: string | undefined) {
  if (token) await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash(token)]);
}

export async function listUsers() {
  const { rows } = await pool.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC');
  return rows;
}

export async function createEmployee(name: string, email: string, password: string) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    const { rows } = await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'EMPLOYEE') RETURNING id,name,email,role,active,created_at`, [name.trim(), email.trim().toLowerCase(), hash]);
    return rows[0];
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') throw new AppError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese email.');
    throw e;
  }
}

export async function deactivateUser(id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('UPDATE users SET active=false, updated_at=now() WHERE id=$1 AND active=true RETURNING id', [id]);
    if (!rows[0]) throw new AppError(404, 'USER_NOT_FOUND', 'No se encontró un usuario activo.');
    await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export async function reactivateEmployee(id: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id,role,active FROM users WHERE id=$1 FOR UPDATE', [id]);
    const employee = rows[0];
    if (!employee) throw new AppError(404, 'USER_NOT_FOUND', 'No se encontró el usuario.');
    if (employee.role !== 'EMPLOYEE') throw new AppError(409, 'NOT_AN_EMPLOYEE', 'Solo se pueden reactivar cuentas de empleados.');
    if (employee.active) throw new AppError(409, 'USER_ALREADY_ACTIVE', 'El empleado ya está activo.');
    await client.query('UPDATE users SET active=true, updated_at=now() WHERE id=$1', [id]);
    // Las sesiones revocadas durante la desactivación permanecen revocadas.
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export async function createInitialAdmin(email: string, password: string) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const normalized = email.toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(78123456)');
    const { rows } = await client.query('SELECT id,role FROM users WHERE email=$1 FOR UPDATE', [normalized]);
    if (rows[0]) {
      if (rows[0].role !== 'ADMIN') throw new Error('El email configurado ya pertenece a un usuario que no es administrador.');
      await client.query('COMMIT'); return 'already-exists';
    }
    const count = await client.query("SELECT count(*)::int AS n FROM users WHERE role='ADMIN'");
    if (count.rows[0].n > 0) throw new Error('Ya existe un administrador; no se creó otro.');
    await client.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'ADMIN')`, ['Administrador', normalized, hash]);
    await client.query('COMMIT'); return 'created';
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
