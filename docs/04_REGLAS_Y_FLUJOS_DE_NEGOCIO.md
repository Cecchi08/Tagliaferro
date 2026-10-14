> Arquitectura vigente: PostgreSQL alojado en Supabase mediante DATABASE_URL, pg, SQL parametrizado y node-pg-migrate. Ver docs/ETAPA2.md, docs/ETAPA3.md y docs/ETAPA4.md para funcionalidades implementadas.

# 03 â€” Modelo de datos y reglas de integridad

## 1. Entidades principales (modelo lÃ³gico)

| Tabla | Campos esenciales | Restricciones y relaciones |
|---|---|---|
| `users` | id, name, email, password_hash, role, active, created_at | email Ãºnico; role ADMIN/EMPLOYEE/CUSTOMER |
| `sessions` | id, user_id, token_hash, expires_at, revoked_at | FK users; no almacenar identificador de cookie en claro |
| `categories` | id, name, slug | slug Ãºnico |
| `products` | id, category_id, name, description, brand, sport, active | FK categories; desactivaciÃ³n lÃ³gica |
| `product_variants` | id, product_id, sku, size, color, price, active | FK products; SKU Ãºnico; `price` NUMERIC(12,2) |
| `inventory` | variant_id, on_hand, reserved, low_stock_threshold, updated_at | PK/FK variant; on_hand >= reserved >= 0 |
| `inventory_movements` | id, variant_id, delta, type, reason, actor_id, order_id, created_at | Libro mayor; `delta` con signo; no editar |
| `stock_reservations` | id, order_id, variant_id, quantity, status, expires_at | FK order/variant; una lÃ­nea por variante y pedido |
| `carts` | id, customer_id, updated_at | Un carrito activo por cliente |
| `cart_items` | id, cart_id, variant_id, quantity | FK; cantidad > 0; unicidad(cart,variant) |
| `orders` | id, customer_id nullable, channel, status, subtotal, total, created_by, created_at | channel ONLINE/POS; customer nullable POS |
| `order_items` | id, order_id, variant_id, sku_snapshot, name_snapshot, qty, unit_price, line_total | snapshots preservan historial |
| `payments` | id, order_id, provider, external_id, method, status, amount, created_at | external_id Ãºnico con proveedor si no nulo |
| `payment_events` | id, provider, external_event_id, payment_id, received_at | clave de idempotencia Ãºnica |
| `projects` | id, title, description, status, start_date, due_date, created_by | ADMIN gestiona |
| `project_phases` | id, project_id, name, sort_order, status | FK project; orden de fases |
| `tasks` | id, phase_id, title, description, assignee_id, status, due_date, completed_at | FK phase/user; progreso por tareas |
| `audit_logs` | id, actor_id, action, resource_type, resource_id, created_at, metadata | cambios crÃ­ticos sin secretos |

## 2. Relaciones destacadas

```text
users 1---N orders
users 1---N tasks (assignee)
products 1---N product_variants 1---1 inventory
categories 1---N products
product_variants 1---N inventory_movements
product_variants 1---N stock_reservations
carts 1---N cart_items
orders 1---N order_items
orders 1---N payments
orders 1---N stock_reservations
projects 1---N project_phases 1---N tasks
```

## 3. Integridad y normalizaciÃ³n

- Mantener datos atomizados y relaciones con claves forÃ¡neas, siguiendo tercera forma normal de forma razonable.
- Los importes monetarios son NUMERIC/DECIMAL(12,2), nunca `float`.
- El precio vigente sÃ³lo reside en variante; precio histÃ³rico se copia intencionalmente al Ã­tem de venta.
- El stock disponible es dato derivado: **available = on_hand - reserved**.
- RestricciÃ³n CHECK: `on_hand >= 0`, `reserved >= 0` y `on_hand >= reserved`.
- `orders.total` y snapshots se conservan por auditorÃ­a de ventas; no deben depender de cambios futuros de precio.
- No borrar fÃ­sicamente productos, variantes o usuarios relacionados a ventas; usar `active=false`.
- Ãndices: email, SKU, estado y fecha de pedidos, reserva/expires_at, movimientos por variante/fecha y tareas por responsable.

## 4. Estados

| Entidad | Estados vÃ¡lidos |
|---|---|
| Pedido ONLINE | PENDING_PAYMENT, PAID, EXPIRED, CANCELLED, REFUND_PENDING, REFUNDED |
| Pedido POS | PAID, REFUND_PENDING, REFUNDED |
| Reserva | ACTIVE, COMMITTED, RELEASED, EXPIRED |
| Pago | CREATED, PENDING, APPROVED, REJECTED, REFUNDED |
| Proyecto | PLANNED, ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| Fase | TODO, IN_PROGRESS, DONE |
| Tarea | TODO, IN_PROGRESS, BLOCKED, DONE |

Para pagos online aprobados despuÃ©s de expirar una reserva, no forzar PAID: registrar incidencia de conciliaciÃ³n con estado de pago aprobado y pedido en revisiÃ³n (campo `requires_review=true` en `orders`), sin descontar existencias. Esto obliga a resoluciÃ³n administrativa (entrega si hay stock o devoluciÃ³n).

