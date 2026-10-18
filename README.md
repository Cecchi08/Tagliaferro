# Tienda de Deportes

Aplicación académica full stack: React + TypeScript + Vite, API REST Express + TypeScript y PostgreSQL en Supabase Session Pooler. El navegador consume la API; únicamente el backend accede a PostgreSQL mediante `DATABASE_URL`.

## Desarrollo local

- Requiere Node.js y npm.
- Configurá `backend/.env` con `DATABASE_URL` apuntando al Session Pooler de Supabase (puerto 5432). No se requieren otras variables locales.
- Ejecutá `npm install` y `npm run dev`. La API escucha en `http://localhost:3000` y Vite en `http://localhost:5173`.
- El catálogo, las variantes, el carrito, el historial de pedidos, el inventario y el POS permanecen disponibles. El checkout online está deshabilitado hasta incorporar un proveedor de pagos.

La base existente ya está configurada en Supabase. Este repositorio ya no conserva el historial de migraciones y no ejecuta cambios de esquema al iniciar o desplegar. No se deben aplicar migraciones desde Vercel.

## Despliegue en Vercel

Usá dos proyectos independientes desde el mismo repositorio, con Root Directory `frontend` y `backend` respectivamente. Configurá las variables por entorno en el dashboard de cada proyecto:

- **Backend:** `DATABASE_URL` (cadena de conexión del Supabase Session Pooler, puerto 5432), `FRONTEND_URL` (origen HTTPS exacto del frontend, por ejemplo `https://tienda.example.com`) y `NODE_ENV=production` si Vercel no lo establece automáticamente. `FRONTEND_URL` se configura en Vercel, nunca en `.env`.
- **Frontend:** no necesita una variable de API. `frontend/vercel.json` reescribe `/api/*` hacia el proyecto backend para que el navegador use el mismo origen del frontend y envíe la cookie de sesión de forma compatible.

El frontend proxifica `/api/*` al backend mediante un rewrite externo de Vercel. Las cookies HTTP-only, `Secure` y `SameSite=Lax` quedan bajo el mismo origen del frontend. Configurá `FRONTEND_URL` con `https://tagliaferro.vercel.app` en el proyecto backend; en producción no se permite localhost ni un origen arbitrario.

Vercel compila el backend Express como función y el frontend con Vite en `dist`; las rutas del frontend usan fallback SPA. El pool de PostgreSQL mantiene un máximo pequeño por instancia para Supabase Session Pooler. No se configuran migraciones ni cron de pagos al desplegar.

## Funcionalidades

Autenticación con sesiones y permisos por rol, catálogo, inventario y POS siguen en funcionamiento. Se conservan las consultas del historial de pedidos. Crear nuevos pedidos online está deshabilitado y no se simulan pagos ni confirmaciones. Las ventas presenciales y sus medios de pago no dependen de ese checkout.

## Validación

`npm run test:unit` ejecuta las pruebas unitarias. La suite `npm run test:integration` escribe fixtures temporales en la base configurada y luego los elimina; solo debe ejecutarse contra una base de pruebas aislada autorizada, nunca contra producción.
