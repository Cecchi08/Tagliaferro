# Tienda de Deportes

Aplicación académica full stack: React + TypeScript + Vite, API REST Express + TypeScript y PostgreSQL en Supabase Session Pooler. El navegador consume la API; únicamente el backend accede a PostgreSQL mediante `DATABASE_URL`.

## Desarrollo local

- Requiere Node.js y npm.
- Configurá `backend/.env` con `DATABASE_URL` apuntando al Session Pooler de Supabase (puerto 5432). No se requieren otras variables locales.
- Ejecutá `npm install` y `npm run dev`. La API escucha en `http://localhost:3000` y Vite en `http://localhost:5173`.
- El catálogo, las variantes, el carrito, el historial de pedidos, el inventario y el POS están disponibles. El checkout online requiere credenciales de Mercado Pago y una URL HTTPS pública; sin ellas devuelve `PAYMENTS_NOT_CONFIGURED` y no crea pedidos.

El backend usa PostgreSQL de Supabase mediante `pg`. El repositorio no mantiene la carpeta `migrations` y no ejecuta cambios de esquema al iniciar o desplegar. Verificá manualmente el esquema existente de Supabase antes de desplegar una revisión nueva.

## Despliegue en Vercel

Usá dos proyectos independientes desde el mismo repositorio, con Root Directory `frontend` y `backend` respectivamente. Configurá las variables por entorno en el dashboard de cada proyecto:

- **Backend:** `DATABASE_URL` (Supabase Session Pooler), `FRONTEND_URL` (origen HTTPS exacto del frontend) y, para activar el pago online, las cuatro variables `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_API_URL` (origen HTTPS del backend) y `PAYMENT_RETURN_URL` (origen HTTPS del frontend). `NODE_ENV=production` si Vercel no lo establece. Configuralas en Vercel, nunca en el `.env` local.
- **Frontend:** no necesita variable de API para el despliegue actual. `frontend/vercel.json` reescribe `/api/*` hacia el backend. `VITE_API_URL` solo corresponde a desarrollo local si se cambia el puerto/origen por defecto.

El frontend proxifica `/api/*` al backend mediante un rewrite externo de Vercel. Las cookies HTTP-only, `Secure` y `SameSite=Lax` quedan bajo el mismo origen del frontend. Configurá `FRONTEND_URL` con `https://tagliaferro.vercel.app` en el proyecto backend; en producción no se permite localhost ni un origen arbitrario.

Vercel compila el backend Express como función y el frontend con Vite en `dist`; las rutas del frontend usan fallback SPA. El pool de PostgreSQL mantiene un máximo pequeño por instancia para Supabase Session Pooler. No se configuran migraciones ni cron de pagos al desplegar.

## Funcionalidades

Autenticación con sesiones y permisos por rol, catálogo, inventario, POS y seguimiento de proyectos están implementados. Checkout Pro crea preferencias desde el backend, reserva existencias y procesa el webhook firmado después de verificar el pago en la API de Mercado Pago. La integración queda inactiva si faltan credenciales y no está validada en un entorno de pruebas o producción.

## Validación

`npm run test:unit` ejecuta pruebas unitarias. La suite `npm run test:integration` crea y elimina fixtures y exige `ALLOW_DESTRUCTIVE_TEST_DATABASE=true`; ejecutala solo con una URL a una base de pruebas aislada, nunca contra producción. Revisá `docs/INFORME_PRUEBAS.md` para los resultados de esta revisión.
