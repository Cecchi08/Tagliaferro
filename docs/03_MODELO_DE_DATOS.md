> Actualización para Etapa 2: este repositorio usa Supabase PostgreSQL mediante DATABASE_URL, pg y SQL parametrizado. Se reemplazan las referencias de este documento a ORM/Prisma, Docker/Docker Compose y PostgreSQL local. El esquema que se migra ahora se limita a usuarios y sesiones; los demás módulos quedan para etapas posteriores. Ver docs/ETAPA2.md para comandos e implementación vigentes.

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
  docs/                    # los archivos de esta documentaciÃ³n
  frontend/
    src/{app,pages,features,components,services,styles}/
  backend/
    src/{config,common,modules,jobs}/
    prisma/                # schema y migraciones si se usa Prisma
    tests/
  infra/
    docker-compose.yml
  .env.example
  README.md
```

No se requiere una app mÃ³vil nativa ni microservicios. Docker Compose simplifica ejecuciÃ³n reproducible en desarrollo; en producciÃ³n se desplegarÃ¡n los mismos componentes con HTTPS, variables seguras y respaldos.

## 4. Seguridad

1. ContraseÃ±as con Argon2id (o bcrypt con parÃ¡metros actuales); nunca en texto plano.
2. SesiÃ³n del lado servidor con identificador opaco, cookie `HttpOnly`, `Secure` en HTTPS y `SameSite=Lax`; invalidar al cerrar sesiÃ³n o desactivar cuenta.
3. ValidaciÃ³n estricta de entradas en API (por ejemplo Zod); consultas parametrizadas por ORM.
4. Middleware de rol y comprobaciÃ³n de propiedad del recurso en cada endpoint.
5. ProtecciÃ³n CSRF para escrituras autenticadas por cookie: validar origen y token anti-CSRF.
6. Rate limit de login y endpoints sensibles; manejo central de excepciones.
7. La confirmaciÃ³n de cobro sÃ³lo se obtiene consultando el proveedor y verificando webhook/origen; la URL de retorno del navegador no confirma el pago.
8. Guardar secretos en variables de entorno, nunca en repositorio.
9. Conservar bitÃ¡coras de negocio sin registrar datos de pago sensibles.

## 5. Ambientes

- **Local:** Frontend + Backend + PostgreSQL en Docker Compose, pasarela de prueba simulable; datos semilla.
- **Pruebas de integraciÃ³n:** DB aislada + credenciales sandbox + endpoint HTTPS de notificaciones.
- **ProducciÃ³n (no obligatoria):** hosting HTTPS, credenciales del comercio, copias de seguridad y polÃ­ticas de datos.

## 6. Disponibilidad, operaciÃ³n y auditorÃ­a

- `/health` verifica aplicaciÃ³n; `/ready` prueba conectividad a BD.
- Logs estructurados con `requestId`; seguimiento de errores API sin datos sensibles.
- Copias de seguridad para la base de datos, periodicidad segÃºn despliegue; prueba de restauraciÃ³n antes de publicar.
- Tareas programadas del backend para expirar reservas y reconsultar pagos inciertos, con tratamiento de duplicados.

## 7. Pasarela de pagos

Se propone **Mercado Pago Checkout Pro mediante Orders API**, por ser el flujo recomendado actualmente para nuevas integraciones. Se usarÃ¡ entorno de pruebas y notificaciones verificadas. La dependencia queda encapsulada detrÃ¡s de un `PaymentProvider`, para poder sustituirla sin cambiar la lÃ³gica de pedidos.

Referencias externas: https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-orders/overview y https://www.mercadopago.com.ar/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications

