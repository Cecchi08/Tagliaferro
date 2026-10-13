import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { configureSupabaseTestDatabase } from '../../testing/supabase-test-db.js';

// This suite refuses to load the application or pool until the isolated test URL is approved.
configureSupabaseTestDatabase();
const [{ pool }, { app }, , inventory] = await Promise.all([
  import('../../config/db.js'),
  import('../../app.js'),
  import('../../modules/auth/auth.service.js'),
  import('../../modules/inventory/inventory.service.js'),
]);

const origin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const password = 'Integration-Test-Only-Password-123!';
type Actor = { id: string; email: string; role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER' };
type Login = { cookie: string; csrf: string };
const actors: Actor[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
const variantIds: string[] = [];
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let admin: Actor;
let employee: Actor;
let customer: Actor;
let adminLogin: Login;
let employeeLogin: Login;
let customerLogin: Login;

async function request(path: string, login?: Login, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(login ? { cookie: login.cookie, 'x-csrf-token': login.csrf } : {}),
      ...(method === 'GET' ? {} : { origin }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function loginActor(actor: Actor): Promise<Login> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: actor.email, password }),
  });
  const body = await response.json() as { csrfToken: string };
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!response.ok || !cookie) throw new Error(`No se pudo iniciar sesión para actor de prueba (${actor.role}).`);
  return { cookie, csrf: body.csrfToken };
}

async function seedActor(role: Actor['role']): Promise<Actor> {
  const email = `stage3-${role.toLowerCase()}-${suffix}@example.test`;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const { rows } = await pool.query(
    'INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,role',
    [`Integration ${role}`, email, hash, role],
  );
  const actor = rows[0] as Actor;
  actors.push(actor);
  return actor;
}

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el servidor de integración.');
  baseUrl = `http://127.0.0.1:${address.port}`;
  admin = await seedActor('ADMIN');
  employee = await seedActor('EMPLOYEE');
  customer = await seedActor('CUSTOMER');
  const logins = await Promise.all([admin, employee, customer].map(loginActor));
  adminLogin = logins[0]!;
  employeeLogin = logins[1]!;
  customerLogin = logins[2]!;
}, 30_000);

afterAll(async () => {
  try {
    if (variantIds.length) await pool.query('DELETE FROM inventory_movements WHERE variant_id=ANY($1::uuid[])', [variantIds]);
    if (actors.length) await pool.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [actors.map((a) => a.id)]);
    if (variantIds.length) await pool.query('DELETE FROM inventory WHERE variant_id=ANY($1::uuid[])', [variantIds]);
    if (variantIds.length) await pool.query('DELETE FROM product_variants WHERE id=ANY($1::uuid[])', [variantIds]);
    if (productIds.length) await pool.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]);
    if (categoryIds.length) await pool.query('DELETE FROM categories WHERE id=ANY($1::uuid[])', [categoryIds]);
    if (actors.length) await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [actors.map((a) => a.id)]);
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

