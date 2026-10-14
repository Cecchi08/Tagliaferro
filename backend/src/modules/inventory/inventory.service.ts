import { pool } from '../../config/db.js';
import { AppError } from '../../common/errors.js';
import type { PoolClient } from 'pg';
import { insertInventoryMovement, lockActiveInventory, updateOnHand } from './stock-operations.js';

type DbClient = PoolClient;

async function transaction<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'DUPLICATE_SKU', 'Ya existe una variante con ese SKU.');
    }
    throw error;
  } finally { client.release(); }
}

export async function listCategories(includeInactive = false) {
  const { rows } = await pool.query(
    `SELECT id,name,slug,active,created_at,updated_at FROM categories
     WHERE ($1::boolean OR active=true) ORDER BY name`, [includeInactive],
  );
  return rows;
}

export async function createCategory(name: string, slug: string) {
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING id,name,slug,active,created_at,updated_at',
      [name.trim(), slug.trim().toLowerCase()],
    );
    return rows[0];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new AppError(409, 'CATEGORY_SLUG_IN_USE', 'Ya existe una categoría con ese slug.');
    throw error;
  }
}

export async function updateCategory(id: string, input: { name?: string; slug?: string; active?: boolean }) {
  try {
    const { rows } = await pool.query(
      `UPDATE categories SET name=COALESCE($2,name),slug=COALESCE($3,slug),active=COALESCE($4,active),updated_at=now()
       WHERE id=$1 RETURNING id,name,slug,active,created_at,updated_at`,
      [id, input.name?.trim() ?? null, input.slug?.trim().toLowerCase() ?? null, input.active ?? null],
    );
    if (!rows[0]) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
    return rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new AppError(409, 'CATEGORY_SLUG_IN_USE', 'Ya existe una categoría con ese slug.');
    throw error;
  }
}

const catalogSelect = `
  SELECT p.id,p.category_id,p.name,p.description,p.brand,p.sport,p.active,p.created_at,p.updated_at,
    c.name AS category_name,c.slug AS category_slug,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price',v.price::text,'active',v.active,
      'onHand',i.on_hand,'reserved',i.reserved,'available',i.on_hand-i.reserved,
      'lowStockThreshold',i.low_stock_threshold,'lowStock',(i.on_hand-i.reserved)<=i.low_stock_threshold
    ) ORDER BY v.sku) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
  FROM products p JOIN categories c ON c.id=p.category_id
  LEFT JOIN product_variants v ON v.product_id=p.id AND ($1::boolean OR v.active=true)
  LEFT JOIN inventory i ON i.variant_id=v.id`;

export async function listProducts(filters: { query?: string; categoryId?: string; includeInactive?: boolean }) {
  const { rows } = await pool.query(
    `${catalogSelect}
     WHERE ($1::boolean OR (p.active=true AND c.active=true))
       AND ($2::uuid IS NULL OR p.category_id=$2)
       AND ($3::text IS NULL OR p.name ILIKE '%'||$3||'%' OR p.brand ILIKE '%'||$3||'%' OR p.sport ILIKE '%'||$3||'%' OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id=p.id AND sv.sku ILIKE '%'||$3||'%'))
     GROUP BY p.id,c.id ORDER BY p.name LIMIT 200`,
    [filters.includeInactive ?? false, filters.categoryId ?? null, filters.query?.trim() || null],
  );
  return rows;
}

export async function getProduct(id: string, includeInactive = false) {
  const { rows } = await pool.query(
    `SELECT p.id,p.category_id,p.name,p.description,p.brand,p.sport,p.active,p.created_at,p.updated_at,
       c.name AS category_name,c.slug AS category_slug,
       COALESCE(jsonb_agg(jsonb_build_object(
         'id',v.id,'sku',v.sku,'size',v.size,'color',v.color,'price',v.price::text,'active',v.active,
         'onHand',i.on_hand,'reserved',i.reserved,'available',i.on_hand-i.reserved,
         'lowStockThreshold',i.low_stock_threshold,'lowStock',(i.on_hand-i.reserved)<=i.low_stock_threshold
       ) ORDER BY v.sku) FILTER (WHERE v.id IS NOT NULL), '[]'::jsonb) AS variants
     FROM products p JOIN categories c ON c.id=p.category_id
     LEFT JOIN product_variants v ON v.product_id=p.id AND ($2::boolean OR v.active=true)
     LEFT JOIN inventory i ON i.variant_id=v.id
     WHERE p.id=$1 AND ($2::boolean OR (p.active=true AND c.active=true))
     GROUP BY p.id,c.id`, [id, includeInactive],
  );
  if (!rows[0]) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto.');
  return rows[0];
}

export async function createProduct(input: { categoryId: string; name: string; description: string; brand: string; sport: string }) {
  const { rows } = await pool.query(
    `INSERT INTO products(category_id,name,description,brand,sport)
     SELECT id,$2,$3,$4,$5 FROM categories WHERE id=$1 AND active=true
     RETURNING id,category_id,name,description,brand,sport,active,created_at,updated_at`,
    [input.categoryId, input.name.trim(), input.description.trim(), input.brand.trim(), input.sport.trim()],
  );
  if (!rows[0]) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'No se encontró una categoría activa.');
  return rows[0];
}

