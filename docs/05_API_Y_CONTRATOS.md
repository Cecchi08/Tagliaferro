# 04 — Flujos de negocio: inventario, POS, e-commerce y proyectos

## 1. Regla única de inventario

`stock_disponible = stock_fisico - stock_reservado`. Todas las operaciones críticas compiten por la misma fila de `inventory` dentro de transacciones; se bloquean variantes en orden estable para evitar condiciones de carrera. Nunca se acepta stock físico negativo ni reservado mayor al físico. Cada cambio físico genera `inventory_movements` inmutable. Una reserva cambia `reserved` pero **no** `on_hand`.

### Entradas y ajustes

1. ADMIN o EMPLOYEE registra entrada de mercancía, con referencia/motivo y cantidad positiva.
2. Backend valida variante activa y cantidad, bloquea fila, incrementa `on_hand` y registra movimiento RECEIPT.
3. Ajuste correctivo sólo ADMIN: exige motivo, delta positivo/negativo y valida no afectar reservas existentes.
4. Un artículo bajo o igual al `low_stock_threshold` aparece en alerta. No genera compra automática.

### Venta física POS

1. ADMIN/EMPLOYEE busca por nombre/SKU; selecciona variante y cantidad; precio viene del servidor.
2. El backend recalcula total y valida stock disponible.
3. Medio de pago: CASH (importe recibido/cambio) o EXTERNAL (pago confirmado manualmente; se registra referencia opcional). No procesa tarjetas ni QR directamente.
4. En **una única transacción**, bloquear stock, comprobar disponible, crear pedido POS PAID, guardar líneas y pago, descontar `on_hand`, registrar `inventory_movements` tipo POS_SALE y confirmar.
5. Devuelve comprobante interno numerado con fecha, cajero, artículos, cantidad, total, medio y vuelto (si efectivo). **No es factura fiscal.**
6. Si cae la red antes de recibir respuesta, el cliente reintenta con la misma clave de idempotencia; no se genera una segunda venta.

### Compra online y pago

1. Visitante consulta catálogo. CUSTOMER inicia sesión, completa carrito; añadir al carrito **no** reserva stock.
2. El backend recibe intento de checkout con clave de idempotencia, valida precio actualizado y cantidades.
3. En transacción bloquea variantes, comprueba `available`, crea pedido PENDING_PAYMENT y reservas ACTIVE por 30 minutos; incrementa `reserved`.
4. Fuera de esa transacción se solicita checkout al proveedor; la respuesta devuelve URL de pago.
5. El retorno del navegador indica sólo experiencia de usuario, **no** confirma la venta.
6. El backend recibe webhook y verifica la notificación y el estado actual de la operación con la API del proveedor; descarta duplicados.
7. Si el pago está aprobado y la reserva continúa activa, en una transacción descontar `on_hand` y `reserved`, crear movimientos ECOM_SALE, marcar reservas COMMITTED y pedido PAID.
8. Si se rechaza el pago, liberar reservas y cancelar el intento de pedido; el cliente puede volver a iniciar checkout.
9. Si se vence el plazo y el pago continúa no aprobado, una tarea programada verifica el estado del proveedor antes de liberar reservas y marcar pedido EXPIRED. Si el estado es incierto, mantener incidencia y reconciliar (sin doble venta).
10. Si llega un pago aprobado cuando la reserva ya fue liberada, **no descontar stock sin verificarlo**: se registra `requires_review` y se resuelve manualmente entrega o reembolso.

### Diagrama de estados simplificado

```text
Carrito -> Checkout -> PENDING_PAYMENT + reserva ACTIVE
                      |-- pago aprobado --> PAID + COMMITTED + salida de stock
                      |-- pago rechazado -> CANCELLED + RELEASED
                      |-- vence y se confirma no pago -> EXPIRED + EXPIRED
                      `-- aprobado después de vencer -> revisión administrativa
```

### Devolución/corrección de una venta pagada

ADMIN registra una devolución indicando cantidad y motivo. Los artículos **sólo** vuelven al stock si efectivamente se recibieron en condiciones de reventa. El retorno genera movimiento RETURN positivo. La devolución económica se marca REFUND_PENDING hasta confirmación manual o del proveedor; no simular reintegro monetario. Una venta pagada no se cancela eliminando sus movimientos.

## 2. Reglas de precio y pedido

- Precio y total se calculan en backend usando precios actuales del catálogo al crear pedido.
- Cada línea guarda `unit_price` y SKU/nombre históricos; cambios de catálogo no alteran el pedido.
- Moneda única ARS, sin promociones, cupones ni múltiples impuestos configurables en el MVP.
- Para el e-commerce inicial, **retiro en tienda**, sin costo de envío y sin integración logística.
- La compra online necesita cliente autenticado; POS admite cliente no identificado.
- La venta registrada nunca se borra, sólo se revierte por procesos auditados.

## 3. Proyectos internos

1. ADMIN crea proyecto con título, descripción, fechas, estado inicial PLANNED.
2. Crea fases ordenadas (ejemplo: Inicio, Planificación, Ejecución/Desarrollo, Monitoreo y control, Cierre).
3. Crea tareas por fase, asignadas a un EMPLOYEE o ADMIN, con fecha y estado.
4. EMPLOYEE ve sólo tareas asignadas y cambia entre TODO, IN_PROGRESS, BLOCKED y DONE; puede añadir comentario breve de avance.
5. ADMIN visualiza todas las tareas, reasigna, actualiza fases y cambia el estado del proyecto.
6. Porcentaje de progreso = tareas DONE / total de tareas × 100 (sin tareas: 0%).
7. Sólo se marca proyecto COMPLETED si todas sus tareas están DONE; la fecha queda registrada.

## 4. Casos extremos explícitos

- Dos cajeros intentan vender la última unidad: sólo uno confirma y el otro recibe 409 STOCK_INSUFFICIENT.
- Carrito muestra precio anterior: checkout recalcula e informa el precio nuevo antes de solicitar pago.
- Webhook repetido: el segundo evento no descuenta stock ni duplica movimientos.
- Pedido pendiente bloquea temporalmente productos; expiración/confirmación libera o consume la reserva una sola vez.
- Producto desactivado con venta histórica: se mantiene en comprobantes y reportes históricos.
- Empleado desactivado: sesiones revocadas, historial de ventas y tareas conservado.
- Ajuste negativo que invade unidades reservadas: rechazar con 409.
- Fallo entre DB y proveedor: pedido queda recuperable y permite reintento idempotente/conciliación.
