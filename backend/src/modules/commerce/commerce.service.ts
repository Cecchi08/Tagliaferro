import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors.js';
import { insertInventoryMovement, lockActiveInventory, updateOnHand } from '../inventory/stock-operations.js';

type Line = { variantId: string; quantity: number };
const MAX_CENTS=999_999_999_999n;
const cents = (v: string) => { if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(v)) throw new AppError(400,'INVALID_AMOUNT','Importe inválido.'); const [a,b='']=v.split('.'); return BigInt(a!)*100n+BigInt(b.padEnd(2,'0')); };
const money = (n: bigint) => `${n/100n}.${(n%100n).toString().padStart(2,'0')}`;

export async function createOrder(customerId: string, key: string, items: Line[]) {
  if (!env.MP_ACCESS_TOKEN||!env.MP_WEBHOOK_SECRET) throw new AppError(503,'PAYMENTS_NOT_CONFIGURED','El checkout está temporalmente deshabilitado: faltan credenciales de Mercado Pago Sandbox.');
  if (!items.length || items.length>50 || new Set(items.map(x=>x.variantId)).size!==items.length) throw new AppError(400,'INVALID_ITEMS','El carrito debe incluir entre 1 y 50 variantes únicas.');
  const ordered=[...items].sort((a,b)=>a.variantId.localeCompare(b.variantId));
  const hash=createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
  const client=await pool.connect(); let orderId=''; let preferenceNeeded=false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${customerId}:${key}`]);
    const existing=await client.query('SELECT id,request_hash,mp_preference_id FROM store_orders WHERE customer_id=$1 AND idempotency_key=$2 FOR UPDATE',[customerId,key]);
    if(existing.rows[0]) {
      if(existing.rows[0].request_hash!==hash) throw new AppError(409,'IDEMPOTENCY_KEY_REUSED','La clave ya fue utilizada con otro carrito.');
      orderId=existing.rows[0].id; preferenceNeeded=!existing.rows[0].mp_preference_id;
      await client.query('COMMIT');
    } else {
      const stock=await lockActiveInventory(client,ordered.map(x=>x.variantId));
      if(stock.length!==ordered.length) throw new AppError(404,'VARIANT_NOT_FOUND','Una variante no existe o está inactiva.');
      const byId=new Map(stock.map(x=>[x.variant_id,x])); let total=0n;
      const snapshots=ordered.map(line=>{const v=byId.get(line.variantId)!; if(v.on_hand-v.reserved<line.quantity) throw new AppError(409,'STOCK_INSUFFICIENT',`Stock insuficiente para ${v.sku}.`); const p=cents(v.price); const lineTotal=p*BigInt(line.quantity); if(lineTotal>MAX_CENTS)throw new AppError(400,'ORDER_TOTAL_TOO_LARGE','El importe del pedido supera el máximo permitido.'); total+=lineTotal; return {line,v,p,lineTotal};});
      if(total>MAX_CENTS)throw new AppError(400,'ORDER_TOTAL_TOO_LARGE','El importe del pedido supera el máximo permitido.');
      const inserted=await client.query(`INSERT INTO store_orders(customer_id,idempotency_key,request_hash,total,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes') RETURNING id`,[customerId,key,hash,money(total)]);
      orderId=inserted.rows[0].id;
      for(const {line,v,p,lineTotal} of snapshots){
        await client.query(`INSERT INTO store_order_items(order_id,variant_id,sku_snapshot,product_name_snapshot,size_snapshot,color_snapshot,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[orderId,line.variantId,v.sku,v.product_name,v.size,v.color,line.quantity,money(p),money(lineTotal)]);
        await client.query('UPDATE inventory SET reserved=reserved+$2,updated_at=now() WHERE variant_id=$1',[line.variantId,line.quantity]);
        await client.query(`INSERT INTO stock_reservations(order_id,variant_id,quantity,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')`,[orderId,line.variantId,line.quantity]);
      }
      await client.query('COMMIT'); preferenceNeeded=true;
    }
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  if(preferenceNeeded) await createPreference(orderId);
  return getOrder(orderId,customerId);
}

async function createPreference(orderId:string) {
  const {rows}=await pool.query(`SELECT o.id,o.total::text total,u.email,coalesce(json_agg(json_build_object('title',i.product_name_snapshot||' · '||i.sku_snapshot,'quantity',i.quantity,'unit_price',i.unit_price::numeric,'currency_id','ARS')),'[]') items FROM store_orders o JOIN users u ON u.id=o.customer_id JOIN store_order_items i ON i.order_id=o.id WHERE o.id=$1 GROUP BY o.id,u.email`,[orderId]);
  const row=rows[0]; if(!row) throw new AppError(404,'ORDER_NOT_FOUND','Pedido inexistente.');
  const body={items:row.items,external_reference:orderId,payer:{email:row.email}, ...(env.PUBLIC_API_URL?{notification_url:`${env.PUBLIC_API_URL.replace(/\/$/,'')}/api/v1/payments/mercadopago/webhook`}:{}), back_urls:{success:env.PAYMENT_RETURN_URL,failure:env.PAYMENT_RETURN_URL,pending:env.PAYMENT_RETURN_URL}, auto_return:'approved'};
  const response=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${env.MP_ACCESS_TOKEN}`,'Content-Type':'application/json','X-Idempotency-Key':orderId},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const data=await response.json() as {id?:string;init_point?:string;sandbox_init_point?:string};
  if(!response.ok||!data.id) throw new AppError(502,'PAYMENT_PROVIDER_ERROR','Mercado Pago no pudo crear la preferencia. El pedido y la reserva quedan pendientes para reintentar.');
  // A sandbox credential yields a sandbox_init_point; never fall back to a live payment URL.
  if(!data.sandbox_init_point)throw new AppError(502,'PAYMENT_SANDBOX_URL_MISSING','Mercado Pago no devolvió una URL de checkout Sandbox. No se habilitó el enlace de pago.');
  await pool.query('UPDATE store_orders SET mp_preference_id=$2,mp_checkout_url=$3,updated_at=now() WHERE id=$1',[orderId,data.id,data.sandbox_init_point]);
}
export async function getOrder(id:string,customerId:string) { const {rows}=await pool.query(`SELECT o.*,coalesce(jsonb_agg(jsonb_build_object('sku',i.sku_snapshot,'name',i.product_name_snapshot,'size',i.size_snapshot,'color',i.color_snapshot,'quantity',i.quantity,'unitPrice',i.unit_price::text,'lineTotal',i.line_total::text)) FILTER(WHERE i.id IS NOT NULL),'[]') items FROM store_orders o LEFT JOIN store_order_items i ON i.order_id=o.id WHERE o.id=$1 AND o.customer_id=$2 GROUP BY o.id`,[id,customerId]); if(!rows[0]) throw new AppError(404,'ORDER_NOT_FOUND','No se encontró el pedido.'); return {...rows[0],checkoutUrl:rows[0].mp_checkout_url}; }
export async function listOrders(customerId:string){const {rows}=await pool.query('SELECT id,status,total,currency,created_at,expires_at FROM store_orders WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',[customerId]);return rows;}

export async function cancelOrder(id:string,customerId:string){const c=await pool.connect();try{await c.query('BEGIN');const o=await c.query(`SELECT id,status FROM store_orders WHERE id=$1 AND customer_id=$2 FOR UPDATE`,[id,customerId]);if(!o.rows[0])throw new AppError(404,'ORDER_NOT_FOUND','No se encontró el pedido.');if(o.rows[0].status!=='PENDING_PAYMENT')throw new AppError(409,'ORDER_NOT_CANCELLABLE','El pedido ya no está pendiente.');const rs=await c.query(`SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE`,[id]);for(const r of rs.rows){await c.query('UPDATE inventory SET reserved=reserved-$2 WHERE variant_id=$1',[r.variant_id,r.quantity]);}await c.query(`UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'`,[id]);await c.query(`UPDATE store_orders SET status='CANCELLED',updated_at=now() WHERE id=$1`,[id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}

export function validMpSignature(signature:string|undefined,requestId:string|undefined,dataId:string|undefined){if(!env.MP_WEBHOOK_SECRET||!signature||!requestId||!dataId)return false;const p=Object.fromEntries(signature.split(',').map(x=>x.trim().split('=').map(y=>y.trim())));if(!p.ts||!p.v1)return false;const manifest=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${p.ts};`;const digest=createHmac('sha256',env.MP_WEBHOOK_SECRET).update(manifest).digest();try{return timingSafeEqual(digest,Buffer.from(p.v1,'hex'));}catch{return false;}}
export async function processMpWebhook(eventId:string,paymentId:string){
  if(!env.MP_ACCESS_TOKEN||!env.MP_WEBHOOK_SECRET)throw new AppError(503,'PAYMENTS_NOT_CONFIGURED','Mercado Pago no está configurado.');
  const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${env.MP_ACCESS_TOKEN}`},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new AppError(502,'PAYMENT_LOOKUP_FAILED','No se pudo verificar el pago con Mercado Pago.');
  const payment=await response.json() as {id:number;status:string;external_reference:string;transaction_amount:number;currency_id:string};
  if(String(payment.id)!==paymentId)throw new AppError(502,'PAYMENT_LOOKUP_MISMATCH','Mercado Pago devolvió otro pago para esta notificación.');
  const c=await pool.connect();try{await c.query('BEGIN');const event=await c.query(`INSERT INTO payment_notifications(provider_event_id,payment_id) VALUES($1,$2) ON CONFLICT(provider_event_id) DO NOTHING RETURNING id`,[eventId,paymentId]);if(!event.rows[0]){await c.query('COMMIT');return {duplicate:true};}
    const oq=await c.query('SELECT * FROM store_orders WHERE id=$1 FOR UPDATE',[payment.external_reference]);const o=oq.rows[0];if(!o)throw new AppError(404,'ORDER_NOT_FOUND','El pago no referencia un pedido conocido.');
    if(o.status==='PAID'&&o.mp_payment_id===String(payment.id)){await c.query(`UPDATE payment_notifications SET outcome='DUPLICATE',processed_at=now() WHERE provider_event_id=$1`,[eventId]);await c.query('COMMIT');return {duplicate:true};}
    if(payment.status==='approved'&&payment.currency_id==='ARS'&&cents(String(o.total))===cents(String(payment.transaction_amount))){
      const rs=await c.query(`SELECT r.variant_id,r.quantity,r.status FROM stock_reservations r JOIN inventory i ON i.variant_id=r.variant_id WHERE r.order_id=$1 ORDER BY r.variant_id FOR UPDATE OF i`,[o.id]);
      if(o.status==='PENDING_PAYMENT'&&rs.rows.length&&rs.rows.every((r:any)=>r.status==='ACTIVE')){
        for(const r of rs.rows){await c.query('UPDATE inventory SET reserved=reserved-$2 WHERE variant_id=$1',[r.variant_id,r.quantity]);await updateOnHand(c,r.variant_id,-r.quantity);await c.query(`UPDATE stock_reservations SET status='COMMITTED' WHERE order_id=$1 AND variant_id=$2`,[o.id,r.variant_id]);await insertInventoryMovement(c,{variantId:r.variant_id,delta:-r.quantity,type:'ECOM_SALE',reason:`Pedido online ${o.id}`,actorId:o.customer_id,orderId:o.id});}
        await c.query(`UPDATE store_orders SET status='PAID',mp_payment_id=$2,paid_at=now(),updated_at=now() WHERE id=$1`,[o.id,String(payment.id)]);
      } else {await c.query(`UPDATE store_orders SET status='REVIEW',mp_payment_id=$2,updated_at=now() WHERE id=$1`,[o.id,String(payment.id)]);}
    } else if(payment.status==='approved') { await c.query(`UPDATE store_orders SET status='REVIEW',mp_payment_id=$2,updated_at=now() WHERE id=$1 AND status='PENDING_PAYMENT'`,[o.id,String(payment.id)]); }
    else if(['rejected','cancelled'].includes(payment.status)){await c.query(`UPDATE inventory i SET reserved=i.reserved-r.quantity FROM stock_reservations r WHERE r.order_id=$1 AND r.status='ACTIVE' AND i.variant_id=r.variant_id`,[o.id]);await c.query(`UPDATE stock_reservations SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE'`,[o.id]);await c.query(`UPDATE store_orders SET status='CANCELLED',mp_payment_id=$2,updated_at=now() WHERE id=$1 AND status='PENDING_PAYMENT'`,[o.id,String(payment.id)]);}
    await c.query(`UPDATE payment_notifications SET outcome=$2,processed_at=now() WHERE provider_event_id=$1`,[eventId,payment.status]);await c.query('COMMIT');return {duplicate:false};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}

export async function expireSafeOrders(){
  if(!env.MP_ACCESS_TOKEN)throw new AppError(503,'PAYMENTS_NOT_CONFIGURED','Mercado Pago no está configurado.');
  const candidates=await pool.query(`SELECT id FROM store_orders WHERE status='PENDING_PAYMENT' AND expires_at<=now() ORDER BY expires_at LIMIT 100`);let released=0;
  for(const {id} of candidates.rows){
    const response=await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc&limit=100`,{headers:{Authorization:`Bearer ${env.MP_ACCESS_TOKEN}`},signal:AbortSignal.timeout(10000)});
    if(!response.ok)continue;const body=await response.json() as {results?:{status:string}[]};const statuses=(body.results??[]).map(x=>x.status);
    if(statuses.length&&statuses.some(x=>!['rejected','cancelled'].includes(x)))continue;
    const c=await pool.connect();try{await c.query('BEGIN');const order=await c.query(`SELECT id FROM store_orders WHERE id=$1 AND status='PENDING_PAYMENT' AND expires_at<=now() FOR UPDATE`,[id]);if(!order.rows[0]){await c.query('COMMIT');continue;}
      const reservations=await c.query(`SELECT variant_id,quantity FROM stock_reservations WHERE order_id=$1 AND status='ACTIVE' ORDER BY variant_id FOR UPDATE`,[id]);
      for(const r of reservations.rows)await c.query('UPDATE inventory SET reserved=reserved-$2,updated_at=now() WHERE variant_id=$1 AND reserved >= $2',[r.variant_id,r.quantity]);
      await c.query(`UPDATE stock_reservations SET status='EXPIRED' WHERE order_id=$1 AND status='ACTIVE'`,[id]);await c.query(`UPDATE store_orders SET status='EXPIRED',updated_at=now() WHERE id=$1`,[id]);await c.query('COMMIT');released++;
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }return {released,checked:candidates.rowCount??0};
}
