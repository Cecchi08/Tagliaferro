import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

type Variant = { id: string; sku: string; size: string; color: string; price: string; available: number; active: boolean };
type Product = { id: string; name: string; brand: string; sport: string; category_name: string; variants: Variant[] };
type SaleItem = { variantId: string; sku: string; productName: string; size: string; color: string; quantity: number; unitPrice: string; lineTotal: string };
type Sale = {
  id: string; receipt_number: string; cashier_id: string; cashier_name: string; payment_method: string;
  payment_status: string; status: string; total: string; cash_received: string | null;
  change_due: string | null; created_at: string; items: SaleItem[];
};
type SaleSummary = { id: string; receipt_number: string; cashier_name: string; payment_method: string; total: string; created_at: string; item_count: number; item_summary: string };
type CartLine = { product: Product; variant: Variant; quantity: number };
type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OTHER';

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: 'Efectivo', DEBIT_CARD: 'Tarjeta de débito', CREDIT_CARD: 'Tarjeta de crédito', BANK_TRANSFER: 'Transferencia', OTHER: 'Otro',
};
const currency = (value: string | number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
const newKey = () => globalThis.crypto.randomUUID();

function Busy() { return <span className="spinner" aria-hidden="true" />; }

export function Pos() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [query, setQuery] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [history, setHistory] = useState<SaleSummary[]>([]);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const idempotencyKey = useRef(newKey());
  const submitLock = useRef(false);

  const loadProducts = useCallback(async (search = '') => {
    setSearching(true);
    setError('');
    try {
      const result = await api<{ products: Product[] }>(`/api/v1/catalog/products${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      setProducts(result.products);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo buscar el catálogo.'); }
    finally { setSearching(false); setLoadingProducts(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try { setHistory((await api<{ sales: SaleSummary[] }>('/api/v1/pos/sales?limit=30')).sales); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar el historial de ventas.'); }
    finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { void loadProducts(); void loadHistory(); }, [loadProducts, loadHistory]);

  const cartLines = Object.values(cart);
  const total = useMemo(() => cartLines.reduce((sum, line) => sum + Number(line.variant.price) * line.quantity, 0), [cartLines]);
  const canCheckout = cartLines.length > 0 && (!saving) && (paymentMethod !== 'CASH' || (cashReceived !== '' && Number(cashReceived) >= total));

  function changeSaleInput() { idempotencyKey.current = newKey(); setSuccess(''); }
  function addVariant(product: Product, variant: Variant) {
    if (!variant.active || variant.available < 1) return;
    changeSaleInput();
    setCart((current) => {
      const existing = current[variant.id];
      const quantity = Math.min(variant.available, (existing?.quantity ?? 0) + 1);
      return { ...current, [variant.id]: { product, variant, quantity } };
    });
  }
  function changeQuantity(variantId: string, raw: string) {
    changeSaleInput();
    const line = cart[variantId];
    if (!line) return;
    const quantity = Math.min(line.variant.available, Math.max(0, Number(raw) || 0));
    setCart((current) => {
      if (quantity === 0) { const next = { ...current }; delete next[variantId]; return next; }
      return { ...current, [variantId]: { ...line, quantity } };
    });
  }
  function removeLine(variantId: string) {
    changeSaleInput();
    setCart((current) => { const next = { ...current }; delete next[variantId]; return next; });
  }

  async function submitSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || !canCheckout) return;
    submitLock.current = true;
    setSaving(true); setError(''); setSuccess('');
    const payload = {
      idempotencyKey: idempotencyKey.current,
      paymentMethod,
      ...(paymentMethod === 'CASH' ? { cashReceived: Number(cashReceived).toFixed(2) } : {}),
      items: cartLines.map(({ variant, quantity }) => ({ variantId: variant.id, quantity })),
    };
    try {
      const result = await api<{ sale: Sale }>('/api/v1/pos/sales', { method: 'POST', body: JSON.stringify(payload) });
      setReceipt(result.sale);
      setCart({}); setCashReceived(''); idempotencyKey.current = newKey();
      setSuccess(`Venta #${result.sale.receipt_number} registrada correctamente.`);
      const refresh = await Promise.allSettled([loadProducts(query), loadHistory()]);
      if (refresh.some((item) => item.status === 'rejected')) setError('La venta quedó registrada, pero no se pudieron actualizar todas las vistas.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo registrar la venta. El carrito sigue disponible.'); }
    finally { setSaving(false); submitLock.current = false; }
  }

  async function openReceipt(id: string) {
    setError(''); setSuccess('');
    try { setReceipt((await api<{ sale: Sale }>(`/api/v1/pos/sales/${id}`)).sale); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo consultar el comprobante.'); }
  }

  return <section className="admin-section pos-section">
    <div className="section-heading"><div><span className="eyebrow">VENTA PRESENCIAL</span><h2>Punto de venta</h2></div><span className="pill">COMPROBANTE INTERNO</span></div>
    {error && <div className="alert" role="alert">{error}</div>}{success && <div className="success" role="status">{success}</div>}
    <div className="pos-layout">
      <section className="pos-products" aria-label="Catálogo para la venta">
        <h3>Buscar productos</h3>
        <form className="filter-bar pos-search" onSubmit={(event) => { event.preventDefault(); void loadProducts(query.trim()); }}>
          <label>Nombre, marca, deporte o SKU<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Ej.: botines, running, SKU…" /></label>
          <button className="button outline" disabled={searching}>{searching && <Busy />}{searching ? 'Buscando…' : 'Buscar'}</button>
        </form>
        {loadingProducts ? <div className="skeleton-list" aria-label="Cargando catálogo"><div className="skeleton-row"/><div className="skeleton-row"/></div>
          : products.length === 0 ? <div className="empty-state">No hay productos que coincidan con la búsqueda.</div>
          : <div className="pos-product-list">{products.map((product) => {
            const variants = product.variants.filter((variant) => variant.active);
            return <article className="pos-product" key={product.id}>
              <div><span className="eyebrow">{product.category_name}{product.brand ? ` · ${product.brand}` : ''}{product.sport ? ` · ${product.sport}` : ''}</span><h4>{product.name}</h4></div>
              {variants.length === 0 ? <small className="muted-small">Sin variantes activas.</small> : <div className="pos-variants">{variants.map((variant) => <button type="button" key={variant.id} className="pos-variant" disabled={variant.available < 1 || saving} onClick={() => addVariant(product, variant)}>
                <span><b>{[variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku}</b><small>{variant.sku} · Disponible: {variant.available}</small></span><strong>{currency(variant.price)}</strong><span aria-hidden="true">＋</span>
              </button>)}</div>}
            </article>;
          })}</div>}
      </section>

      <section className="pos-checkout" aria-label="Carrito de venta">
        <h3>Venta actual <span className="count">{cartLines.length} líneas</span></h3>
        {cartLines.length === 0 ? <div className="empty-state">Agregá variantes para comenzar la venta.</div> : <div className="pos-cart">{cartLines.map(({ product, variant, quantity }) => <div className="pos-cart-line" key={variant.id}>
          <div className="pos-cart-title"><b>{product.name}</b><small>{variant.sku} · {[variant.size, variant.color].filter(Boolean).join(' / ') || 'General'}</small></div>
          <label className="pos-qty">Cant.<input type="number" min="0" max={variant.available} value={quantity} disabled={saving} onChange={(event) => changeQuantity(variant.id, event.target.value)} /></label>
          <b>{currency(Number(variant.price) * quantity)}</b>
          <button type="button" className="text-button" disabled={saving} onClick={() => removeLine(variant.id)}>Quitar</button>
        </div>)}</div>}
        <div className="pos-total"><span>Total</span><strong>{currency(total)}</strong></div>
        <form onSubmit={(event) => void submitSale(event)} className="pos-payment">
          <label>Medio de pago<select value={paymentMethod} disabled={saving} onChange={(event) => { changeSaleInput(); setPaymentMethod(event.target.value as PaymentMethod); }}>
            {(Object.keys(paymentLabels) as PaymentMethod[]).map((method) => <option key={method} value={method}>{paymentLabels[method]}</option>)}
          </select></label>
          {paymentMethod === 'CASH' && <label>Efectivo recibido<input type="number" min={total} step="0.01" required value={cashReceived} disabled={saving} onChange={(event) => { changeSaleInput(); setCashReceived(event.target.value); }} placeholder="0,00" /></label>}
          {paymentMethod === 'CASH' && Number(cashReceived) >= total && total > 0 && <p className="change-due">Vuelto: {currency(Number(cashReceived) - total)}</p>}
          <button type="submit" className="button primary pos-submit" disabled={!canCheckout}>{saving && <Busy />}{saving ? 'Registrando venta…' : 'Confirmar venta'}</button>
        </form>
        <small className="muted-small">El sistema registra el medio y el resultado informado. No procesa cobros externos ni emite factura fiscal.</small>
      </section>
    </div>

    {receipt && <section className="receipt-print" aria-label="Comprobante interno">
      <div className="receipt-header"><span className="eyebrow">TAGLIAFERRO · COMPROBANTE INTERNO</span><h3>Venta #{receipt.receipt_number}</h3><p>{new Date(receipt.created_at).toLocaleString('es-AR')}</p></div>
      <p><b>Atendió:</b> {receipt.cashier_name} · <b>Medio:</b> {paymentLabels[receipt.payment_method as PaymentMethod] ?? receipt.payment_method}</p>
      <div className="table-wrap"><table><thead><tr><th>Artículo / SKU</th><th>Variante</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>{receipt.items.map((item) => <tr key={`${receipt.id}-${item.variantId}`}><td>{item.productName}<small>{item.sku}</small></td><td>{[item.size, item.color].filter(Boolean).join(' / ') || 'General'}</td><td>{item.quantity}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.lineTotal)}</td></tr>)}</tbody></table></div>
      <div className="pos-total"><span>Total registrado</span><strong>{currency(receipt.total)}</strong></div>
      {receipt.change_due !== null && <p>Recibido: {currency(receipt.cash_received!)} · Vuelto: {currency(receipt.change_due)}</p>}
      <p className="muted-small">Comprobante interno. No es una factura fiscal ni confirma un cobro externo.</p>
      <button type="button" className="button outline no-print" onClick={() => window.print()}>Imprimir comprobante</button>
    </section>}

    <section className="movement-section pos-history">
      <div className="section-heading"><div><span className="eyebrow">REGISTROS</span><h2>Historial de ventas</h2></div></div>
      {loadingHistory ? <div className="skeleton-list" aria-label="Cargando ventas"><div className="skeleton-row"/></div>
        : history.length === 0 ? <div className="empty-state">Todavía no hay ventas registradas.</div>
        : <div className="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Empleado</th><th>Detalle</th><th>Unidades</th><th>Medio</th><th>Total</th></tr></thead><tbody>{history.map((sale) => <tr key={sale.id}>
          <td><button type="button" className="text-button" onClick={() => void openReceipt(sale.id)}>#{sale.receipt_number}</button></td><td>{new Date(sale.created_at).toLocaleString('es-AR')}</td><td>{sale.cashier_name}</td><td>{sale.item_summary}</td><td>{sale.item_count}</td><td>{paymentLabels[sale.payment_method as PaymentMethod] ?? sale.payment_method}</td><td><b>{currency(sale.total)}</b></td>
        </tr>)}</tbody></table></div>}
    </section>
  </section>;
}

