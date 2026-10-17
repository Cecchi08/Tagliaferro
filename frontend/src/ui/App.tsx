import { useCallback, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../api';
import { Pos } from './Pos';
import { Store } from './Store';
import { Projects } from './Projects';

type Role = 'ADMIN'|'EMPLOYEE'|'CUSTOMER';
type User = { id: string; name: string; email: string; role: Role; active: boolean };
type UserResult = { user: User | null; csrfToken?: string };
type AdminUser = User & { created_at: string };
type Category = { id: string; name: string; slug: string; active: boolean };
type Variant = { id: string; sku: string; size: string; color: string; price: string; active: boolean; onHand: number; reserved: number; available: number; lowStockThreshold: number; lowStock: boolean };
type Product = { id: string; category_id: string; name: string; description: string; brand: string; sport: string; active: boolean; category_name: string; variants: Variant[] };
type InventoryItem = { product_id: string; product_name: string; category_name: string; variant_id: string; sku: string; size: string; color: string; price: string; on_hand: number; reserved: number; available: number; low_stock_threshold: number; low_stock: boolean; variant_active: boolean; product_active: boolean };
type Movement = { id: string; sku: string; product_name: string; delta: number; type: string; reason: string; actor_name: string; created_at: string };
type Screen = 'home'|'inventory'|'catalog'|'users'|'pos'|'store'|'projects';

function Spinner() { return <span className="spinner" aria-hidden="true" />; }
function ActionButton({ children, busy, disabled, className = 'button primary' }: { children: React.ReactNode; busy?: boolean; disabled?: boolean; className?: string }) {
  return <button className={className} type="submit" disabled={disabled || busy}>{busy && <Spinner />}{children}</button>;
}
function ErrorMessage({ children }: { children: string }) { return children ? <div className="alert" role="alert">{children}</div> : null; }
function money(value: string) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value)); }

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<'login'|'register'>('login');
  const [view, setView] = useState<Screen>('home');
  const [authLoading, setAuthLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const showError = (err: unknown, fallback: string) => setError(err instanceof Error ? err.message : fallback);
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try { setUsers((await api<{users:AdminUser[]}>('/api/v1/auth/users')).users); }
    catch (err) { showError(err, 'No se pudo cargar la lista de usuarios.'); }
    finally { setUsersLoading(false); }
  }, []);

  const loadInventory = useCallback(async (filters = { q: filterQuery, categoryId: filterCategory, lowStock: onlyLowStock }) => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'EMPLOYEE')) return;
    setInventoryLoading(true); setError('');
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.lowStock) params.set('lowStock', 'true');
    try {
      const [inventoryResult, categoryResult] = await Promise.all([
        api<{inventory:InventoryItem[]}>(`/api/v1/inventory?${params}`),
        api<{categories:Category[]}>(`/api/v1/catalog/categories${user.role === 'ADMIN' ? '?includeInactive=true' : ''}`),
      ]);
      setInventory(inventoryResult.inventory); setCategories(categoryResult.categories);
      if (user.role === 'ADMIN') {
        const productResult = await api<{products:Product[]}>(`/api/v1/catalog/products?includeInactive=true`);
        setProducts(productResult.products);
        const movementResult = await api<{movements:Movement[]}>(`/api/v1/inventory/movements`);
        setMovements(movementResult.movements);
      }
    } catch (err) { showError(err, 'No se pudo cargar el inventario.'); }
    finally { setInventoryLoading(false); }
  }, [user, filterQuery, filterCategory, onlyLowStock]);

  const loadCatalog = useCallback(async () => {
    setInventoryLoading(true); setError('');
    try {
      const [productResult, categoryResult] = await Promise.all([
        api<{products:Product[]}>(`/api/v1/catalog/products?q=${encodeURIComponent(filterQuery)}${filterCategory ? `&categoryId=${filterCategory}` : ''}`),
        api<{categories:Category[]}>('/api/v1/catalog/categories'),
      ]);
      setProducts(productResult.products); setCategories(categoryResult.categories);
    } catch (err) { showError(err, 'No se pudo cargar el catálogo.'); }
    finally { setInventoryLoading(false); }
  }, [filterQuery, filterCategory]);

  useEffect(() => {
    api<UserResult>('/api/v1/auth/me').then((result) => { setUser(result.user); setCsrfToken(result.csrfToken ?? ''); })
      .catch(() => setError('No se pudo conectar con el servidor. Verificá que la API esté iniciada.'))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => { if (user?.role === 'ADMIN') void loadUsers(); }, [user, loadUsers]);
  useEffect(() => { if (view === 'inventory' && user && user.role !== 'CUSTOMER') void loadInventory(); }, [view, user]);
  useEffect(() => { if (view === 'catalog') void loadCatalog(); }, [view]);

  async function submitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); setAction('auth');
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      if (screen === 'register') {
        await api('/api/v1/auth/register', { method:'POST', body:JSON.stringify(values) });
        setNotice('Cuenta creada. Ya podés iniciar sesión.'); setScreen('login'); return;
      }
      const result = await api<{user:User;csrfToken:string}>('/api/v1/auth/login', { method:'POST', body:JSON.stringify(values) });
      setCsrfToken(result.csrfToken); setUser(result.user); setView('home');
    } catch (err) { showError(err, 'No se pudo completar la solicitud.'); }
    finally { setAction(''); }
  }

  async function logout() {
    setAction('logout'); setError('');
    try { await api('/api/v1/auth/logout', { method:'POST' }); setCsrfToken(''); setUser(null); setUsers([]); setView('home'); }
    catch (err) { showError(err, 'No se pudo cerrar sesión.'); }
    finally { setAction(''); }
  }

  async function createEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); setAction('create-employee');
    const form = e.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
    try { await api('/api/v1/auth/employees', { method:'POST', body:JSON.stringify(values) }); form.reset(); await loadUsers(); setNotice('Empleado creado.'); }
    catch (err) { showError(err, 'No se pudo crear el empleado.'); }
    finally { setAction(''); }
  }
  async function changeEmployee(id: string, active: boolean) {
    setAction(`${active ? 'reactivate' : 'deactivate'}-${id}`); setError(''); setNotice('');
    try {
      await api(`/api/v1/auth/users/${id}/${active ? 'reactivate' : 'deactivate'}`, { method:'POST' });
      setUsers((current) => current.map((item) => item.id === id ? { ...item, active } : item));
      setNotice(active ? 'Empleado reactivado. Debe iniciar sesión nuevamente.' : 'Cuenta desactivada y sesiones revocadas.');
    } catch (err) { showError(err, `No se pudo ${active ? 'reactivar' : 'desactivar'} al empleado.`); }
    finally { setAction(''); }
  }

  async function createCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget; const values=Object.fromEntries(new FormData(form).entries()); setAction('category'); setError(''); setNotice('');
    try { await api('/api/v1/catalog/categories',{method:'POST',body:JSON.stringify(values)}); form.reset(); setNotice('Categoría creada.'); await loadInventory(); }
    catch (err) { showError(err,'No se pudo crear la categoría.'); } finally { setAction(''); }
  }
  async function updateCategory(e: React.FormEvent<HTMLFormElement>, category: Category) {
    e.preventDefault(); const values=Object.fromEntries(new FormData(e.currentTarget).entries());
    setAction(`edit-category-${category.id}`); setError(''); setNotice('');
    try { await api(`/api/v1/catalog/categories/${category.id}`,{method:'PATCH',body:JSON.stringify(values)}); setNotice('Categoría actualizada.'); await loadInventory(); }
    catch (err) { showError(err,'No se pudo actualizar la categoría.'); } finally { setAction(''); }
  }
  async function createProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget; const values=Object.fromEntries(new FormData(form).entries()); setAction('product'); setError(''); setNotice('');
    try { await api('/api/v1/catalog/products',{method:'POST',body:JSON.stringify(values)}); form.reset(); setNotice('Producto creado. Ahora podés agregar sus variantes.'); await loadInventory(); }
    catch (err) { showError(err,'No se pudo guardar el producto.'); } finally { setAction(''); }
  }
  async function updateProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editingProduct) return;
    const values=Object.fromEntries(new FormData(e.currentTarget).entries()); setAction(`edit-product-${editingProduct.id}`); setError(''); setNotice('');
    try { await api(`/api/v1/catalog/products/${editingProduct.id}`,{method:'PATCH',body:JSON.stringify(values)}); setEditingProduct(null); setNotice('Producto actualizado.'); await loadInventory(); }
    catch (err) { showError(err,'No se pudo actualizar el producto.'); } finally { setAction(''); }
  }
  async function createVariant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget; const values=Object.fromEntries(new FormData(form).entries()); const productId=String(values.productId); delete values.productId;
    setAction(`variant-${productId}`); setError(''); setNotice('');
    try { await api(`/api/v1/catalog/products/${productId}/variants`,{method:'POST',body:JSON.stringify(values)}); form.reset(); setNotice('Variante creada. El stock inicial es cero; registrá una entrada para cargar existencias.'); await loadInventory(); }
    catch (err) { showError(err,'No se pudo crear la variante.'); } finally { setAction(''); }
  }
  async function updateVariant(e: React.FormEvent<HTMLFormElement>, variant: Variant) {
    e.preventDefault(); const raw=Object.fromEntries(new FormData(e.currentTarget).entries()); const values={...raw,lowStockThreshold:Number(raw.lowStockThreshold)};
    setAction(`edit-variant-${variant.id}`); setError(''); setNotice('');
    try { await api(`/api/v1/catalog/variants/${variant.id}`,{method:'PATCH',body:JSON.stringify(values)}); setNotice(`Variante ${variant.sku} actualizada.`); await loadInventory(); }
    catch (err) { showError(err,'No se pudo actualizar la variante.'); } finally { setAction(''); }
  }
  async function changeStock(e: React.FormEvent<HTMLFormElement>, variantId: string, type: 'receipt'|'adjustment') {
    e.preventDefault(); const form=e.currentTarget; const raw=Object.fromEntries(new FormData(form).entries());
    const payload=type==='receipt'?{variantId,quantity:Number(raw.quantity),reason:raw.reason}:{variantId,delta:Number(raw.delta),reason:raw.reason};
    setAction(`${type}-${variantId}`); setError(''); setNotice('');
    try {
      await api(`/api/v1/inventory/${type==='receipt'?'receipts':'adjustments'}`,{method:'POST',body:JSON.stringify(payload)});
      form.reset(); setNotice(type==='receipt'?'Entrada de stock registrada.':'Ajuste de stock registrado.'); await loadInventory();
    } catch (err) { showError(err,type==='receipt'?'No se pudo registrar la entrada.':'No se pudo ajustar el stock.'); }
    finally { setAction(''); }
  }
  async function toggleActive(path: string, active: boolean, label: string) {
    setAction(path); setError(''); setNotice('');
    try { await api(path,{method:'PATCH',body:JSON.stringify({active})}); setNotice(`${label} ${active?'activado':'desactivado'}.`); await loadInventory(); }
    catch (err) { showError(err,`No se pudo actualizar ${label.toLowerCase()}.`); } finally { setAction(''); }
  }
  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (view==='inventory') await loadInventory(); else await loadCatalog();
  }

  if (authLoading) return <main className="loading"><Spinner /> Cargando tu sesión...</main>;
  if (!user) return <main className="auth-layout"><section className="hero"><div className="brand"><span className="brand-mark">T</span> TIENDA DE DEPORTES</div><div><span className="eyebrow">TIENDA DE DEPORTES</span><h1>El próximo<br/>objetivo empieza<br/>acá.</h1><p>Tu espacio para equiparte, entrenar y llegar más lejos.</p></div><small>Rendimiento en movimiento · Desde 1988</small></section><section className="auth-panel"><div className="auth-box"><div className="mobile-brand">TIENDA DE DEPORTES <span>SPORT</span></div><span className="eyebrow">{screen==='login'?'QUÉ BUENO VERTE':'SUMATE AL EQUIPO'}</span><h2>{screen==='login'?'Iniciar sesión':'Crear cuenta'}</h2><p className="muted">{screen==='login'?'Ingresá tus datos para continuar.':'Registrate para acceder a tu cuenta de cliente.'}</p>
    <ErrorMessage>{error}</ErrorMessage>{notice&&<div className="success" role="status">{notice}</div>}
    <form onSubmit={submitAuth} className="form">
      {screen==='register'&&<label>Nombre completo<input name="name" autoComplete="name" required minLength={2} maxLength={100}/></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
      <label>Contraseña<input name="password" type="password" autoComplete={screen==='login'?'current-password':'new-password'} required minLength={screen==='login'?1:12} maxLength={128}/>{screen==='register'&&<small>Mínimo 12 caracteres.</small>}</label>
      <ActionButton busy={action==='auth'}>{action==='auth'?'Procesando...':screen==='login'?'Ingresar':'Crear cuenta'} <span>→</span></ActionButton>
    </form><p className="switch">{screen==='login'?'¿Todavía no tenés cuenta?':'¿Ya tenés cuenta?'} <button disabled={Boolean(action)} onClick={()=>{setError('');setNotice('');setScreen(screen==='login'?'register':'login')}}>{screen==='login'?'Registrate':'Iniciá sesión'}</button></p>
    </div></section></main>;

  const roleName = {ADMIN:'Administrador',EMPLOYEE:'Empleado',CUSTOMER:'Cliente'}[user.role];
  return <main className="dashboard"><header className="topbar"><a className="brand dark" href="#inicio" onClick={(e)=>{e.preventDefault();setView('home')}}><span className="brand-mark">T</span>TIENDA DE DEPORTES</a><nav className="main-nav" aria-label="Navegación principal"><button className={view==='home'?'selected':''} onClick={()=>setView('home')}>Inicio</button><button className={view==='catalog'?'selected':''} onClick={()=>setView('catalog')}>Catálogo</button><button className={view==='store'?'selected':''} onClick={()=>setView('store')}>Tienda online</button>{user.role!=='CUSTOMER'&&<><button className={view==='pos'?'selected':''} onClick={()=>setView('pos')}>Punto de venta</button><button className={view==='inventory'?'selected':''} onClick={()=>setView('inventory')}>Inventario</button><button className={view==='projects'?'selected':''} onClick={()=>setView('projects')}>Proyectos</button></>}{user.role==='ADMIN'&&<button className={view==='users'?'selected':''} onClick={()=>setView('users')}>Usuarios</button>}</nav><div className="top-actions"><span className="user-label"><b>{user.name}</b><small>{roleName}</small></span><button className="button outline" disabled={action==='logout'} onClick={()=>void logout()}>{action==='logout'&&<Spinner/>}{action==='logout'?'Saliendo...':'Cerrar sesión'}</button></div></header>
    {error&&<ErrorMessage>{error}</ErrorMessage>}{notice&&<div className="success" role="status">{notice}</div>}
    {view==='home'&&<><section className="welcome"><div><span className="eyebrow">PANEL DE {roleName.toUpperCase()}</span><h1>Hola, {user.name.split(' ')[0]}.</h1><p>Tu espacio de trabajo está listo.</p></div><div className="welcome-icon">↗</div></section><section className="cards"><article className="card"><div className="card-icon">◈</div><span className="eyebrow">CUENTA</span><h2>Sesión segura</h2><p>Tu sesión se guarda de forma privada y se cerrará automáticamente al expirar.</p><span className="pill">ACTIVA</span></article><article className="card"><div className="card-icon">♙</div><span className="eyebrow">TU PERFIL</span><h2>{roleName}</h2><p>{user.email}</p><span className="pill">HABILITADA</span></article><article className="card"><div className="card-icon">⚽</div><span className="eyebrow">CATÁLOGO</span><h2>Productos deportivos</h2><p>Consultá productos, variantes, talles, colores y precios.</p><button className="text-button" onClick={()=>setView('catalog')}>Explorar catálogo →</button></article></section></>}

    {view==='users'&&user.role==='ADMIN'&&<section className="admin-section"><div className="section-heading"><div><span className="eyebrow">ACCESOS DEL EQUIPO</span><h2>Usuarios</h2></div><span className="count">{users.length} cuentas</span></div>
      <form className="employee-form" onSubmit={createEmployee}><h3>Crear empleado</h3><div className="form-row"><label>Nombre<input name="name" required minLength={2} maxLength={100}/></label><label>Email<input name="email" type="email" required maxLength={254}/></label><label>Contraseña inicial<input name="password" type="password" required minLength={12} maxLength={128}/></label><ActionButton busy={action==='create-employee'}>{action==='create-employee'?'Creando...':'Crear empleado'}</ActionButton></div></form>
      {usersLoading?<div className="skeleton-list" aria-label="Cargando usuarios">{[1,2,3].map(n=><div className="skeleton-row" key={n}/>)}</div>:users.length===0?<div className="empty-state">Todavía no hay usuarios para mostrar.</div>:<div className="user-list">{users.map((item)=><div className="user-row" key={item.id}><div className="avatar">{item.name.slice(0,1).toUpperCase()}</div><div className="user-meta"><b>{item.name}</b><span>{item.email}</span></div><span className={`role ${item.role.toLowerCase()}`}>{item.role}</span><span className={`status ${item.active?'on':'off'}`}>{item.active?'Activo':'Desactivado'}</span>{item.role==='EMPLOYEE'&&item.id!==user.id&&(item.active?<button className="text-button" disabled={action===`deactivate-${item.id}`} onClick={()=>void changeEmployee(item.id,false)}>{action===`deactivate-${item.id}`?<Spinner/>:'Desactivar'}</button>:<button className="text-button" disabled={action===`reactivate-${item.id}`} onClick={()=>void changeEmployee(item.id,true)}>{action===`reactivate-${item.id}`?<Spinner/>:'Reactivar'}</button>)}</div>)}</div>}
    </section>}

    {view==='pos'&&user.role!=='CUSTOMER'&&<Pos/>}
    {view==='store'&&<Store customer={user.role==='CUSTOMER'}/>}
    {view==='projects'&&user.role!=='CUSTOMER'&&<Projects admin={user.role==='ADMIN'}/>}

    {(view==='inventory'||view==='catalog')&&<section className="admin-section inventory-section"><div className="section-heading"><div><span className="eyebrow">{view==='inventory'?'CONTROL DE EXISTENCIAS':'PRODUCTOS Y VARIANTES'}</span><h2>{view==='inventory'?'Inventario':'Catálogo'}</h2></div>{view==='inventory'&&<span className="count">{inventory.length} variantes</span>}</div>
      <form className="filter-bar" onSubmit={search}><label>Buscar<input value={filterQuery} onChange={e=>setFilterQuery(e.target.value)} placeholder="Nombre, marca o SKU" maxLength={100}/></label><label>Categoría<select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}><option value="">Todas las categorías</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{view==='inventory'&&<label className="checkbox-label"><input type="checkbox" checked={onlyLowStock} onChange={e=>setOnlyLowStock(e.target.checked)}/> Solo stock bajo</label>}<ActionButton className="button outline" busy={inventoryLoading}>{inventoryLoading?'Buscando...':'Buscar'}</ActionButton></form>
      {user.role==='ADMIN'&&<div className="management-grid"><form className="compact-form" onSubmit={createCategory}><h3>Nueva categoría</h3><div className="compact-fields"><label>Nombre<input name="name" required minLength={2} maxLength={100}/></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="calzado-deportivo" maxLength={120}/></label><ActionButton busy={action==='category'}>{action==='category'?'Guardando...':'Crear categoría'}</ActionButton></div></form>
        <div className="compact-form category-admin"><h3>Categorías</h3>{categories.length===0?<span className="muted-small">Todavía no hay categorías.</span>:categories.map(category=><form className="category-row" key={category.id} onSubmit={e=>void updateCategory(e,category)}><label>Nombre<input name="name" defaultValue={category.name} required minLength={2} maxLength={100}/></label><label>Slug<input name="slug" defaultValue={category.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120}/></label><button className="mini-button" type="submit" disabled={action===`edit-category-${category.id}`}>{action===`edit-category-${category.id}`?<Spinner/>:'Guardar'}</button><button className="text-button" type="button" disabled={action===`/api/v1/catalog/categories/${category.id}`} onClick={()=>void toggleActive(`/api/v1/catalog/categories/${category.id}`,!category.active,'Categoría')}>{category.active?'Desactivar':'Reactivar'}</button></form>)}</div>
        <form className="compact-form" onSubmit={createProduct}><h3>Nuevo producto</h3><div className="compact-fields"><label>Nombre<input name="name" required minLength={2} maxLength={160}/></label><label>Categoría<select name="categoryId" required defaultValue=""><option value="" disabled>Seleccionar</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Marca<input name="brand" maxLength={100}/></label><label>Deporte<input name="sport" maxLength={100}/></label><label className="span-all">Descripción<textarea name="description" maxLength={5000} rows={2}/></label><ActionButton busy={action==='product'}>{action==='product'?'Guardando...':'Crear producto'}</ActionButton></div></form>
        <form className="compact-form span-all" onSubmit={createVariant}><h3>Nueva variante</h3><div className="compact-fields"><label>Producto<select name="productId" required defaultValue=""><option value="" disabled>Seleccionar producto</option>{products.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>SKU<input name="sku" required maxLength={80}/></label><label>Talle<input name="size" maxLength={50}/></label><label>Color<input name="color" maxLength={50}/></label><label>Precio (ARS)<input name="price" type="number" required min="0" step="0.01"/></label><ActionButton busy={action.startsWith('variant-')}>{action.startsWith('variant-')?'Guardando...':'Agregar variante'}</ActionButton></div></form>
      </div>}
      {view==='inventory'?(inventoryLoading?<div className="skeleton-list" aria-label="Cargando inventario">{[1,2,3,4].map(n=><div className="skeleton-row" key={n}/>)}</div>:inventory.length===0?<div className="empty-state">No se encontraron variantes con esos filtros.</div>:<div className="table-wrap"><table><thead><tr><th>Producto / SKU</th><th>Variante</th><th>Físico</th><th>Reservado</th><th>Disponible</th><th>Precio</th><th>Estado</th><th>Registrar movimiento</th></tr></thead><tbody>{inventory.map(item=><tr key={item.variant_id}><td><b>{item.product_name}</b><small>{item.sku} · {item.category_name}</small></td><td>{[item.size,item.color].filter(Boolean).join(' / ')||'General'}</td><td>{item.on_hand}</td><td>{item.reserved}</td><td><strong className={item.low_stock?'low-stock':''}>{item.available}</strong>{item.low_stock&&<small className="low-label">Stock bajo (mín. {item.low_stock_threshold})</small>}</td><td>{money(item.price)}</td><td><span className={`status ${item.variant_active&&item.product_active?'on':'off'}`}>{item.variant_active&&item.product_active?'Activo':'Inactivo'}</span></td><td><form className="stock-form" onSubmit={e=>void changeStock(e,item.variant_id,'receipt')}><input aria-label="Cantidad a ingresar" name="quantity" type="number" min="1" required placeholder="Cant."/><input aria-label="Motivo de entrada" name="reason" required minLength={3} maxLength={500} placeholder="Motivo"/><button className="mini-button" type="submit" disabled={action===`receipt-${item.variant_id}`}>{action===`receipt-${item.variant_id}`?<Spinner/>:'Entrada'}</button></form>{user.role==='ADMIN'&&<form className="stock-form adjustment-form" onSubmit={e=>void changeStock(e,item.variant_id,'adjustment')}><input aria-label="Delta de ajuste" name="delta" type="number" required placeholder="± Cant."/><input aria-label="Motivo del ajuste" name="reason" required minLength={3} maxLength={500} placeholder="Motivo del ajuste"/><button className="mini-button" type="submit" disabled={action===`adjustment-${item.variant_id}`}>{action===`adjustment-${item.variant_id}`?<Spinner/>:'Ajustar'}</button></form>}</td></tr>)}</tbody></table></div>):(inventoryLoading?<div className="skeleton-list" aria-label="Cargando catálogo">{[1,2,3].map(n=><div className="skeleton-row" key={n}/>)}</div>:products.length===0?<div className="empty-state">Todavía no hay productos que coincidan con la búsqueda.</div>:<div className="product-list">{products.map(product=><article className="product-card" key={product.id}><div className="product-heading"><div><span className="eyebrow">{product.category_name} · {product.brand||'Sin marca'}{product.sport?` · ${product.sport}`:''}</span><h3>{product.name}</h3><p>{product.description||'Sin descripción.'}</p></div><span className={`status ${product.active?'on':'off'}`}>{product.active?'Activo':'Desactivado'}</span></div><div className="variant-chips">{product.variants.filter(v=>v.active).map(v=><span className={v.lowStock?'variant-chip low':''} key={v.id}>{v.sku} · {[v.size,v.color].filter(Boolean).join(' / ')||'General'} · {money(v.price)} · disp. {v.available}</span>)}{product.variants.filter(v=>v.active).length===0&&<span className="muted-small">Sin variantes activas.</span>}</div>{user.role==='ADMIN'&&<><div className="product-actions"><button className="text-button" onClick={()=>setEditingProduct(product)}>Editar producto</button><button className="text-button" disabled={action===`/api/v1/catalog/products/${product.id}`} onClick={()=>void toggleActive(`/api/v1/catalog/products/${product.id}`,!product.active,'Producto')}>{action===`/api/v1/catalog/products/${product.id}`?<Spinner/>:product.active?'Desactivar':'Reactivar'}</button></div>{editingProduct?.id===product.id&&<form className="compact-form edit-form" onSubmit={updateProduct}><h3>Editar {product.name}</h3><div className="compact-fields"><label>Nombre<input name="name" defaultValue={product.name} required minLength={2} maxLength={160}/></label><label>Categoría<select name="categoryId" defaultValue={product.category_id}>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Marca<input name="brand" defaultValue={product.brand} maxLength={100}/></label><label>Deporte<input name="sport" defaultValue={product.sport} maxLength={100}/></label><label className="span-all">Descripción<textarea name="description" defaultValue={product.description} maxLength={5000} rows={2}/></label><ActionButton busy={action===`edit-product-${product.id}`}>{action===`edit-product-${product.id}`?'Guardando...':'Guardar cambios'}</ActionButton><button type="button" className="button outline" onClick={()=>setEditingProduct(null)}>Cancelar</button></div></form>}{product.variants.map(variant=><form className="variant-edit" key={variant.id} onSubmit={e=>void updateVariant(e,variant)}><b>{variant.sku}</b><label>Talle<input name="size" defaultValue={variant.size} maxLength={50}/></label><label>Color<input name="color" defaultValue={variant.color} maxLength={50}/></label><label>Precio<input name="price" type="number" defaultValue={variant.price} min="0" step="0.01" required/></label><label>Mínimo<input name="lowStockThreshold" type="number" defaultValue={variant.lowStockThreshold} min="0" required/></label><ActionButton className="mini-button" busy={action===`edit-variant-${variant.id}`}>{action===`edit-variant-${variant.id}`?'Guardando...':'Guardar variante'}</ActionButton><button type="button" className="text-button" disabled={action===`/api/v1/catalog/variants/${variant.id}`} onClick={()=>void toggleActive(`/api/v1/catalog/variants/${variant.id}`,!variant.active,'Variante')}>{variant.active?'Desactivar':'Reactivar'}</button></form>)}</>}</article>)}</div>)}
      {view==='inventory'&&user.role==='ADMIN'&&<section className="movement-section"><div className="section-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h2>Movimientos recientes</h2></div></div>{inventoryLoading?<div className="skeleton-row"/>:movements.length===0?<div className="empty-state">Todavía no hay movimientos de stock.</div>:<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto / SKU</th><th>Tipo</th><th>Cambio</th><th>Motivo</th><th>Usuario</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString('es-AR')}</td><td>{m.product_name}<small>{m.sku}</small></td><td>{m.type==='RECEIPT'?'Entrada':'Ajuste'}</td><td className={m.delta>0?'positive':'negative'}>{m.delta>0?'+':''}{m.delta}</td><td>{m.reason}</td><td>{m.actor_name}</td></tr>)}</tbody></table></div>}</section>}
    </section>}
    <footer>TIENDA DE DEPORTES <span>·</span> RENDIMIENTO EN MOVIMIENTO</footer>
  </main>;
}
export default App;
