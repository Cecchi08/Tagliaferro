import { pool } from '../../config/db.js';
import { AppError } from '../../common/errors.js';

export async function getOrder(id: string, customerId: string) {
  const { rows } = await pool.query(
    `SELECT o.*, coalesce(jsonb_agg(json_build_object('sku',i.sku_snapshot,'name',i.product_name_snapshot,'size',i.size_snapshot,'color',i.color_snapshot,'quantity',i.quantity,'unitPrice',i.unit_price::text,'lineTotal',i.line_total::text)) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM store_orders o LEFT JOIN store_order_items i ON i.order_id=o.id
     WHERE o.id=$1 AND o.customer_id=$2 GROUP BY o.id`, [id, customerId],
  );
  if (!rows[0]) throw new AppError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  return rows[0];
}

export async function listOrders(customerId: string) {
  const { rows } = await pool.query(
    'SELECT id,status,total,currency,created_at,expires_at FROM store_orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',
    [customerId],
  );
  return rows;
}

export async function cancelOrder(id: string, customerId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT id,status FROM store_orders WHERE id=$1 AND customer_id=$2 FOR UPDATE', [id, customerId]);
    if (!order.rows[0]) throw new AppError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
    if (order.rows[0].status !== 'PENDING_PAYMENT') throw new AppError(409, 'ORDER_NOT_CANCELLABLE', 'El pedido ya no está pendiente.');
    const reservations = await client.query("SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE", [id]);
    for (const reservation of reservations.rows) {
      await client.query('UPDATE inventory SET reserved=reserved-$2 WHERE variant_id=$1', [reservation.variant_id, reservation.quantity]);
    }
    await client.query("UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'", [id]);
    await client.query("UPDATE store_orders SET status='CANCELLED',updated_at=now() WHERE id=$1", [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
