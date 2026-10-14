# Etapa 4 · Punto de venta

El POS agrega ventas presenciales al catálogo e inventario de Etapa 3. La aplicación conserva una única conexión PostgreSQL de Supabase mediante `DATABASE_URL`, `pg` y migraciones `node-pg-migrate`. El navegador solo consume la API REST.

## Operación

- ADMIN y EMPLOYEE buscan por nombre, marca, deporte o SKU; seleccionan una variante con talle/color y stock disponible, forman el carrito y declaran el medio de pago.
- El sistema permite efectivo, débito, crédito, transferencia u otro. Guarda el medio elegido y el resultado interno `RECORDED`; no procesa pagos externos.
- El total se calcula en el backend con el precio vigente al confirmar. El efectivo recibido debe cubrir el total y se guarda el vuelto.
- Cada comprobante conserva número, fecha, cajero, medio y estado, además de SKU/nombre/talle/color/precio/cantidad congelados en sus renglones. Es comprobante interno, no factura fiscal.
- ADMIN consulta todas las ventas. EMPLOYEE consulta únicamente las que registró. CUSTOMER no puede acceder ni vender por el POS.

## Integridad

La migración aditiva `backend/migrations/1791985668046_pos_sales.cjs` crea `pos_sales` y `pos_sale_items`, habilita RLS y revoca permisos directos a `PUBLIC`, `anon` y `authenticated`. Agrega `sale_id` a `inventory_movements` y habilita movimientos `POS_SALE`.

Una única transacción bloquea las filas de inventario en orden estable, verifica `on_hand - reserved`, calcula importes en centavos, guarda venta y snapshots, actualiza stock y agrega un movimiento negativo por variante. Cualquier error revierte el conjunto. Una clave de idempotencia por cajero y una huella de la solicitud protegen reintentos y doble clic; reutilizar una clave con otro contenido responde conflicto.

Aplicá la migración con `npm run db:migrate`; consultá el esquema con `npm run db:check`. La migración `down` falla intencionalmente: revertirla borraría ventas y movimientos auditables.

## API

| Ruta | Permiso | Uso |
|---|---|---|
| `POST /api/v1/pos/sales` | ADMIN, EMPLOYEE | Confirma una venta con `idempotencyKey`, `paymentMethod`, `items` y, para CASH, `cashReceived`. |
| `GET /api/v1/pos/sales?limit=50` | ADMIN, EMPLOYEE | ADMIN ve todas; EMPLOYEE ve solo sus ventas. |
| `GET /api/v1/pos/sales/:id` | ADMIN, EMPLOYEE | Consulta comprobante; EMPLOYEE solo accede a uno propio. |

Las escrituras mantienen la protección CSRF y origen configurada por la API. Un reintento con la misma clave y contenido devuelve el comprobante ya creado; la misma clave con otro contenido responde `409`.

## Pruebas

`npm run test:unit` ejecuta pruebas puras. `npm run test:integration` y `npm test` usan la conexión ya configurada en `DATABASE_URL`; antes de insertar fixtures, la suite comprueba `SELECT 1`, el historial de migraciones y RLS. Solo crea actores, productos y variantes identificados por la suite, y al finalizar elimina en orden las ventas, movimientos y registros que esos actores crearon. Ejecutá integración únicamente cuando la ventana permita crear y limpiar esos datos temporales en la base configurada.

```sh
npm run test:unit
npm run test:integration
npm run build
```

El importe, el medio y el estado de pago son datos declarados para el registro interno. Esta etapa no incluye caja fiscal, devoluciones, carrito online, pedidos online ni pasarela de pagos.
