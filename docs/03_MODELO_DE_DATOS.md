> Arquitectura vigente: PostgreSQL alojado en Supabase mediante DATABASE_URL, pg, SQL parametrizado y node-pg-migrate. Ver docs/ETAPA2.md, docs/ETAPA3.md y docs/ETAPA4.md para funcionalidades implementadas.

# 02 â€” Arquitectura, infraestructura y seguridad

## 1. Vista de alto nivel

```text
Navegador (React/Vite; pÃ¡ginas pÃºblicas + paneles por rol)
   |
   | HTTPS / misma procedencia (reverse proxy)
   v
API REST Express/TypeScript (monolito modular)
   |-- Auth + Usuarios
   |-- CatÃ¡logo + Variantes
   |-- Inventario + Reservas
   |-- Carrito + Pedidos + POS
   |-- Pagos (adaptador Mercado Pago)
   |-- Proyectos + Fases + Tareas
   |-- AuditorÃ­a
   |
   +--> PostgreSQL (transacciones ACID)
   +--> Mercado Pago Checkout Pro (servicio externo, pruebas)
                      |
               Webhook validado --> API --> DB
```

El navegador jamÃ¡s modifica stock o marca un pedido pagado directamente.

## 2. MÃ³dulos y dependencias

- **Auth:** identidad, sesiones, middleware de rol y permisos.
- **Usuarios:** altas/bajas lÃ³gicas de empleados, perfil y clientes.
- **CatÃ¡logo:** categorÃ­as, productos, variantes, precios y bÃºsquedas.
- **Inventario:** reglas Ãºnicas de modificaciÃ³n, reservas, movimientos, alertas.
- **Comercio:** carrito, pedido, Ã­tems, precio congelado, historial.
- **POS:** operaciÃ³n atÃ³mica de caja; usa las mismas reglas de inventario.
- **Pagos:** inicia checkout, verifica confirmaciÃ³n del proveedor y procesa callbacks idempotentes.
- **Proyectos:** fases y tareas, responsable, estados, progreso calculado.
- **AuditorÃ­a:** eventos de negocio relevantes, sin almacenar secretos.

Dependencias unidireccionales recomendadas: controladores -> servicios -> repositorios -> base de datos. Otros mÃ³dulos invocan mÃ©todos pÃºblicos del mÃ³dulo inventario, nunca actualizan sus tablas directamente fuera de una transacciÃ³n coordinada.

## 3. Estructura tÃ©cnica propuesta

```text
tienda-deportes/
  docs/
  frontend/src/ui/
  backend/src/{config,common,modules,scripts}/
  backend/migrations/
  backend/.env.example
  README.md
```

La estructura implementada mantiene frontend y backend separados; la conexión a PostgreSQL ocurre exclusivamente desde el backend.

## 4. Seguridad

1. ContraseÃ±as con Argon2id (o bcrypt con parÃ¡metros actuales); nunca en texto plano.
2. SesiÃ³n del lado servidor con identificador opaco, cookie `HttpOnly`, `Secure` en HTTPS y `SameSite=Lax`; invalidar al cerrar sesiÃ³n o desactivar cuenta.
3. Validación estricta de entradas en API (Zod) y consultas SQL parametrizadas mediante pg.
4. Middleware de rol y comprobaciÃ³n de propiedad del recurso en cada endpoint.
5. ProtecciÃ³n CSRF para escrituras autenticadas por cookie: validar origen y token anti-CSRF.
6. Rate limit de login y endpoints sensibles; manejo central de excepciones.
7. La confirmaciÃ³n de cobro sÃ³lo se obtiene consultando el proveedor y verificando webhook/origen; la URL de retorno del navegador no confirma el pago.
8. Guardar secretos en variables de entorno, nunca en repositorio.
9. Conservar bitÃ¡coras de negocio sin registrar datos de pago sensibles.

## 5. Ambientes

- **Desarrollo:** frontend Vite, backend Express y PostgreSQL Supabase configurado mediante DATABASE_URL.
- **Integración:** usa la misma base Supabase de DATABASE_URL y limpia solo los registros con IDs creados por la suite.
- **ProducciÃ³n (no obligatoria):** hosting HTTPS, credenciales del comercio, copias de seguridad y polÃ­ticas de datos.

## 6. Disponibilidad, operaciÃ³n y auditorÃ­a

- `/health` verifica aplicaciÃ³n; `/ready` prueba conectividad a BD.
- Logs estructurados con `requestId`; seguimiento de errores API sin datos sensibles.
- Copias de seguridad para la base de datos, periodicidad segÃºn despliegue; prueba de restauraciÃ³n antes de publicar.
- Tareas programadas del backend para expirar reservas y reconsultar pagos inciertos, con tratamiento de duplicados.

## 7. Pasarela de pagos

Se propone **Mercado Pago Checkout Pro mediante Orders API**, por ser el flujo recomendado actualmente para nuevas integraciones. Se usarÃ¡ entorno de pruebas y notificaciones verificadas. La dependencia queda encapsulada detrÃ¡s de un `PaymentProvider`, para poder sustituirla sin cambiar la lÃ³gica de pedidos.

Referencias externas: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-orders/overview y https://www.mercadopago.com.ar/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications

