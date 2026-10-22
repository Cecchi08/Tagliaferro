import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../config/db.js';
import { AppError } from '../../common/errors.js';
import { insertInventoryMovement } from '../inventory/stock-operations.js';

type CheckoutLine = { variantId: string; quantity: number };
const configured = () => Boolean(env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET && env.PUBLIC_API_URL && env.PAYMENT_RETURN_URL);
const money = (value: string | number) => Number(value).toFixed(2);
const formatCents = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;

function paymentConfig() {
  if (!configured()) throw new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'El pago online todavía no está configurado para este entorno.');
  return { token: env.MP_ACCESS_TOKEN!, apiUrl: env.PUBLIC_API_URL!.replace(/\/$/, ''), returnUrl: env.PAYMENT_RETURN_URL! };
}

async function mpRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = paymentConfig();
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Mercado Pago no pudo completar la operación. Intentá nuevamente.');
  return response.json() as Promise<T>;
}

async function createPreference(orderId: string) {
  const { rows } = await pool.query(
    `SELECT i.sku_snapshot,i.product_name_snapshot,i.size_snapshot,i.color_snapshot,i.quantity,i.unit_price::text AS unit_price,o.expires_at
     FROM store_order_items i JOIN store_orders o ON o.id=i.order_id WHERE i.order_id=$1 ORDER BY i.id`, [orderId],
  );
  const { apiUrl, returnUrl } = paymentConfig();
  const result = await mpRequest<{ id: string; init_point: string; sandbox_init_point?: string }>('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      external_reference: orderId,
      items: rows.map((item) => ({
        id: item.sku_snapshot,
        title: `${item.product_name_snapshot}${item.size_snapshot ? ` - ${item.size_snapshot}` : ''}${item.color_snapshot ? ` - ${item.color_snapshot}` : ''}`,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        currency_id: 'ARS',
      })),
      back_urls: { success: `${returnUrl.replace(/\/$/, '')}/?payment=return`, pending: `${returnUrl.replace(/\/$/, '')}/?payment=return`, failure: `${returnUrl.replace(/\/$/, '')}/?payment=return` },
      notification_url: `${apiUrl}/api/v1/payments/webhook`,
      auto_return: 'approved',
      expires: true,
      expiration_date_to: new Date(rows[0]?.expires_at ?? Date.now() + 30 * 60_000).toISOString(),
    }),
  });
  const checkoutUrl = env.MP_ACCESS_TOKEN!.startsWith('TEST-') ? result.sandbox_init_point : result.init_point;
  if (!checkoutUrl) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Mercado Pago no devolvió una URL de checkout válida.');
  await pool.query("UPDATE store_orders SET mp_preference_id=$2,mp_checkout_url=$3,updated_at=now() WHERE id=$1 AND status='PENDING_PAYMENT'", [orderId, result.id, checkoutUrl]);
  return checkoutUrl;
}

