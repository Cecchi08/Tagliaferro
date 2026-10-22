# Etapa 4 — auditoría, implementación y validación

## Alcance y resultado

Esta revisión auditó el repositorio de Tienda de Deportes y completó el inicio del checkout de Mercado Pago, la reserva/confirmación transaccional de inventario y las operaciones de edición y eliminación de fases y tareas. El proveedor solo se activa cuando están configuradas sus cuatro credenciales/URLs de backend. No se probaron cobros reales ni se inspeccionó la base remota.

| Requerimiento | Estado | Evidencia / pendiente |
| --- | --- | --- |
| Proyectos, fases y tareas | Parcial | API con alta, consulta, edición de proyecto/tarea/fase, archivo de proyecto, eliminación autorizada de tarea/fase, permisos y eventos de avance. Falta evidencia en base aislada y ampliar interfaz para edición de fase. |
| Inventario | Parcial | Catálogo, SKU/variantes/precios, reservas, movimientos, alertas por umbral, bloqueo de stock negativo y locks transaccionales. Faltan pruebas contra esquema/base aislada tras los últimos cambios. |
| POS | Parcial | Precio calculado en backend, stock bloqueado, venta/movimiento atómicos, idempotencia y roles. La cobertura end-to-end existe en suite de integración, no se ejecutó por el riesgo de tocar la base configurada. |
| E-commerce y pagos | Parcial | Checkout Pro en backend, validación de firma HMAC, verificación de pago por API, reservas, vencimiento bajo demanda e idempotencia del inventario. Faltan credenciales, webhook HTTPS, prueba sandbox y revisión manual de pagos tardíos. |
| Clientes, empleados y roles | Parcial | Roles `ADMIN`, `EMPLOYEE`, `CUSTOMER`, sesiones de servidor, hashes Argon2id, revocación y autorización de rutas. No hay edición de perfiles ni verificación de usuarios reales. |
| Seguridad y despliegue | Parcial | CORS de origen explícito, validación Origin/CSRF, cookies HTTP-only/Secure en producción, API separada y proxy same-origin de Vercel. No se verificó el dashboard de Vercel ni la configuración efectiva de Supabase. |
| Documentación académica | Parcial | Este documento, cuestionario, plantilla de respuestas, retroalimentación, informe de pruebas, checklist de Figma y presentación editable con placeholders. Falta cargar datos reales. |

## Requisitos funcionales y no funcionales

**Funcionales:** catálogo por categoría y variante; gestión de stock y movimientos; caja POS; cuentas y permisos; pedidos online; gestión de proyectos, fases, tareas, responsables y progreso.

**No funcionales:** API REST en TypeScript, frontend React/Vite, PostgreSQL administrado por Supabase, separación frontend/backend en Vercel, validación en servidor, consultas parametrizadas, transacciones para stock/ventas/pedidos, sesión en cookie HTTP-only y no exposición de `DATABASE_URL` al navegador.

## Arquitectura y modelo de datos

```text
React + Vite ── /api (rewrite Vercel) ── Express REST ── pg ── PostgreSQL/Supabase
      │                                         │
      └── cookie de sesión same-origin          └── Mercado Pago Checkout Pro (opcional)
```

Entidades identificadas durante la auditoría de los SQL que estaban en el repositorio recibido: `users`, `sessions`, `categories`, `products`, `product_variants`, `inventory`, `inventory_movements`, `pos_sales`, `pos_sale_items`, `store_orders`, `store_order_items`, `stock_reservations`, `payment_notifications`, `projects`, `project_phases`, `project_tasks`, `project_task_events`. Los cuatro archivos históricos fueron retirados para cumplir la restricción de mantener `migrations` eliminada. La existencia de esas tablas/campos en la instancia remota no fue verificada. El backend requiere el esquema compatible; no ejecuta cambios de esquema.

## Reglas de negocio y permisos

- Solo `ADMIN` administra usuarios internos, catálogo, ajustes de stock y proyectos.
- `EMPLOYEE` puede registrar entradas de inventario, ventas POS y actualizar estado/progreso de tareas propias.
- `CUSTOMER` se registra como cliente, consulta únicamente sus pedidos y crea/cancela pedidos propios.
- POS y pedidos calculan precios con datos de la base. Las cantidades deben ser enteros positivos y el stock no baja de las reservas.
- Las claves idempotentes impiden duplicar ventas/pedidos ante reintentos. Un pago solo se confirma después del webhook firmado y de consultar el pago con el token privado.
- Los pedidos vencidos se liberan al consultarse pedidos o al iniciar un checkout. No hay un cron activo. Una aprobación tardía pasa a `REVIEW` para atención manual.
- El borrado de una tarea elimina también sus eventos de auditoría porque el esquema usa `ON DELETE RESTRICT`; el borrado está limitado a ADMIN. Archivar un proyecto cambia su estado a `CANCELLED`.

## Configuración Vercel

- Backend: `DATABASE_URL`, `FRONTEND_URL`. Para Checkout Pro: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PUBLIC_API_URL`, `PAYMENT_RETURN_URL`.
- Frontend: no requiere variable API con el rewrite actual. `VITE_API_URL` solo si el desarrollo local usa otro origen.
- No agregues secretos al frontend ni al `.env` local. Configurá un webhook HTTPS en Mercado Pago que apunte a `/api/v1/payments/webhook`.

## Estado del esquema y documento externo

No se generó SQL nuevo: el código usa tablas/campos identificados en los SQL preexistentes durante la auditoría. Esto no prueba que la base configurada tenga esas tablas. Los archivos históricos se retiraron del repositorio, no se ejecutaron y no se agregó una carpeta `migrations`. La base remota no fue modificada.

No se encontró un DOCX final en el repositorio. No se afirma que un documento externo haya sido actualizado; si existe, revisar arquitectura, roles, inventario/POS, checkout/pagos, configuración de Vercel, limitaciones y pruebas con los resultados reales de esta revisión.
