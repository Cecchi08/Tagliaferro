# Tienda de Deportes · Etapa 3

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

La migración de Etapa 3 crea categorías, productos, variantes, inventario y movimientos de manera aditiva. Las variantes comienzan con stock cero; usá **Entrada** para registrar existencias con su motivo. La migración no se revierte automáticamente porque eso borraría catálogo e historial.

## Funcionalidad

- Etapa 2: autenticación por sesiones, roles, administración de usuarios y revocación de sesiones al desactivar usuarios.
- Etapa 3: catálogo con búsqueda y categorías, productos/variantes/SKU, control de stock por variante, entradas y ajustes auditables, alertas de stock bajo y reactivación de empleados.
- ADMIN administra catálogo y stock correctivo; EMPLOYEE consulta inventario y registra entradas; CUSTOMER sólo consulta el catálogo público.
- Las operaciones de stock usan transacciones y bloqueo de fila para evitar cantidades inconsistentes. Las escrituras requieren sesión, rol, origen permitido y CSRF.

El alcance de Etapa 3 excluye POS, carrito, compras, pagos y proyectos. Más detalle en [docs/ETAPA3.md](docs/ETAPA3.md).

## Build y pruebas

```sh
npm run build
npm test
```

Las pruebas unitarias no escriben en Supabase. La verificación de persistencia requiere migrar una base aislada de pruebas; no apuntes pruebas que modifiquen datos a producción.
