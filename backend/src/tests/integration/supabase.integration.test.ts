import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { pool } from '../../config/db.js';
import { app } from '../../app.js';
import * as inventory from '../../modules/inventory/inventory.service.js';

const origin = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const password = 'Integration-Test-Only-Password-123!';
type Actor = { id: string; email: string; role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER' };
type Login = { cookie: string; csrf: string };
const actors: Actor[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
const variantIds: string[] = [];
const projectIds: string[] = [];
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
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_TEST_DATABASE !== 'true') {
    throw new Error('Esta suite crea y elimina fixtures: requiere una base aislada y ALLOW_DESTRUCTIVE_TEST_DATABASE=true. No usar producción.');
  }
  await pool.query('SELECT 1');
  const tables = await pool.query(
    `SELECT table_name,COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||table_name)),false) AS rls_enabled
     FROM unnest(ARRAY['pos_sales','pos_sale_items','store_orders','stock_reservations','projects','project_phases','project_tasks','project_task_events']::text[]) AS required(table_name)
     WHERE to_regclass('public.'||table_name) IS NOT NULL`,
  );
  if (tables.rows.length !== 8 || tables.rows.some((row) => !row.rls_enabled)) throw new Error('Faltan tablas esperadas o no tienen RLS habilitado en la base de pruebas.');
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
  const client = actors.length ? await pool.connect() : null;
  try {
    if (client) {
      await client.query('BEGIN');
      const actorIds = actors.map((actor) => actor.id);
      const { rows } = await client.query('SELECT id FROM pos_sales WHERE cashier_id=ANY($1::uuid[])', [actorIds]);
      const saleIds = rows.map((row) => row.id);
      if (variantIds.length || saleIds.length) await client.query('DELETE FROM inventory_movements WHERE variant_id=ANY($1::uuid[]) OR sale_id=ANY($2::uuid[])', [variantIds, saleIds]);
      if (saleIds.length) await client.query('DELETE FROM pos_sale_items WHERE sale_id=ANY($1::uuid[])', [saleIds]);
      if (saleIds.length) await client.query('DELETE FROM pos_sales WHERE id=ANY($1::uuid[])', [saleIds]);
      if (projectIds.length) {
        await client.query('DELETE FROM project_task_events WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id=ANY($1::uuid[]))', [projectIds]);
        await client.query('DELETE FROM project_tasks WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await client.query('DELETE FROM project_phases WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await client.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [projectIds]);
      }
      await client.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [actorIds]);
      if (variantIds.length) await client.query('DELETE FROM inventory WHERE variant_id=ANY($1::uuid[])', [variantIds]);
      if (variantIds.length) await client.query('DELETE FROM product_variants WHERE id=ANY($1::uuid[])', [variantIds]);
      if (productIds.length) await client.query('DELETE FROM products WHERE id=ANY($1::uuid[])', [productIds]);
      if (categoryIds.length) await client.query('DELETE FROM categories WHERE id=ANY($1::uuid[])', [categoryIds]);
      await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [actorIds]);
      await client.query('COMMIT');
    }
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    throw error;
  } finally {
    client?.release();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});

