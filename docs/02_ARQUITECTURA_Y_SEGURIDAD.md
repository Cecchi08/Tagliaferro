# 01 — Requerimientos funcionales y no funcionales

## 1. Objetivo general

Diseñar y construir un sistema para gestionar proyectos internos y operaciones de una tienda de deportes, integrado con inventario, ventas online y ventas físicas, con accesos según rol.

## 2. Actores

| Rol | Acceso y responsabilidades |
|---|---|
| Administrador (ADMIN) | Mantener productos, precios, usuarios empleados, stock, supervisar todas las ventas, gestionar proyectos y consultar reportes. |
| Empleado (EMPLOYEE) | Operar POS, consultar catálogo y existencias, registrar entradas autorizadas de stock, actualizar sus tareas y consultar ventas propias. |
| Cliente (CUSTOMER) | Registrarse, iniciar sesión, consultar catálogo, manejar carrito, pagar compras y ver sus pedidos. |
| Visitante (sin cuenta) | Navegar catálogo; debe registrarse o iniciar sesión para pagar. |

## 3. Matriz de permisos base

| Recurso/acción | ADMIN | EMPLOYEE | CUSTOMER |
|---|---|---|---|
| Catálogo público | Sí | Sí | Sí |
| Crear/editar/desactivar productos y precios | Sí | No | No |
| Consultar inventario y alertas | Sí | Sí | No (sólo disponibilidad pública) |
| Entrada de stock | Sí | Sí, identificando motivo y usuario | No |
| Ajustes correctivos y devoluciones a stock | Sí | No | No |
| Registrar venta en POS | Sí | Sí | No |
| Consultar todas las ventas | Sí | No (sólo propias) | No (sólo sus pedidos) |
| Crear proyectos/asignaciones | Sí | No | No |
| Ver tareas asignadas y cambiar estado | Sí | Sí | No |
| Crear empleados o cambiar roles | Sí | No | No |
| Compras online | Sí | Sí (como cliente, si corresponde) | Sí |

Nota: iniciar sesión como ADMIN/EMPLOYEE no habilita ignorar las reglas de carrito, stock y pago.

## 4. Requerimientos funcionales (RF)

| ID | Prioridad | Requerimiento | Criterio verificable |
|---|---|---|---|
| RF01 | P0 | Registro y login de clientes | Un cliente se registra, inicia y cierra sesión. |
| RF02 | P0 | Roles y permisos | Un cliente recibe 403 al intentar gestionar stock o POS. |
| RF03 | P0 | Gestión de empleados | ADMIN crea, desactiva y consulta empleados. |
| RF04 | P0 | Catálogo y búsquedas | Listar, filtrar por categoría/deporte y buscar por nombre/SKU. |
| RF05 | P0 | Productos y variantes | ADMIN administra talles, colores, SKU único, precios y estado activo. |
| RF06 | P0 | Inventario y alertas | Entradas, ventas y ajustes reflejan cantidad disponible y mínimo. |
| RF07 | P0 | Carrito | Cliente agrega, cambia cantidades y elimina productos. |
| RF08 | P0 | Checkout online | Backend recalcula total y reserva existencias. |
| RF09 | P0 | Pago online de prueba | Pedido pasa a pagado sólo tras confirmación verificada. |
| RF10 | P0 | POS | Empleado cobra venta física y se descuenta stock una sola vez. |
| RF11 | P0 | Historial | Cliente ve sólo sus pedidos; administrador ve ventas globales. |
| RF12 | P0 | Proyectos | ADMIN crea proyectos y etapas/fases con estados y fechas. |
| RF13 | P0 | Tareas y seguimiento | ADMIN asigna tareas; empleado actualiza sus estados; avance visible. |
| RF14 | P0 | Clientes | ADMIN visualiza clientes sin acceder a sus contraseñas. |
| RF15 | P0 | Comprobante | POS entrega resumen interno con ítems, total, medio, fecha y número. |
| RF16 | P0 | Cancelación y expiración | Reservas pendientes se liberan sin alterar stock físico. |
| RF17 | P1 | Dashboard | ADMIN ve alertas y ventas resumidas del período. |
| RF18 | P1 | Auditoría básica | Entradas, ajustes, ventas y cambios de roles quedan registrados. |

**P0** es necesario para la entrega funcional. **P1** mejora la demostración y la calidad, sin bloquear la arquitectura.

## 5. Reglas no funcionales (RNF)

| ID | Regla | Validación propuesta |
|---|---|---|
| RNF01 | Seguridad | Contraseñas hasheadas; cookies HttpOnly/Secure en producción; control RBAC en API. |
| RNF02 | Integridad | No generar stock negativo, doble cobro lógico ni doble movimiento por webhook repetido. |
| RNF03 | Consistencia | POS y e-commerce consumen la misma fuente de datos transaccional. |
| RNF04 | Usabilidad | Interfaces responsive; flujos principales navegables con teclado. |
| RNF05 | Rendimiento | Objetivo inicial: respuestas API comunes <= 1 s p95 en entorno de prueba local, excluyendo terceros. |
| RNF06 | Mantenibilidad | Módulos aislados, migraciones versionadas, validación central y errores estandarizados. |
| RNF07 | Pruebas | Automatizar flujos de stock, POS, checkout, permisos y reservas. |
| RNF08 | Trazabilidad | Registro de usuario, motivo, fecha y cantidad para movimientos de inventario. |
| RNF09 | Recuperación | Backups de DB y procedimiento documentado de restauración antes de despliegue. |
| RNF10 | Datos | No almacenar números de tarjeta ni credenciales de terceros en frontend o Git. |

Las cifras de rendimiento son **objetivos propuestos**, no exigencias textuales de la consigna.

## 6. Historias de usuario y aceptación

- **Como cliente**, quiero filtrar botines por talle; aceptado si sólo veo variantes disponibles y puedo completar un checkout de prueba.
- **Como empleado**, quiero registrar una venta en caja; aceptado si se genera comprobante y el inventario disminuye una sola vez.
- **Como administrador**, quiero corregir una diferencia de inventario; aceptado si se exige motivo y queda traza.
- **Como administrador**, quiero asignar tareas en un proyecto; aceptado si empleados sólo actualizan sus propias asignaciones.
- **Como cliente**, quiero ver mis compras; aceptado si nunca puedo consultar pedidos de otro usuario.

## 7. Criterios para considerar MVP terminado

Todos los RF de prioridad P0 funcionan en un entorno repetible; pruebas críticas aprobadas; prototipos Figma disponibles; esquema migrable; instrucciones de instalación, credenciales de prueba ficticias y manual de usuario entregados.
