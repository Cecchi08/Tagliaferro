# 05 — Contratos API REST propuestos

**Prefijo:** `/api/v1` — JSON; zonas privadas requieren sesión; errores consistentes `{"error":{"code":"...","message":"..."}}` y un `requestId`. Las rutas son diseño previo al desarrollo y pueden afinarse sin cambiar reglas de negocio.

## 1. Identidad y usuarios

| Método y ruta | Actor | Función |
|---|---|---|
| `POST /auth/register` | Público | Alta CUSTOMER |
| `POST /auth/login` | Público | Inicio de sesión |
| `POST /auth/logout` | Autenticado | Invalidar sesión |
| `GET /auth/me` | Autenticado | Usuario y rol actual |
| `GET /admin/users` | ADMIN | Listado de empleados y clientes |
| `POST /admin/employees` | ADMIN | Alta empleado |
| `PATCH /admin/users/:id` | ADMIN | Editar perfil, activar/desactivar, rol permitido |

## 2. Catálogo, inventario y carrito

| Método y ruta | Actor | Función |
|---|---|---|
| `GET /products` | Público | Catálogo con filtros, búsqueda y paginación |
| `GET /products/:id` | Público | Detalle, variantes y disponibilidad |
| `POST /admin/products` | ADMIN | Crear producto |
| `PATCH /admin/products/:id` | ADMIN | Editar/desactivar producto |
| `POST /admin/products/:id/variants` | ADMIN | Añadir SKU/talle/color/precio |
| `PATCH /admin/variants/:id` | ADMIN | Cambiar atributos/precio/estado |
| `GET /inventory` | ADMIN/EMPLOYEE | Existencia, reserva, disponible y alertas |
| `POST /inventory/receipts` | ADMIN/EMPLOYEE | Registrar ingreso de stock |
| `POST /inventory/adjustments` | ADMIN | Corregir existencia con motivo |
| `GET /inventory/movements` | ADMIN | Historial auditable |
| `GET /cart` | CUSTOMER | Mi carrito |
| `POST /cart/items` | CUSTOMER | Agregar variante y cantidad |
| `PATCH /cart/items/:id` | CUSTOMER | Ajustar cantidad |
| `DELETE /cart/items/:id` | CUSTOMER | Retirar variante |

## 3. Ventas, pagos y POS

| Método y ruta | Actor | Función |
|---|---|---|
| `POST /checkout` | CUSTOMER | Crear pedido/reserva e iniciar pago online |
| `GET /orders/me` | CUSTOMER | Historial propio |
| `GET /orders/:id` | Propietario o ADMIN | Detalle del pedido |
| `GET /admin/orders` | ADMIN | Pedidos de ambos canales |
| `POST /pos/sales` | ADMIN/EMPLOYEE | Registrar venta presencial atomizada |
| `GET /pos/sales/:id/receipt` | ADMIN/EMPLOYEE autorizado | Comprobante interno |
| `POST /payments/webhooks/mercadopago` | Proveedor validado | Recibir evento y reconciliar transacción |
| `POST /admin/orders/:id/returns` | ADMIN | Registrar devolución controlada |

## 4. Proyectos

| Método y ruta | Actor | Función |
|---|---|---|
| `GET /projects` | ADMIN/EMPLOYEE | ADMIN todos; EMPLOYEE asignados |
| `POST /projects` | ADMIN | Crear proyecto |
| `PATCH /projects/:id` | ADMIN | Actualizar estado/datos |
| `POST /projects/:id/phases` | ADMIN | Añadir fase |
| `POST /phases/:id/tasks` | ADMIN | Añadir tarea |
| `GET /tasks/mine` | EMPLOYEE/ADMIN | Tareas propias |
| `PATCH /tasks/:id/status` | ADMIN o asignado | Cambiar estado con permisos |

## 5. Contratos de error y seguridad

| HTTP | Código | Cuándo |
|---|---|---|
| 400/422 | VALIDATION_ERROR | Datos inválidos, cantidad <= 0, estado inválido |
| 401 | UNAUTHENTICATED | Sin sesión válida |
| 403 | FORBIDDEN | Rol o propiedad del recurso insuficiente |
| 404 | NOT_FOUND | Entidad inexistente o no visible |
| 409 | STOCK_INSUFFICIENT | Inventario disponible no alcanza |
| 409 | PRICE_CHANGED | El precio cambió; requiere aceptar nuevo total |
| 409 | INVALID_STATE | Transición no permitida |
| 409 | DUPLICATE_REQUEST | Idempotencia inconsistente |
| 503 | PAYMENT_PROVIDER_UNAVAILABLE | Error de pasarela; el pedido se conserva para conciliación |

Usar cabecera `Idempotency-Key` en operaciones que crean cobro/reserva/venta. Los webhooks se identifican con identificador del evento y una clave única en la base. Todos los listados soportan paginación y límites. Las fechas se guardan en UTC y se presentan en hora local.
