import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

type Variant = { id: string; sku: string; size: string; color: string; price: string; active: boolean; available: number };
type Product = { id: string; name: string; description: string; brand: string; sport: string; category_name: string; variants: Variant[] };
type Order = { id: string; status: string; total: string; created_at: string; mp_checkout_url?: string | null; items?: { sku: string; name: string; size: string; color: string; quantity: number; unitPrice: string; lineTotal: string }[] };
type CartLine = { product: Product; variant: Variant; quantity: number };
const money = (x: string | number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(x));

export function Store({ customer }: { customer: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [detail, setDetail] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lines = Object.values(cart);
  const total = useMemo(() => lines.reduce((sum, line) => sum + Number(line.variant.price) * line.quantity, 0), [lines]);

  async function load() {
    setLoading(true);
    try {
      const result = await api<{ products: Product[] }>(`/api/v1/catalog/products?q=${encodeURIComponent(search)}`);
      setProducts(result.products);
      if (customer) setOrders((await api<{ orders: Order[] }>('/api/v1/store/orders')).orders);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar la tienda.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [search, customer]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('payment')) {
      setNotice('Volviste de Mercado Pago. El pedido se actualizará cuando el servidor verifique el pago.');
      void load();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  function add(product: Product, variant: Variant) {
    setCart((current) => ({ ...current, [variant.id]: { product, variant, quantity: Math.min(variant.available, (current[variant.id]?.quantity ?? 0) + 1) } }));
  }

  async function checkout() {
    if (!lines.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{ orderId: string; checkoutUrl: string }>('/api/v1/store/orders', {
        method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), items: lines.map(({ variant, quantity }) => ({ variantId: variant.id, quantity })) }),
      });
      const checkout = new URL(response.checkoutUrl);
      if (checkout.protocol !== 'https:' || !/(^|\.)mercadopago\.com(?:\.ar)?$/.test(checkout.hostname)) throw new Error('La URL de pago recibida no es válida.');
      window.location.assign(checkout.href);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo iniciar el pago.'); }
    finally { setBusy(false); }
  }

  async function openOrder(id: string) {
    try { setDetail((await api<{ order: Order }>(`/api/v1/store/orders/${id}`)).order); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar el pedido.'); }
  }

  async function cancel(id: string) {
    setBusy(true);
    try { await api(`/api/v1/store/orders/${id}/cancel`, { method: 'POST' }); setNotice('Pedido cancelado y reserva liberada.'); setDetail(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar el pedido.'); }
    finally { setBusy(false); }
  }

  return <section className="admin-section store-section">
    <div className="section-heading"><div><span className="eyebrow">TIENDA ONLINE</span><h2>Equipate para tu próximo objetivo</h2></div>{customer && <span className="pill">RETIRO EN TIENDA</span>}</div>
    {error && <div className="alert" role="alert">{error}</div>}{notice && <div className="success" role="status">{notice}</div>}
    <form className="filter-bar" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}><label>Buscar productos, marca o SKU<input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} /></label><button className="button outline">Buscar</button></form>
    {loading ? <div className="skeleton-list"><div className="skeleton-row" /><div className="skeleton-row" /></div> : <div className="store-grid">{products.map((p) => <article className="product-card" key={p.id}><span className="eyebrow">{p.category_name} · {p.brand} {p.sport && `· ${p.sport}`}</span><h3>{p.name}</h3><p>{p.description}</p><div className="store-variants">{p.variants.filter((v) => v.active).map((v) => <div className="store-variant" key={v.id}><span><b>{v.size || 'Único'}{v.color && ` · ${v.color}`}</b><small>{v.sku} · Disponible {v.available}</small></span><b>{money(v.price)}</b><button className="mini-button" disabled={!customer || v.available < 1 || busy} onClick={() => add(p, v)}>{customer ? 'Agregar' : 'Solo clientes'}</button></div>)}</div></article>)}</div>}
    {customer && <div className="store-checkout"><div><h3>Carrito <span className="count">{lines.reduce((n, line) => n + line.quantity, 0)} unidades</span></h3>{lines.length === 0 ? <p className="muted-small">Agregá variantes para iniciar la compra.</p> : lines.map((line) => <p key={line.variant.id}>{line.product.name} · {line.variant.sku} × {line.quantity} <label>Cant. <input aria-label={`Cantidad ${line.variant.sku}`} type="number" min="1" max={line.variant.available} value={line.quantity} onChange={(e) => { const quantity = Math.max(1, Math.min(line.variant.available, Number(e.target.value) || 1)); setCart((current) => ({ ...current, [line.variant.id]: { ...line, quantity } })); }} /></label> <button className="text-button" onClick={() => setCart((current) => { const next = { ...current }; delete next[line.variant.id]; return next; })}>Quitar</button></p>)}</div><div><b>Total estimado {money(total)}</b><button className="button primary" disabled={!lines.length || busy} onClick={() => void checkout()}>{busy ? 'Preparando pago…' : 'Continuar a Mercado Pago'}</button><small>El monto final y la disponibilidad se validan nuevamente en el servidor. El pedido se confirma únicamente al verificarse el pago.</small></div></div>}
    {detail && <section className="order-detail"><div className="section-heading"><h3>Pedido {detail.id}</h3><span className="pill">{detail.status}</span></div>{detail.items?.map((i, n) => <p key={n}>{i.name} · {i.sku} × {i.quantity} — {money(i.lineTotal)}</p>)}<b>Total: {money(detail.total)}</b>{detail.status === 'PENDING_PAYMENT' && <><button className="button outline" disabled={busy} onClick={() => void cancel(detail.id)}>Cancelar pedido</button>{detail.mp_checkout_url && <a className="button primary" href={detail.mp_checkout_url} target="_blank" rel="noreferrer">Continuar al pago</a>}</>}</section>}
    {customer && <section className="movement-section"><h3>Mis pedidos</h3>{orders.length === 0 ? <div className="empty-state">Todavía no tenés pedidos.</div> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Estado</th><th>Total</th><th>Detalle</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td>{new Date(o.created_at).toLocaleString('es-AR')}</td><td>{o.status}</td><td>{money(o.total)}</td><td><button className="text-button" onClick={() => void openOrder(o.id)}>Ver pedido</button></td></tr>)}</tbody></table></div>}</section>}
  </section>;
}