describe('integración real con PostgreSQL configurado en DATABASE_URL', () => {
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

    const concurrent = await Promise.allSettled([
      inventory.adjustStock(variantId, -4, 'Concurrente A', admin.id),
      inventory.adjustStock(variantId, -4, 'Concurrente B', admin.id),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await pool.query('SELECT on_hand FROM inventory WHERE variant_id=$1', [variantId])).rows[0].on_hand).toBe(1);
    const adminMovements = await request(`/api/v1/inventory/movements?q=IT-${suffix}`, adminLogin);
    expect(adminMovements.status).toBe(200);
    expect(adminMovements.body.movements.length).toBeGreaterThanOrEqual(3);
  });

  it('registra ventas POS de forma atómica e idempotente, y limita el historial al cajero', async () => {
    const variantId = variantIds[0]!;
    const sku = `IT-${suffix}`;
    expect((await request('/api/v1/pos/sales', customerLogin)).status).toBe(403);
    const customerSale = await request('/api/v1/pos/sales', customerLogin, 'POST', {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'OTHER', items: [{ variantId, quantity: 1 }],
    });
    expect(customerSale.status).toBe(403);

    const stockReceipt = await request('/api/v1/inventory/receipts', employeeLogin, 'POST', { variantId, quantity: 4, reason: 'Preparación de prueba POS' });
    expect(stockReceipt.status).toBe(201);
    await pool.query('UPDATE inventory SET reserved=1 WHERE variant_id=$1', [variantId]);

    const shortCash = await request('/api/v1/pos/sales', adminLogin, 'POST', {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'CASH', cashReceived: '19.99', items: [{ variantId, quantity: 2 }],
    });
    expect(shortCash.status).toBe(400);
    expect((await pool.query('SELECT on_hand,reserved FROM inventory WHERE variant_id=$1', [variantId])).rows[0]).toMatchObject({ on_hand: 5, reserved: 1 });

    const saleRequest = {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'CASH', cashReceived: '25.00',
      items: [{ variantId, quantity: 2 }],
    };
    const saleResponse = await request('/api/v1/pos/sales', adminLogin, 'POST', saleRequest);
    expect(saleResponse.status).toBe(201);
    const sale = saleResponse.body.sale;
    expect(sale.total).toBe('20.00');
    expect(sale.change_due).toBe('5.00');
    expect(sale.status).toBe('COMPLETED');
    expect(sale.payment_status).toBe('RECORDED');
    expect(sale.items).toMatchObject([{ sku, quantity: 2, unitPrice: '10.00', lineTotal: '20.00' }]);

    const retry = await request('/api/v1/pos/sales', adminLogin, 'POST', saleRequest);
    expect(retry.status).toBe(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.sale.id).toBe(sale.id);
    const changedRetry = await request('/api/v1/pos/sales', adminLogin, 'POST', { ...saleRequest, items: [{ variantId, quantity: 1 }] });
    expect(changedRetry.status).toBe(409);

    const overReserved = await request('/api/v1/pos/sales', adminLogin, 'POST', {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'OTHER', items: [{ variantId, quantity: 3 }],
    });
    expect(overReserved.status).toBe(409);
    expect((await pool.query('SELECT on_hand,reserved FROM inventory WHERE variant_id=$1', [variantId])).rows[0]).toMatchObject({ on_hand: 3, reserved: 1 });
    const saleMovement = await pool.query("SELECT delta,type,sale_id FROM inventory_movements WHERE variant_id=$1 AND type='POS_SALE'", [variantId]);
    expect(saleMovement.rows).toEqual([{ delta: -2, type: 'POS_SALE', sale_id: sale.id }]);

    const employeeSale = await request('/api/v1/pos/sales', employeeLogin, 'POST', {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'DEBIT_CARD', items: [{ variantId, quantity: 1 }],
    });
    expect(employeeSale.status).toBe(201);
    const simultaneousRequest = {
      idempotencyKey: crypto.randomUUID(), paymentMethod: 'OTHER', items: [{ variantId, quantity: 1 }],
    };
    const simultaneous = await Promise.all([
      request('/api/v1/pos/sales', adminLogin, 'POST', simultaneousRequest),
      request('/api/v1/pos/sales', adminLogin, 'POST', simultaneousRequest),
    ]);
    expect(simultaneous.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(simultaneous[0].body.sale.id).toBe(simultaneous[1].body.sale.id);
    const employeeHistory = await request('/api/v1/pos/sales', employeeLogin);
    expect(employeeHistory.body.sales.map((row: { id: string }) => row.id)).toContain(employeeSale.body.sale.id);
    expect(employeeHistory.body.sales.map((row: { id: string }) => row.id)).not.toContain(sale.id);
    const adminHistory = await request('/api/v1/pos/sales', adminLogin);
    expect(adminHistory.body.sales.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([sale.id, employeeSale.body.sale.id, simultaneous[0].body.sale.id]));
    expect((await request(`/api/v1/pos/sales/${sale.id}`, employeeLogin)).status).toBe(404);
    expect((await request(`/api/v1/pos/sales/${sale.id}`, adminLogin)).body.sale.id).toBe(sale.id);
    expect((await request('/api/v1/pos/sales', customerLogin)).status).toBe(403);
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

  it('restringe proyectos por rol, asigna tareas y registra progreso', async () => {
    expect((await request('/api/v1/store/orders', customerLogin)).status).toBe(200);
    expect((await request('/api/v1/store/orders', adminLogin)).status).toBe(403);
    expect((await request('/api/v1/store/orders', employeeLogin)).status).toBe(403);
    const created = await request('/api/v1/projects', adminLogin, 'POST', { title: `Proyecto ${suffix}`, description: 'Fixture identificable de integración', status: 'ACTIVE' });
    expect(created.status).toBe(201);
    const projectId = created.body.project.id as string;
    projectIds.push(projectId);
    const phase = await request(`/api/v1/projects/${projectId}/phases`, adminLogin, 'POST', { title: 'Ejecución', position: 1 });
    expect(phase.status).toBe(201);
    expect((await request(`/api/v1/projects/${projectId}/phases/${phase.body.phase.id}`, employeeLogin, 'PATCH', { title: 'No permitido' })).status).toBe(403);
    expect((await request(`/api/v1/projects/${projectId}/phases/${phase.body.phase.id}`, adminLogin, 'PATCH', { title: 'Ejecución revisada', status: 'ACTIVE' })).status).toBe(200);
    const task = await request(`/api/v1/projects/${projectId}/tasks`, adminLogin, 'POST', { phaseId: phase.body.phase.id, title: `Tarea ${suffix}`, assigneeId: employee.id, priority: 'HIGH' });
    expect(task.status).toBe(201);
    expect((await request('/api/v1/projects', employeeLogin)).body.projects.map((p: {id:string})=>p.id)).toContain(projectId);
    expect((await request(`/api/v1/projects/${projectId}`, customerLogin)).status).toBe(403);
    expect((await request(`/api/v1/projects/tasks/${task.body.task.id}`, customerLogin, 'PATCH', { status: 'DONE' })).status).toBe(403);
    expect((await request(`/api/v1/projects/${projectId}`, adminLogin, 'PATCH', { status: 'COMPLETED' })).status).toBe(409);
    expect((await request(`/api/v1/projects/tasks/${task.body.task.id}`, employeeLogin, 'PATCH', { status: 'DONE' })).status).toBe(200);
    expect((await request(`/api/v1/projects/${projectId}`, adminLogin, 'PATCH', { status: 'COMPLETED' })).status).toBe(200);
    const events = await pool.query(`SELECT count(*)::int count FROM project_task_events e JOIN project_tasks t ON t.id=e.task_id WHERE t.project_id=$1`, [projectId]);
    expect(events.rows[0].count).toBeGreaterThanOrEqual(2);
    expect((await request(`/api/v1/projects/${projectId}/phases/${phase.body.phase.id}`, adminLogin, 'DELETE', {})).status).toBe(409);
    expect((await request(`/api/v1/projects/tasks/${task.body.task.id}`, employeeLogin, 'DELETE', {})).status).toBe(403);
    expect((await request(`/api/v1/projects/tasks/${task.body.task.id}`, adminLogin, 'DELETE', {})).status).toBe(204);
    expect((await request(`/api/v1/projects/${projectId}/phases/${phase.body.phase.id}`, adminLogin, 'DELETE', {})).status).toBe(204);
    expect((await request('/api/v1/pos/sales', customerLogin)).status).toBe(403);
  });
});
