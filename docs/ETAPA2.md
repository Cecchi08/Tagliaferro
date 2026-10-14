# Etapa 2 · estructura, Supabase, autenticación y roles

## Decisiones que rigen la implementación

Esta etapa usa React + TypeScript + Vite; Node.js + Express + TypeScript; PostgreSQL en Supabase; `pg` con SQL parametrizado; migraciones `node-pg-migrate`; API REST `/api/v1`; monolito modular; sesiones propias persistidas en PostgreSQL y roles ADMIN, EMPLOYEE y CUSTOMER. No se usan ORM, Docker, Docker Compose ni conexiones a PostgreSQL desde el navegador.

La carpeta `backend/` es el único lugar con acceso PostgreSQL. La URI `DATABASE_URL` completa se copia desde el diálogo Connect de Supabase, usando Session Pooler (modo sesión). TLS cifra la conexión y la aplicación omite intencionalmente la validación del certificado del servidor. Supabase documenta que este modo no verifica CA ni hostname. La URL, usuario, host y puerto deben copiarse, no reconstruirse ([conexión PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)).

## Tablas en esta etapa

- `users`: UUID, nombre, email único, hash Argon2id, rol, estado y marcas de tiempo.
- `sessions`: UUID, usuario, SHA-256 del token opaco, token CSRF, creación, vencimiento y revocación.

Ambas tablas habilitan RLS en `public` y revocan acceso a `PUBLIC`, `anon` y `authenticated`; solo el backend, conectado mediante `DATABASE_URL`, las gestiona. No se crean políticas públicas. La recomendación de Supabase es habilitar RLS para toda tabla en esquema expuesto y controlar grants además de políticas ([RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)). La cuenta/conexión backend debe conservar los permisos de migración y lectura/escritura requeridos.

Las entidades `categories` a `audit_logs` en el documento lógico v1 describen etapas futuras; esta migración no las crea. No hay migración de rollback que borre usuarios ni sesiones.

## API incluida

| Método y ruta | Acceso | Función |
|---|---|---|
| `POST /api/v1/auth/register` | Público | Registro CUSTOMER |
| `POST /api/v1/auth/login` | Público, límite de intentos | Crea sesión y cookie HttpOnly |
| `POST /api/v1/auth/logout` | Sesión + CSRF | Revoca sesión actual |
| `GET /api/v1/auth/me` | Público | Devuelve usuario actual o `null` y token CSRF |
| `GET /api/v1/auth/users` | ADMIN | Lista usuarios sin hashes |
| `POST /api/v1/auth/employees` | ADMIN | Crea exclusivamente EMPLOYEE |
| `POST /api/v1/auth/users/:id/deactivate` | ADMIN | Desactiva cuenta y revoca sus sesiones |
| `GET /health` | Público | Proceso HTTP activo |
| `GET /ready` | Público | Verifica `SELECT 1` |

Sesiones de 24 horas por defecto: token aleatorio de 256 bits, SHA-256 en BD y cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción. Las mutaciones verifican Origin exacto y token CSRF; CORS solo admite `FRONTEND_URL`. Desactivación se comprueba en cada lectura de sesión. Las contraseñas tienen un mínimo de 12 caracteres y se hashean con Argon2id. Respuestas y logs no contienen secretos.

## Variables

Completar `backend/.env` a partir de `backend/.env.example`: `DATABASE_URL`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`. `PORT`, `FRONTEND_URL`, `SESSION_TTL_HOURS`, `COOKIE_SECURE`, `SESSION_COOKIE_NAME` y `NODE_ENV` tienen valores de desarrollo. `frontend/.env.example` solo contiene `VITE_API_URL`, que no es secreto.

## Comandos

Desde la raíz: `npm install`, `npm run db:migrate`, `npm run db:check`, `npm run admin:init`, `npm run dev`, `npm run build`, `npm test`. No se requiere Supabase CLI ni ejecutar SQL manualmente.

## Pendientes verificables

La documentación funcional v1 detallada de tablas y flujos se conserva para etapas posteriores; la arquitectura vigente usa PostgreSQL en Supabase con `DATABASE_URL`, `pg` y migraciones `node-pg-migrate`. Las pruebas unitarias no requieren base; la integración usa `DATABASE_URL` y limpia únicamente fixtures con IDs creados por la propia suite.