export async function createOnlineOrder(customerId: string, idempotencyKey: string, lines: CheckoutLine[]) {
  paymentConfig();
  await expirePendingOrders();
  if (!lines.length || lines.length > 50 || new Set(lines.map((line) => line.variantId)).size !== lines.length) {
    throw new AppError(400, 'INVALID_ITEMS', 'El pedido debe incluir entre 1 y 50 variantes distintas.');
  }
  const canonical = JSON.stringify([...lines].sort((a, b) => a.variantId.localeCompare(b.variantId)));
  const client = await pool.connect();
  let orderId: string;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${customerId}:${idempotencyKey}`]);
    const prior = await client.query('SELECT id,request_hash,status,mp_checkout_url FROM store_orders WHERE customer_id=$1 AND idempotency_key=$2 FOR UPDATE', [customerId, idempotencyKey]);
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== createHash('sha256').update(canonical).digest('hex')) throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'La clave de esta solicitud ya se utilizó con otros datos.');
      if (prior.rows[0].status !== 'PENDING_PAYMENT') throw new AppError(409, 'ORDER_NOT_RETRYABLE', 'Este pedido ya no está pendiente de pago.');
      orderId = prior.rows[0].id;
      await client.query('COMMIT');
      return { orderId, checkoutUrl: prior.rows[0].mp_checkout_url ?? await createPreference(orderId), replayed: true };
    }
    const requestHash = createHash('sha256').update(canonical).digest('hex');
    const ordered = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
    const { rows: variants } = await client.query(
      `SELECT i.variant_id,v.sku,v.size,v.color,v.price::text AS price,p.name AS product_name,i.on_hand,i.reserved
       FROM inventory i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id
       WHERE i.variant_id=ANY($1::uuid[]) AND v.active AND p.active AND c.active ORDER BY i.variant_id FOR UPDATE OF i`,
      [ordered.map((line) => line.variantId)],
    );
    if (variants.length !== ordered.length) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Una variante no existe o está inactiva.');
    const byId = new Map(variants.map((variant) => [variant.variant_id, variant]));
    let totalCents = 0n;
    const items = ordered.map((line) => {
      const v = byId.get(line.variantId)!;
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || v.on_hand - v.reserved < line.quantity) throw new AppError(409, 'STOCK_INSUFFICIENT', `Stock disponible insuficiente para ${v.sku}.`);
      const [whole, fraction = ''] = v.price.split('.');
      const priceCents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
      const lineCents = priceCents * BigInt(line.quantity);
      totalCents += lineCents;
      return { ...line, variant: v, price: formatCents(priceCents), lineTotal: formatCents(lineCents) };
    });
    if (totalCents <= 0n || totalCents > 999_999_999_999n) throw new AppError(400, 'INVALID_ORDER_TOTAL', 'El total del pedido no es válido.');
    const total = formatCents(totalCents);
    const inserted = await client.query(
      `INSERT INTO store_orders(customer_id,idempotency_key,request_hash,status,total,currency,expires_at)
       VALUES($1,$2,$3,'PENDING_PAYMENT',$4,'ARS',now()+interval '30 minutes') RETURNING id`,
      [customerId, idempotencyKey, requestHash, total],
    );
    orderId = inserted.rows[0].id;
    for (const item of items) {
      await client.query(
        `INSERT INTO store_order_items(order_id,variant_id,sku_snapshot,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_price,line_total)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orderId, item.variant.variant_id, item.variant.sku, item.variant.product_name, item.variant.size, item.variant.color, item.quantity, item.price, item.lineTotal],
      );
      const reserved = await client.query('UPDATE inventory SET reserved=reserved+$2,updated_at=now() WHERE variant_id=$1 AND on_hand-reserved >= $2 RETURNING variant_id', [item.variant.variant_id, item.quantity]);
      if (!reserved.rowCount) throw new AppError(409, 'STOCK_INSUFFICIENT', `Stock disponible insuficiente para ${item.variant.sku}.`);
      await client.query("INSERT INTO stock_reservations(order_id,variant_id,quantity,status,expires_at) VALUES($1,$2,$3,'ACTIVE',now()+interval '30 minutes')", [orderId, item.variant.variant_id, item.quantity]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new AppError(409, 'ORDER_CONFLICT', 'El pedido ya se registró. Consultá tu historial antes de reintentar.');
    throw error;
  } finally { client.release(); }

  try { return { orderId, checkoutUrl: await createPreference(orderId), replayed: false }; }
  catch (error) {
    await releaseOrder(orderId, 'CANCELLED');
    throw error;
  }
}

