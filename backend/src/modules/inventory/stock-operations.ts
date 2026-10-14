import type { PoolClient } from 'pg';
import { AppError } from '../../common/errors.js';

export type LockedInventory = {
  variant_id: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  product_name: string;
  on_hand: number;
  reserved: number;
};

export async function lockActiveInventory(client: PoolClient, variantIds: string[]) {
  if (variantIds.length === 0) return [] as LockedInventory[];
  const { rows } = await client.query<LockedInventory>(
    `SELECT i.variant_id,v.sku,v.size,v.color,v.price::text AS price,p.name AS product_name,i.on_hand,i.reserved
     FROM inventory i
     JOIN product_variants v ON v.id=i.variant_id
     JOIN products p ON p.id=v.product_id
     JOIN categories c ON c.id=p.category_id
     WHERE i.variant_id=ANY($1::uuid[]) AND v.active=true AND p.active=true AND c.active=true
     ORDER BY i.variant_id FOR UPDATE OF i`,
    [variantIds],
  );
  return rows;
}

export async function updateOnHand(client: PoolClient, variantId: string, delta: number) {
  const { rows } = await client.query(
    `UPDATE inventory SET on_hand=on_hand+$2,updated_at=now()
     WHERE variant_id=$1 AND on_hand+$2>=reserved RETURNING on_hand,reserved`,
    [variantId, delta],
  );
  if (!rows[0]) throw new AppError(409, 'STOCK_INSUFFICIENT', 'La operación no puede reducir el stock por debajo de las unidades reservadas.');
  return rows[0] as { on_hand: number; reserved: number };
}

export async function insertInventoryMovement(
  client: PoolClient,
  input: { variantId: string; delta: number; type: 'RECEIPT' | 'ADJUSTMENT' | 'POS_SALE'; reason: string; actorId: string; saleId?: string },
) {
  const { rows } = await client.query(
    `INSERT INTO inventory_movements(variant_id,delta,type,reason,actor_id,sale_id)
     VALUES($1,$2,$3,$4,$5,$6)
     RETURNING id,variant_id,delta,type,reason,actor_id,sale_id,created_at`,
    [input.variantId, input.delta, input.type, input.reason, input.actorId, input.saleId ?? null],
  );
  return rows[0];
}
