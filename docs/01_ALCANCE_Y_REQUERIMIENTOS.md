> Actualización para Etapa 2: este repositorio usa Supabase PostgreSQL mediante DATABASE_URL, pg y SQL parametrizado. Se reemplazan las referencias de este documento a ORM/Prisma, Docker/Docker Compose y PostgreSQL local. El esquema que se migra ahora se limita a usuarios y sesiones; los demás módulos quedan para etapas posteriores. Ver docs/ETAPA2.md para comandos e implementación vigentes.

# Proyecto Tienda de Deportes â€” Ã­ndice y decisiones

**VersiÃ³n:** 1.0 (propuesta de especificaciÃ³n; pendiente aprobaciÃ³n del equipo)  
**Fecha:** 09/10/2026  
**Estado:** planificaciÃ³n documental, sin desarrollo iniciado.

## 1. Fuente y alcance del documento

**Exigido por la consigna (PDF de dos pÃ¡ginas):** gestionar el ciclo de vida de proyectos internos y desarrollar mÃ³dulos de inventario, ventas (e-commerce y POS), y gestiÃ³n de clientes y empleados. Se solicitan tres roles: administrador, empleado y cliente. TambiÃ©n exige documento de requerimientos, prototipos Figma, cÃ³digo, base de datos, informe de pruebas y presentaciÃ³n final.

**Definido aquÃ­ por propuesta tÃ©cnica:** stack, reglas detalladas, endpoints, campos, estados de pedidos, operaciÃ³n del POS, reglas de stock, modelo de datos, flujos de pago, pantallas y estrategia de pruebas. Estas decisiones no aparecen detalladas en la consigna.

## 2. Principios

1. MVP demostrable y funcional, antes de agregar funcionalidades opcionales.
2. Un solo stock para ventas online y presenciales, actualizado por transacciones.
3. Backend como autoridad: el cliente nunca define precios ni confirma pagos.
4. Una sola aplicaciÃ³n web adaptable a celular, tablet y escritorio.
5. SeparaciÃ³n modular de responsabilidades sin introducir microservicios innecesarios.
6. Trazabilidad de movimientos de stock, cambios crÃ­ticos y operaciones de caja.

## 3. Decisiones propuestas (ADR simplificados)

| ID | Tema | DecisiÃ³n | Motivo |
|---|---|---|---|
| D01 | Plataforma | Web responsive | Satisface web pÃºblica y caja en PC sin mantener dos apps. |
| D02 | Frontend | React + TypeScript + Vite | Componentes reutilizables, tipado y rapidez de desarrollo. |
| D03 | Backend | Node.js + Express + TypeScript | API modular, uniforme con frontend. |
| D04 | Persistencia | PostgreSQL + ORM y migraciones | Integridad relacional y transacciones ACID. |
| D05 | Arquitectura | Monolito modular + REST `/api/v1` | Menor complejidad operativa que microservicios. |
| D06 | Roles | ADMIN, EMPLOYEE, CUSTOMER | Coincide con roles solicitados. |
| D07 | Inventario | Por variante SKU, con disponible = fÃ­sico - reservado | Control de talles/colores y concurrencia. |
| D08 | POS | Web, conectado a servidor; efectivo y medios externos registrados manualmente | No depende de terminales POS especÃ­ficas. |
| D09 | E-commerce | Retiro en tienda, sin envÃ­os en MVP | Acota logÃ­stica sin perder venta online. |
| D10 | Pagos web | Mercado Pago Checkout Pro, integraciÃ³n en entorno de pruebas | Flujo de pago demostrable sin manejar datos de tarjeta. |
| D11 | Reserva | 30 minutos desde creaciÃ³n de pedido pendiente | Evita retener stock indefinidamente; pagos tardÃ­os se revisan. |
| D12 | Moneda y tienda | ARS; una tienda / depÃ³sito | Escenario inicial simple, ampliable. |
| D13 | IA | Fuera del alcance obligatorio; opcional en versiÃ³n posterior | La consigna no exige IA. |
| D14 | AutenticaciÃ³n | Sesiones HTTP-only; autorizaciÃ³n del lado servidor | Evita guardar credenciales en localStorage. |
| D15 | Recibos | Comprobante interno POS, no factura fiscal | FacturaciÃ³n fiscal exige una integraciÃ³n distinta. |

## 4. Dentro y fuera del MVP

**Incluido:** usuarios y roles; productos/categorÃ­as/variantes; stock y alertas; catÃ¡logo pÃºblico; registro y login; carrito; pedidos; pago online de prueba; notificaciones de pago; POS de caja; comprobante no fiscal; proyectos, fases y tareas; gestiÃ³n bÃ¡sica de clientes y empleados; pruebas; documentaciÃ³n.

**Fuera inicialmente:** facturaciÃ³n electrÃ³nica fiscal, pasarela de pagos presencial integrada a hardware, mÃºltiples sucursales, logÃ­stica y envÃ­os, cupones, puntos de fidelidad, predicciÃ³n con IA, compras a proveedores, contabilidad y devoluciones automÃ¡ticas de pagos en producciÃ³n. Las devoluciones se registrarÃ¡n internamente y requerirÃ¡n intervenciÃ³n administrativa.

## 5. Riesgos y dependencias

- Para integrar Mercado Pago en pruebas harÃ¡n falta credenciales de una cuenta de desarrollo, URL pÃºblica HTTPS para webhooks y configuraciÃ³n especÃ­fica de la aplicaciÃ³n.
- Para demostrar prototipos, deberÃ¡n crearse pantallas en Figma a partir de `06_PANTALLAS_Y_FIGMA.md`.
- La publicaciÃ³n y cobranza reales dependen de configuraciÃ³n operativa, fiscal y credenciales propias del comercio; no forman parte del MVP acadÃ©mico.
- El plazo y la cantidad de integrantes todavÃ­a no fueron especificados por la consigna: el orden de implementaciÃ³n no equivale a un cronograma aprobado.

## 6. Punto de control previo a programar

Aprobar las decisiones D01-D15, los criterios de aceptaciÃ³n, el modelo lÃ³gico y las reglas de venta/stock. Completar prototipos Figma principales. SÃ³lo entonces iniciar repositorio y desarrollo.

