# Tienda de Deportes · Etapa 4

Aplicación web con React, TypeScript, Vite, Express y PostgreSQL en Supabase. El backend accede a la base mediante `pg`; el frontend se comunica con la API REST bajo `/api/v1` y nunca se conecta a PostgreSQL.

## Requisitos

- Node.js 20.19+ o 22.12+ y npm.
- Proyecto Supabase con una URL completa del Session Pooler en `DATABASE_URL`.

## Instalación

Desde la raíz:

```sh
npm install
```

Copiá `backend/.env.example` como `backend/.env` y configurá `DATABASE_URL`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`. En desarrollo local usá `COOKIE_SECURE=false`.

## Migraciones e inicio

```sh
npm run db:migrate
npm run db:check
npm run admin:init
npm run dev
```

Frontend: http://localhost:5173 · API: http://localhost:3000 · salud: `GET /health` · base de datos: `GET /ready`.

Las migraciones de Etapas 3 y 4 agregan catálogo/inventario y ventas POS sin reinicializar las tablas existentes. La migración POS crea ventas y renglones, además de agregar movimientos `POS_SALE`; su `down` no es automático para preservar el historial.

## Funcionalidad

- Etapa 2: autenticación por sesiones, roles, administración de usuarios y revocación de sesiones al desactivar usuarios.
- Etapa 3: catálogo con búsqueda y categorías, productos/variantes/SKU, control de stock por variante, entradas y ajustes auditables, alertas de stock bajo y reactivación de empleados.
- Etapa 4: POS para ADMIN y EMPLOYEE con carrito, existencias disponibles, ventas transaccionales e idempotentes, comprobante interno imprimible e historial (ADMIN global, EMPLOYEE propio).
- ADMIN administra catálogo y stock correctivo; EMPLOYEE consulta inventario y registra entradas; CUSTOMER sólo consulta el catálogo público.
- Las operaciones de stock usan transacciones y bloqueo de fila para evitar cantidades inconsistentes. Las escrituras requieren sesión, rol, origen permitido y CSRF.

Esta etapa no incluye carrito de compras online, pedidos, pasarela de pago ni proyectos. Los medios de pago del POS se registran como datos declarados; no se procesan cobros externos ni se emiten facturas fiscales. Más detalle en [docs/ETAPA3.md](docs/ETAPA3.md) y [docs/ETAPA4.md](docs/ETAPA4.md).

## Build y pruebas

```sh
npm run build
npm test
```

Las pruebas unitarias no escriben en Supabase. La integración utiliza `DATABASE_URL` y crea/limpia únicamente sus datos propios. Ejecutala solo con acceso autorizado a la base configurada.
