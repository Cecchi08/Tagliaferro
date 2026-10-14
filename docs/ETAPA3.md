# Etapa 3 · catálogo, inventario y administración de empleados

Esta etapa extiende la autenticación de Etapa 2 sin cambiar el stack: React/TypeScript/Vite, Express/TypeScript, PostgreSQL de Supabase mediante `pg`, SQL parametrizado y migraciones `node-pg-migrate`.

## Funcionalidad

- Catálogo con búsqueda por nombre, marca, deporte o SKU; filtro por categoría y disponibilidad por variante.
- ADMIN gestiona categorías, productos, atributos y estado de variantes; los productos y variantes se desactivan de forma lógica.
- ADMIN y EMPLOYEE consultan existencias por SKU, unidades físicas, reservadas y disponibles, y registran entradas con motivo.
- ADMIN también registra ajustes correctivos, edita productos/variantes y consulta el historial de movimientos.
- Stock y movimiento se guardan dentro de una transacción. La fila de inventario se bloquea con `FOR UPDATE`; restricciones y condición de actualización impiden stock físico negativo o inferior a las reservas.
- Las sesiones de un EMPLOYEE desactivado se revocan. ADMIN puede reactivarlo, pero las sesiones revocadas no se restauran.
- Formularios, filtros, carga inicial, listas y acciones muestran progreso/error/éxito/vacío según la petición real; los formularios conservan los datos si falla la petición.

## Roles y API

| Rutas | Permiso |
|---|---|
| `GET /api/v1/catalog/categories`, `GET /api/v1/catalog/products`, `GET /api/v1/catalog/products/:id` | Catálogo disponible públicamente; solo ADMIN puede pedir inactivos |
| `POST/PATCH /api/v1/catalog/categories` | ADMIN |
| `POST/PATCH /api/v1/catalog/products` y `/api/v1/catalog/products/:id/variants` | ADMIN |
| `PATCH /api/v1/catalog/variants/:id` | ADMIN |
| `GET /api/v1/inventory` y `POST /api/v1/inventory/receipts` | ADMIN, EMPLOYEE |
| `POST /api/v1/inventory/adjustments`, `GET /api/v1/inventory/movements` | ADMIN |
| `POST /api/v1/auth/users/:id/reactivate` | ADMIN; sólo una cuenta EMPLOYEE desactivada |

Todas las escrituras pasan la validación de origen/CSRF existente. CUSTOMER no puede consultar existencias internas ni ejecutar escrituras. El catálogo muestra únicamente productos y variantes activos.

## Migración y ejecución

La migración aditiva `backend/migrations/1791936000000_product_catalog_inventory.cjs` crea categorías, productos, variantes, inventario y movimientos. Habilita RLS y revoca acceso de `PUBLIC`, `anon` y `authenticated`; el acceso de la app sigue pasando por el backend con `DATABASE_URL`. No borra ni reinicia tablas existentes. Su `down` falla intencionalmente para evitar la pérdida accidental del catálogo o del historial.

Con `backend/.env` configurado y una copia de seguridad reciente, desde la raíz ejecutá:

```sh
npm run db:migrate
npm run db:check
npm run dev
```

La variante nueva inicia con stock cero; se registra el stock inicial desde la acción **Entrada**, de manera que también quede movimiento de auditoría.

## Pruebas

Las pruebas unitarias cubren permisos y lógica pura sin simular PostgreSQL. La suite de integración usa la misma `DATABASE_URL` de la aplicación. Sus fixtures se crean con identificadores nuevos, rastreados por la suite, y se borran únicamente esos registros al terminar. Antes de crear datos comprueba `SELECT 1` y que las migraciones y RLS requeridas estén presentes. La integración solo debe ejecutarse con acceso autorizado a esa base.

Desde la raíz, ejecutá:

```sh
npm run test:unit
npm run test:integration
npm test
npm run build
```

`npm test` ejecuta las pruebas unitarias y luego la integración real con `DATABASE_URL`. La suite no reinicia la base ni elimina filas existentes; crea y limpia exclusivamente sus propios actores, categoría, producto, variantes, movimientos y ventas.

## Límites de la Etapa 3

La Etapa 3 no incluyó POS, reservas, carrito, compras, pedidos, pagos ni proyectos. El POS se implementa en [ETAPA4.md](ETAPA4.md). La columna `reserved` permite calcular disponibilidad respetando reservas futuras; esta etapa no crea ni modifica reservas.
