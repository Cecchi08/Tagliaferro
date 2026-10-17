# Tienda de Deportes Tagliaferro

Aplicación académica full stack: React + TypeScript + Vite, API REST Express + TypeScript y PostgreSQL en Supabase. El navegador consume `/api/v1`; únicamente el backend usa `pg` y `DATABASE_URL` (Session Pooler). No hay ORM, base local, Docker Compose ni persistencia simulada.

## Requisitos y puesta en marcha

- Node.js 20.19+ o 22.12+, npm y un proyecto Supabase.
- Copiar `backend/.env.example` a `backend/.env`; completar `DATABASE_URL` con la URL del Session Pooler (puerto 5432) y configurar `FRONTEND_URL`, `COOKIE_SECURE=false` para desarrollo. Si la contraseña contiene caracteres reservados (`#`, `?`, `/`, `@`, `:`), codificarlos como `%23`, `%3F`, `%2F`, `%40`, `%3A` en la URL.
- Instalar, migrar e iniciar:

```sh
npm install
npm run db:migrate
npm run db:check
npm run admin:init
npm run dev
```

La API escucha en `http://localhost:3000` y Vite en `http://localhost:5173`. `admin:init` crea el administrador solo si no existe; las migraciones son aditivas y sus `down` protegidos no borran información.

## Funcionalidad entregada

- Etapa 2: sesiones de servidor, CSRF, Argon2id, roles ADMIN/EMPLOYEE/CUSTOMER y revocación de sesiones de empleados desactivados.
- Etapa 3: catálogo, SKU/variantes, inventario, recepciones, ajustes auditados, niveles mínimos y administración de empleados.
- Etapa 4: POS para ADMIN/EMPLOYEE, precio calculado en servidor, carrito, efectivo y otros medios declarados, idempotencia, bloqueo de stock, venta/movimientos atómicos, historial y comprobante interno imprimible (no fiscal).
- Etapa 5: catálogo online, carrito en navegador, pedidos e historial CUSTOMER, reservas compartidas con POS, cancelación/expiración segura, preferencia Checkout Pro y webhook firmado que vuelve a consultar el pago. Solo se aceptan credenciales `TEST-`; no se almacenan datos de tarjeta.
- Etapa 6: proyectos, fases, tareas, asignación a empleados, fechas/prioridades/estados/progreso y eventos de cambios; EMPLOYEE ve tareas propias y ADMIN gestiona el conjunto. La baja de un proyecto se conserva como estado CANCELLED.
- Etapa 7: navegación integrada por rol, formularios responsive, mensajes de carga/error/éxito, documentación técnica, guía de operación y wireframes escritos para trasladar a Figma.

## Variables de entorno

Consultar `backend/.env.example`. Además de `DATABASE_URL` y configuración de sesión:

- `MP_ACCESS_TOKEN`: access token de prueba de Mercado Pago, con prefijo `TEST-`.
- `MP_WEBHOOK_SECRET`: secreto emitido por la aplicación de Mercado Pago para verificar `x-signature`.
- `PUBLIC_API_URL`: URL HTTPS pública de la API para registrar notificaciones.
- `PAYMENT_RETURN_URL`: retorno visual del checkout; nunca confirma el pago.

No hay credenciales incluidas. Sin las dos credenciales de Mercado Pago, la tienda permite consultar catálogo pero el checkout devuelve 503. Con `MP_ACCESS_TOKEN`, el backend revisa expiraciones cada minuto; también puede ejecutarse manualmente `npm run orders:expire`. La rutina consulta Mercado Pago antes de liberar reservas vencidas y conserva las reservas si el proveedor no responde.

## Validación

El despliegue en dos proyectos Vercel, las variables requeridas y el esquema de cookies están documentados en [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

```sh
npm run build
npm run test:unit
npm run test:integration
npm test
```

Las pruebas de integración usan `DATABASE_URL` y únicamente son seguras si se aplicaron las migraciones y la suite puede crear y limpiar sus fixtures identificados. No hay requisito de `DATABASE_URL_TEST`. `npm run db:check` hace `SELECT 1`, verifica migraciones requeridas y RLS.

En la conexión revisada, `SELECT 1` respondió correctamente al codificar la contraseña en memoria. La URL guardada contiene caracteres reservados sin codificar; corregila en `backend/.env` según la sección de entorno antes de correr `npm run db:check` o iniciar la API. La base aún reporta pendientes las migraciones POS y Etapas 5/6; no se ejecutaron migraciones ni escrituras. Tampoco se probó un pago real. El resultado queda en [docs/07_PRUEBAS_Y_ENTREGA.md](docs/07_PRUEBAS_Y_ENTREGA.md).

## Rutas principales

- Público: `GET /api/v1/catalog/categories`, `GET /api/v1/catalog/products`, `GET /api/v1/catalog/products/:id`.
- POS: `POST/GET /api/v1/pos/sales`, `GET /api/v1/pos/sales/:id`.
- Tienda: `POST/GET /api/v1/store/orders`, `GET /api/v1/store/orders/:id`, `POST /api/v1/store/orders/:id/cancel`.
- Pago: `POST /api/v1/payments/mercadopago/webhook`.
- Proyectos: `/api/v1/projects`, fases y tareas en `/api/v1/projects/:id/...`, tareas asignadas en `/api/v1/projects/my-tasks`.

Ver [docs/ETAPA4.md](docs/ETAPA4.md), [docs/ETAPA5.md](docs/ETAPA5.md), [docs/ETAPA6.md](docs/ETAPA6.md), [docs/06_PANTALLAS_Y_FIGMA.md](docs/06_PANTALLAS_Y_FIGMA.md) y [docs/07_PRUEBAS_Y_ENTREGA.md](docs/07_PRUEBAS_Y_ENTREGA.md).
