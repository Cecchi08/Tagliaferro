import { createHash } from 'node:crypto';
import { pool } from '../../config/db.js';
import { AppError } from '../../common/errors.js';
import { insertInventoryMovement, lockActiveInventory, updateOnHand } from '../inventory/stock-operations.js';

export type PosItemInput = { variantId: string; quantity: number };
export type PosSaleInput = {
  idempotencyKey: string;
  paymentMethod: 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OTHER';
  cashReceived?: string;
  items: PosItemInput[];
};

const MAX_CENTS = 999_999_999_999n;
function cents(value: string) {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) throw new AppError(400, 'INVALID_AMOUNT', 'El importe no es válido.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function amount(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`; }

async function saleWithItems(client: { query: typeof pool.query }, saleId: string) {
  const { rows } = await client.query(
    `SELECT s.id,s.receipt_number,s.cashier_id,u.name AS cashier_name,s.payment_method,s.payment_status,s.status,
       s.total::text AS total,s.cash_received::text AS cash_received,
       CASE WHEN s.cash_received IS NULL THEN NULL ELSE (s.cash_received-s.total)::text END AS change_due,
       s.created_at,
       COALESCE(jsonb_agg(jsonb_build_object(
         'variantId',i.variant_id,'sku',i.sku_snapshot,'productName',i.product_name_snapshot,
         'size',i.size_snapshot,'color',i.color_snapshot,'quantity',i.quantity,
         'unitPrice',i.unit_price::text,'lineTotal',i.line_total::text
       ) ORDER BY i.product_name_snapshot,i.sku_snapshot) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS items
     FROM pos_sales s JOIN users u ON u.id=s.cashier_id
     LEFT JOIN pos_sale_items i ON i.sale_id=s.id
     WHERE s.id=$1 GROUP BY s.id,u.name`,
    [saleId],
  );
  return rows[0];
}

export async function createPosSale(cashierId: string, input: PosSaleInput) {
  if (!input.items.length || input.items.length > 50) throw new AppError(400, 'INVALID_ITEMS', 'La venta debe incluir entre 1 y 50 variantes.');
  const orderedItems = [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
  if (new Set(orderedItems.map((item) => item.variantId)).size !== orderedItems.length) {
    throw new AppError(400, 'DUPLICATE_VARIANT', 'Agrupá las cantidades de cada variante en una sola línea.');
  }
  const cashReceived = input.paymentMethod === 'CASH' ? cents(input.cashReceived ?? '') : null;
  const canonical = JSON.stringify({
    paymentMethod: input.paymentMethod,
    cashReceived: cashReceived === null ? null : amount(cashReceived),
    items: orderedItems,
  });
  const requestHash = createHash('sha256').update(canonical).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${cashierId}:${input.idempotencyKey}`]);
    const prior = await client.query('SELECT id,request_hash FROM pos_sales WHERE cashier_id=$1 AND idempotency_key=$2 FOR UPDATE', [cashierId, input.idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== requestHash) throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'La clave de esta solicitud ya se utilizó con otros datos.');
      const sale = await saleWithItems(client, prior.rows[0].id);
      await client.query('COMMIT');
      return { sale, replayed: true };
    }

    const inventory = await lockActiveInventory(client, orderedItems.map((item) => item.variantId));
    if (inventory.length !== orderedItems.length) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Una variante no existe o está inactiva.');
    const byVariant = new Map(inventory.map((row) => [row.variant_id, row]));
    let totalCents = 0n;
    const lines = orderedItems.map((item) => {
      const variant = byVariant.get(item.variantId)!;
      if (variant.on_hand - variant.reserved < item.quantity) {
        throw new AppError(409, 'STOCK_INSUFFICIENT', `Stock disponible insuficiente para ${variant.sku}.`);
      }
      const unitCents = cents(variant.price);
      const lineCents = unitCents * BigInt(item.quantity);
      if (lineCents > MAX_CENTS) throw new AppError(400, 'SALE_TOTAL_TOO_LARGE', 'El importe de la venta supera el máximo permitido.');
      totalCents += lineCents;
      return { ...item, variant, unitPrice: amount(unitCents), lineTotal: amount(lineCents) };
    });
    if (totalCents > MAX_CENTS) throw new AppError(400, 'SALE_TOTAL_TOO_LARGE', 'El importe de la venta supera el máximo permitido.');
    if (cashReceived !== null && cashReceived < totalCents) throw new AppError(400, 'CASH_TENDERED_TOO_LOW', 'El efectivo recibido no alcanza para cubrir el total.');

    const inserted = await client.query(
      `INSERT INTO pos_sales(cashier_id,idempotency_key,request_hash,payment_method,payment_status,status,total,cash_received)
       VALUES($1,$2,$3,$4,'RECORDED','COMPLETED',$5,$6) RETURNING id,receipt_number`,
      [cashierId, input.idempotencyKey, requestHash, input.paymentMethod, amount(totalCents), cashReceived === null ? null : amount(cashReceived)],
    );
    const sale = inserted.rows[0] as { id: string; receipt_number: string };
    for (const line of lines) {
      await client.query(
        `INSERT INTO pos_sale_items(sale_id,variant_id,sku_snapshot,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_price,line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sale.id, line.variant.variant_id, line.variant.sku, line.variant.product_name, line.variant.size, line.variant.color, line.quantity, line.unitPrice, line.lineTotal],
      );
      await updateOnHand(client, line.variant.variant_id, -line.quantity);
      await insertInventoryMovement(client, {
        variantId: line.variant.variant_id,
        delta: -line.quantity,
        type: 'POS_SALE',
        reason: `Venta POS #${sale.receipt_number}`,
        actorId: cashierId,
        saleId: sale.id,
      });
    }
    const result = await saleWithItems(client, sale.id);
    await client.query('COMMIT');
    return { sale: result, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'SALE_CONFLICT', 'La venta ya fue registrada. Consultá el historial antes de reintentar.');
    }
    throw error;
  } finally { client.release(); }
}

export async function listPosSales(actorId: string, isAdmin: boolean, limit: number) {
  const { rows } = await pool.query(
    `SELECT s.id,s.receipt_number,s.cashier_id,u.name AS cashier_name,s.payment_method,s.payment_status,s.status,
       s.total::text AS total,s.created_at,COALESCE(sum(i.quantity),0)::int AS item_count,
       COALESCE(string_agg(i.product_name_snapshot, ', ' ORDER BY i.product_name_snapshot), '') AS item_summary
     FROM pos_sales s JOIN users u ON u.id=s.cashier_id
     LEFT JOIN pos_sale_items i ON i.sale_id=s.id
     WHERE ($1::boolean OR s.cashier_id=$2)
     GROUP BY s.id,u.name ORDER BY s.created_at DESC,s.receipt_number DESC LIMIT $3`,
    [isAdmin, actorId, limit],
  );
  return rows;
}

export async function getPosSale(id: string, actorId: string, isAdmin: boolean) {
  const { rows } = await pool.query(
    `SELECT s.id FROM pos_sales s WHERE s.id=$1 AND ($2::boolean OR s.cashier_id=$3)`,
    [id, isAdmin, actorId],
  );
  if (!rows[0]) throw new AppError(404, 'SALE_NOT_FOUND', 'No se encontró la venta.');
  const client = { query: pool.query.bind(pool) };
  return saleWithItems(client, id);
}