describe('integración real con Supabase de pruebas', () => {
  it('aplica los permisos por rol y oculta productos/variantes inactivos al catálogo público', async () => {
    const categoryResponse = await request('/api/v1/catalog/categories', adminLogin, 'POST', { name: `Integration ${suffix}`, slug: `integration-${suffix}` });
    expect(categoryResponse.status).toBe(201);
    const categoryId = categoryResponse.body.category.id as string;
    categoryIds.push(categoryId);
    const productResponse = await request('/api/v1/catalog/products', adminLogin, 'POST', { categoryId, name: `Integration product ${suffix}` });
    expect(productResponse.status).toBe(201);
    const productId = productResponse.body.product.id as string;
    productIds.push(productId);
    const variantResponse = await request(`/api/v1/catalog/products/${productId}/variants`, adminLogin, 'POST', { sku: `IT-${suffix}`, size: 'M', color: 'Blue', price: '10.00' });
    expect(variantResponse.status).toBe(201);
    const variantId = variantResponse.body.variant.id as string;
    variantIds.push(variantId);

    expect((await request('/api/v1/inventory', customerLogin)).status).toBe(403);
    expect((await request('/api/v1/inventory/receipts', customerLogin, 'POST', { variantId, quantity: 1, reason: 'Recepción de prueba' })).status).toBe(403);
    expect((await request('/api/v1/inventory/adjustments', employeeLogin, 'POST', { variantId, delta: 1, reason: 'Ajuste de prueba' })).status).toBe(403);
    expect((await request('/api/v1/inventory/movements', employeeLogin)).status).toBe(403);
    expect((await request('/api/v1/catalog/categories', employeeLogin, 'POST', { name: 'No permitido', slug: `forbidden-${suffix}` })).status).toBe(403);
    expect((await request('/api/v1/catalog/products', employeeLogin, 'POST', { categoryId, name: 'No permitido' })).status).toBe(403);
    expect((await request(`/api/v1/catalog/products/${productId}`, employeeLogin, 'PATCH', { name: 'No permitido' })).status).toBe(403);
    expect((await request(`/api/v1/catalog/variants/${variantId}`, employeeLogin, 'PATCH', { active: false })).status).toBe(403);
    expect((await request(`/api/v1/catalog/categories/${categoryId}`, employeeLogin, 'PATCH', { name: 'No permitido' })).status).toBe(403);

    expect((await request(`/api/v1/catalog/categories/${categoryId}`, adminLogin, 'PATCH', { name: `Updated ${suffix}` })).status).toBe(200);
    expect((await request(`/api/v1/catalog/products/${productId}`, adminLogin, 'PATCH', { description: 'Actualizado por integración' })).status).toBe(200);

    const receipt = await request('/api/v1/inventory/receipts', employeeLogin, 'POST', { variantId, quantity: 8, reason: 'Stock inicial de integración' });
    expect(receipt.status).toBe(201);
    expect(receipt.body.result.movement.type).toBe('RECEIPT');
    const publicProduct = await request(`/api/v1/catalog/products/${productId}`);
    expect(publicProduct.status).toBe(200);
    expect(publicProduct.body.product.variants.map((v: { sku: string }) => v.sku)).toContain(`IT-${suffix}`);

    await request(`/api/v1/catalog/variants/${variantId}`, adminLogin, 'PATCH', { active: false });
    const withoutInactiveVariant = await request(`/api/v1/catalog/products/${productId}`);
    expect(withoutInactiveVariant.body.product.variants).toHaveLength(0);
    await request(`/api/v1/catalog/products/${productId}`, adminLogin, 'PATCH', { active: false });
    expect((await request(`/api/v1/catalog/products/${productId}`)).status).toBe(404);
    expect((await request(`/api/v1/catalog/products/${productId}?includeInactive=true`, adminLogin)).status).toBe(200);
  });

  it('persiste entradas y ajustes, protege reservas y serializa cambios concurrentes', async () => {
    const { rows } = await pool.query('SELECT id FROM categories WHERE id=ANY($1::uuid[])', [categoryIds]);
    expect(rows).toHaveLength(1);
    const { rows: variantRows } = await pool.query('SELECT id FROM product_variants WHERE id=ANY($1::uuid[])', [variantIds]);
    expect(variantRows).toHaveLength(1);
    // Re-enable only this fixture to test inventory operations after catalog visibility checks.
    await pool.query('UPDATE products SET active=true WHERE id=ANY($1::uuid[])', [productIds]);
    await pool.query('UPDATE product_variants SET active=true WHERE id=ANY($1::uuid[])', [variantIds]);
    const variantId = variantIds[0]!;

    const adjustment = await request('/api/v1/inventory/adjustments', adminLogin, 'POST', { variantId, delta: -3, reason: 'Corrección de integración' });
    expect(adjustment.status).toBe(201);
    expect(adjustment.body.result.movement.type).toBe('ADJUSTMENT');
    const movementRows = await pool.query('SELECT type,delta FROM inventory_movements WHERE variant_id=$1 ORDER BY created_at', [variantId]);
    expect(movementRows.rows.map((r) => r.type)).toEqual(['RECEIPT', 'ADJUSTMENT']);

    await pool.query('UPDATE inventory SET reserved=4 WHERE variant_id=$1', [variantId]);
    const belowReserved = await request('/api/v1/inventory/adjustments', adminLogin, 'POST', { variantId, delta: -2, reason: 'Debajo de reserva' });
    expect(belowReserved.status).toBe(409);
    expect((await pool.query('SELECT on_hand,reserved FROM inventory WHERE variant_id=$1', [variantId])).rows[0]).toMatchObject({ on_hand: 5, reserved: 4 });
    await pool.query('UPDATE inventory SET reserved=0,on_hand=5 WHERE variant_id=$1', [variantId]);
    expect((await request('/api/v1/inventory/adjustments', adminLogin, 'POST', { variantId, delta: -6, reason: 'Stock negativo' })).status).toBe(409);

    await expect(inventory.adjustStock(variantId, -1, 'x'.repeat(501), admin.id)).rejects.toBeDefined();
    expect((await pool.query('SELECT on_hand FROM inventory WHERE variant_id=$1', [variantId])).rows[0].on_hand).toBe(5);

    const concurrent = await Promise.all([
      inventory.adjustStock(variantId, -4, 'Concurrente A', admin.id),
      inventory.adjustStock(variantId, -4, 'Concurrente B', admin.id),
    ]);
    expect(concurrent.filter((result) => result !== undefined)).toHaveLength(1);
    expect((await pool.query('SELECT on_hand FROM inventory WHERE variant_id=$1', [variantId])).rows[0].on_hand).toBe(1);
    const adminMovements = await request(`/api/v1/inventory/movements?q=IT-${suffix}`, adminLogin);
    expect(adminMovements.status).toBe(200);
    expect(adminMovements.body.movements.length).toBeGreaterThanOrEqual(3);
  });

  it('revoca las sesiones de empleados al desactivar y no las restaura al reactivar', async () => {
    const target = await seedActor('EMPLOYEE');
    const targetLogin = await loginActor(target);
    const { rows: sessionRows } = await pool.query("SELECT id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1", [target.id]);
    const sessionId = sessionRows[0].id as string;

    expect((await request(`/api/v1/auth/users/${target.id}/deactivate`, employeeLogin, 'POST', {})).status).toBe(403);
    expect((await request(`/api/v1/auth/users/${target.id}/deactivate`, adminLogin, 'POST', {})).status).toBe(204);
    const revoked = await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [sessionId]);
    expect(revoked.rows[0].revoked_at).not.toBeNull();
    expect((await request('/api/v1/inventory', targetLogin)).status).toBe(403);
    expect((await request(`/api/v1/auth/users/${target.id}/reactivate`, employeeLogin, 'POST', {})).status).toBe(403);
    expect((await request(`/api/v1/auth/users/${target.id}/reactivate`, adminLogin, 'POST', {})).status).toBe(204);
    expect((await pool.query('SELECT active FROM users WHERE id=$1', [target.id])).rows[0].active).toBe(true);
    expect((await pool.query('SELECT revoked_at FROM sessions WHERE id=$1', [sessionId])).rows[0].revoked_at).not.toBeNull();
    expect((await request('/api/v1/inventory', targetLogin)).status).toBe(401);
  });
});