export function verifyWebhookSignature(signature: string | undefined, requestId: string | undefined, paymentId: string | undefined, secret: string | undefined) {
  if (!signature || !requestId || !paymentId || !secret) return false;
  const parts = Object.fromEntries(signature.split(',').map((part) => {
    const [key, ...value] = part.trim().split('='); return [key, value.join('=')];
  }));
  if (!parts.ts || !parts.v1 || !/^\d+$/.test(parts.ts)) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  let received: Buffer;
  try { received = Buffer.from(parts.v1, 'hex'); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export const validWebhookSignature = (signature: string | undefined, requestId: string | undefined, paymentId: string | undefined) =>
  verifyWebhookSignature(signature, requestId, paymentId, env.MP_WEBHOOK_SECRET);

async function releaseOrder(orderId: string, status: 'CANCELLED' | 'EXPIRED') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query("SELECT id,status FROM store_orders WHERE id=$1 FOR UPDATE", [orderId]);
    if (order.rows[0]?.status === 'PENDING_PAYMENT') {
      const reservations = await client.query("SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE", [orderId]);
      for (const item of reservations.rows) await client.query('UPDATE inventory SET reserved=reserved-$2,updated_at=now() WHERE variant_id=$1 AND reserved >= $2', [item.variant_id, item.quantity]);
      await client.query("UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'", [orderId]);
      await client.query('UPDATE store_orders SET status=$2,updated_at=now() WHERE id=$1', [orderId, status]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function processPaymentWebhook(paymentId: string, eventId: string) {
  paymentConfig();
  const payment = await mpRequest<{ id: number; status: string; external_reference?: string; transaction_amount: number; currency_id: string; preference_id?: string }>(`/v1/payments/${encodeURIComponent(paymentId)}`);
  if (!payment.external_reference) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id,customer_id,status,total::text AS total,mp_preference_id,expires_at FROM store_orders WHERE id=$1 FOR UPDATE', [payment.external_reference]);
    const order = rows[0];
    if (!order) { await client.query('ROLLBACK'); return; }
    if (money(payment.transaction_amount) !== money(order.total) || payment.currency_id !== 'ARS') {
      await client.query("UPDATE store_orders SET status='REVIEW',updated_at=now() WHERE id=$1 AND status='PENDING_PAYMENT'", [order.id]);
      await client.query('INSERT INTO payment_notifications(provider_event_id,payment_id,outcome,processed_at) VALUES($1,$2,\'REVIEW\',now()) ON CONFLICT(provider_event_id) DO NOTHING', [eventId, paymentId]);
      await client.query('COMMIT'); return;
    }
    if (order.mp_preference_id && payment.preference_id !== order.mp_preference_id) {
      await client.query("UPDATE store_orders SET status='REVIEW',updated_at=now() WHERE id=$1 AND status='PENDING_PAYMENT'", [order.id]);
      await client.query('INSERT INTO payment_notifications(provider_event_id,payment_id,outcome,processed_at) VALUES($1,$2,\'REVIEW\',now()) ON CONFLICT(provider_event_id) DO NOTHING', [eventId, paymentId]);
      await client.query('COMMIT'); return;
    }
    if (new Date(order.expires_at).getTime() <= Date.now() && order.status === 'PENDING_PAYMENT') {
      const reservations = await client.query("SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE", [order.id]);
      for (const item of reservations.rows) await client.query('UPDATE inventory SET reserved=reserved-$2,updated_at=now() WHERE variant_id=$1 AND reserved >= $2', [item.variant_id, item.quantity]);
      await client.query("UPDATE stock_reservations SET status='EXPIRED' WHERE order_id=$1 AND status='ACTIVE'", [order.id]);
      await client.query("UPDATE store_orders SET status='EXPIRED',updated_at=now() WHERE id=$1", [order.id]);
      if (payment.status === 'approved') {
        await client.query("UPDATE store_orders SET status='REVIEW',mp_payment_id=$2 WHERE id=$1", [order.id, paymentId]);
        await client.query('INSERT INTO payment_notifications(provider_event_id,payment_id,outcome,processed_at) VALUES($1,$2,\'LATE_APPROVAL_REVIEW\',now()) ON CONFLICT(provider_event_id) DO NOTHING', [eventId, paymentId]);
      }
      await client.query('COMMIT'); return;
    }
    await client.query('INSERT INTO payment_notifications(provider_event_id,payment_id,outcome,processed_at) VALUES($1,$2,$3,now()) ON CONFLICT(provider_event_id) DO NOTHING', [eventId, paymentId, payment.status.toUpperCase()]);
    if (order.status !== 'PENDING_PAYMENT') {
      if (payment.status === 'approved' && ['EXPIRED', 'CANCELLED'].includes(order.status)) {
        await client.query("UPDATE store_orders SET status='REVIEW',mp_payment_id=$2,updated_at=now() WHERE id=$1", [order.id, paymentId]);
        await client.query("UPDATE payment_notifications SET outcome='LATE_APPROVAL_REVIEW' WHERE provider_event_id=$1", [eventId]);
      }
      await client.query('COMMIT'); return;
    }
    if (payment.status === 'approved') {
      const reservations = await client.query("SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE", [order.id]);
      for (const item of reservations.rows) {
        const changed = await client.query('UPDATE inventory SET on_hand=on_hand-$2,reserved=reserved-$2,updated_at=now() WHERE variant_id=$1 AND on_hand >= $2 AND reserved >= $2 RETURNING variant_id', [item.variant_id, item.quantity]);
        if (!changed.rowCount) throw new AppError(409, 'RESERVATION_INCONSISTENT', 'La reserva de stock ya no puede confirmarse.');
        await insertInventoryMovement(client as never, { variantId: item.variant_id, delta: -item.quantity, type: 'ECOM_SALE', reason: `Pedido online ${order.id}`, actorId: order.customer_id, orderId: order.id });
      }
      await client.query("UPDATE stock_reservations SET status='COMMITTED' WHERE order_id=$1 AND status='ACTIVE'", [order.id]);
      await client.query("UPDATE store_orders SET status='PAID',mp_payment_id=$2,paid_at=now(),updated_at=now() WHERE id=$1", [order.id, paymentId]);
    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      const reservations = await client.query("SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE", [order.id]);
      for (const item of reservations.rows) await client.query('UPDATE inventory SET reserved=reserved-$2,updated_at=now() WHERE variant_id=$1 AND reserved >= $2', [item.variant_id, item.quantity]);
      await client.query("UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'", [order.id]);
      await client.query("UPDATE store_orders SET status='CANCELLED',mp_payment_id=$2,updated_at=now() WHERE id=$1", [order.id, paymentId]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function cancelOnlineOrder(id: string, customerId: string) {
  const result = await pool.query("SELECT status FROM store_orders WHERE id=$1 AND customer_id=$2", [id, customerId]);
  if (!result.rows[0]) throw new AppError(404, 'ORDER_NOT_FOUND', 'No se encontró el pedido.');
  if (result.rows[0].status !== 'PENDING_PAYMENT') throw new AppError(409, 'ORDER_NOT_CANCELLABLE', 'El pedido ya no está pendiente.');
  await releaseOrder(id, 'CANCELLED');
}

export async function expirePendingOrders() {
  const { rows } = await pool.query("SELECT id FROM store_orders WHERE status='PENDING_PAYMENT' AND expires_at<=now() ORDER BY expires_at LIMIT 100");
  for (const row of rows) await releaseOrder(row.id, 'EXPIRED');
}
