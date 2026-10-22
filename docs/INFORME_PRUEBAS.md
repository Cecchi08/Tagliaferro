# Informe de pruebas y verificaciones

Completar la tabla solo después de ejecutar cada caso. No inventar resultados ni capturas.

| ID | Módulo | Caso y precondiciones | Pasos | Resultado esperado | Resultado obtenido | Estado | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Auth/roles |  |  |  |  | Pendiente |  |
| PROJ-01 | Proyectos/fases/tareas |  |  |  |  | Pendiente |  |
| INV-01 | Inventario/stock bajo |  |  |  |  | Pendiente |  |
| POS-01 | Venta y stock |  |  |  |  | Pendiente |  |
| WEB-01 | Carrito/checkout/pedido |  |  |  |  | Pendiente |  |
| PAY-01 | Webhook, firma e idempotencia |  |  |  |  | Pendiente |  |

## Ejecuciones automatizadas de esta revisión

| Comando | Resultado real | Observación |
| --- | --- | --- |
| `npm run build --workspace backend` | Aprobado | TypeScript terminó sin errores. |
| `npm run test:unit` | Aprobado: 8 pruebas en 3 archivos | Auth/roles: 4; inventario: 2; firma de webhooks: 2. |
| `npm run build` | Aprobado | Backend TypeScript y frontend TypeScript/Vite; Vite generó `frontend/dist`. |
| `npm test` / suite de integración Supabase | Bloqueado antes de ejecución por revisión automática | El script incluye pruebas que crean y borran fixtures en la base configurada; no se confirmó una base aislada. |

## Verificaciones manuales pendientes

- [ ] Cuenta de pruebas y pagos sandbox de Mercado Pago configurados.
- [ ] Webhook HTTPS recibe firma válida y rechaza firma inválida.
- [ ] Pago aprobado/rechazado/pending se reconcilia desde API del proveedor.
- [ ] Stock y reservas observados en una base aislada.
- [ ] Roles y privacidad de pedidos verificados en interfaz.
- [ ] Vercel frontend/backend verificados en staging.
- [ ] Evidencias adjuntas con datos anonimizados.