export async function updateProduct(id: string, input: { categoryId?: string; name?: string; description?: string; brand?: string; sport?: string; active?: boolean }) {
  if (input.categoryId) {
    const category = await pool.query('SELECT 1 FROM categories WHERE id=$1 AND active=true', [input.categoryId]);
    if (!category.rowCount) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'No se encontró una categoría activa.');
  }
  const { rows } = await pool.query(
    `UPDATE products SET category_id=COALESCE($2,category_id),name=COALESCE($3,name),description=COALESCE($4,description),
       brand=COALESCE($5,brand),sport=COALESCE($6,sport),active=COALESCE($7,active),updated_at=now()
     WHERE id=$1 RETURNING id,category_id,name,description,brand,sport,active,created_at,updated_at`,
    [id, input.categoryId ?? null, input.name?.trim() ?? null, input.description?.trim() ?? null, input.brand?.trim() ?? null, input.sport?.trim() ?? null, input.active ?? null],
  );
  if (!rows[0]) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto.');
  return rows[0];
}

export async function createVariant(productId: string, input: { sku: string; size: string; color: string; price: string }) {
  return transaction(async (client) => {
    const product = await client.query('SELECT id FROM products WHERE id=$1 AND active=true FOR UPDATE', [productId]);
    if (!product.rowCount) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'No se encontró un producto activo.');
    const { rows } = await client.query(
      `INSERT INTO product_variants(product_id,sku,size,color,price) VALUES($1,$2,$3,$4,$5)
       RETURNING id,product_id,sku,size,color,price::text AS price,active,created_at,updated_at`,
      [productId, input.sku.trim().toUpperCase(), input.size.trim(), input.color.trim(), input.price],
    );
    await client.query('INSERT INTO inventory(variant_id) VALUES($1)', [rows[0].id]);
    return rows[0];
  });
}

export async function updateVariant(id: string, input: { sku?: string; size?: string; color?: string; price?: string; active?: boolean; lowStockThreshold?: number }) {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE product_variants v SET sku=COALESCE($2,v.sku),size=COALESCE($3,v.size),color=COALESCE($4,v.color),
         price=COALESCE($5::numeric,v.price),active=COALESCE($6,v.active),updated_at=now()
       WHERE v.id=$1 RETURNING v.id,v.product_id,v.sku,v.size,v.color,v.price::text AS price,v.active,v.created_at,v.updated_at`,
      [id, input.sku?.trim().toUpperCase() ?? null, input.size?.trim() ?? null, input.color?.trim() ?? null, input.price ?? null, input.active ?? null],
    );
    if (!rows[0]) throw new AppError(404, 'VARIANT_NOT_FOUND', 'No se encontró la variante.');
    if (input.lowStockThreshold !== undefined) await client.query('UPDATE inventory SET low_stock_threshold=$2,updated_at=now() WHERE variant_id=$1', [id, input.lowStockThreshold]);
    return rows[0];
  });
}

export async function listInventory(filters: { query?: string; categoryId?: string; lowStock?: boolean }) {
  const { rows } = await pool.query(
    `SELECT p.id AS product_id,p.name AS product_name,c.name AS category_name,v.id AS variant_id,v.sku,v.size,v.color,
       v.price::text AS price,i.on_hand,i.reserved,(i.on_hand-i.reserved) AS available,i.low_stock_threshold,
       ((i.on_hand-i.reserved)<=i.low_stock_threshold) AS low_stock,v.active AS variant_active,p.active AS product_active
     FROM inventory i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id
     WHERE ($1::uuid IS NULL OR p.category_id=$1)
       AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%' OR v.sku ILIKE '%'||$2||'%' OR v.color ILIKE '%'||$2||'%')
       AND ($3::boolean=false OR i.on_hand-i.reserved<=i.low_stock_threshold)
     ORDER BY (i.on_hand-i.reserved)<=i.low_stock_threshold DESC,p.name,v.sku LIMIT 500`,
    [filters.categoryId ?? null, filters.query?.trim() || null, filters.lowStock ?? false],
  );
  return rows;
}

async function changeStock(variantId: string, delta: number, type: 'RECEIPT'|'ADJUSTMENT', reason: string, actorId: string) {
  return transaction(async (client) => {
    const inventory = await lockActiveInventory(client, [variantId]);
    if (!inventory.length) throw new AppError(404, 'VARIANT_NOT_FOUND', 'No se encontró una variante activa.');
    const updated = await updateOnHand(client, variantId, delta);
    const movement = await insertInventoryMovement(client, { variantId, delta, type, reason: reason.trim(), actorId });
    return { movement, onHand: updated.on_hand, reserved: updated.reserved };
  });
}

export function receiveStock(variantId: string, quantity: number, reason: string, actorId: string) {
  return changeStock(variantId, quantity, 'RECEIPT', reason, actorId);
}

export function adjustStock(variantId: string, delta: number, reason: string, actorId: string) {
  return changeStock(variantId, delta, 'ADJUSTMENT', reason, actorId);
}

export async function listMovements(query?: string) {
  const { rows } = await pool.query(
    `SELECT m.id,m.variant_id,m.delta,m.type,m.reason,m.actor_id,m.created_at,v.sku,p.name AS product_name,u.name AS actor_name
     FROM inventory_movements m JOIN product_variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id JOIN users u ON u.id=m.actor_id
     WHERE ($1::text IS NULL OR v.sku ILIKE '%'||$1||'%' OR p.name ILIKE '%'||$1||'%')
     ORDER BY m.created_at DESC LIMIT 200`, [query?.trim() || null],
  );
  return rows;
}
