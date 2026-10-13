# 06 — Plan de UX/UI y prototipos en Figma

**La consigna exige prototipos en Figma.** Este documento define qué dibujar y validar antes de comenzar la implementación; no reemplaza el archivo de Figma.

## 1. Navegación general

- Sitio público: Inicio -> Catálogo -> Detalle -> Carrito -> Checkout -> Resultado -> Mis pedidos.
- Cliente: Registro/Login -> Mi cuenta -> Mis pedidos -> Detalle de pedido.
- Empleado: Login -> Panel -> POS -> Comprobante; Inventario -> Entrada; Mis tareas.
- Administrador: Login -> Dashboard -> Productos/Variantes -> Inventario/Movimientos -> Pedidos/Clientes/Empleados -> Proyectos/Tareas.

## 2. Pantallas obligatorias y estados

| Código | Pantalla | Componentes/estados que debe cubrir |
|---|---|---|
| UI01 | Catálogo | Buscador, categorías, filtros, tarjetas, cargando/vacío/error |
| UI02 | Detalle producto | Imagen, talles/colores, stock disponible, precio, agregar al carrito |
| UI03 | Registro / Login | Validación de campos, error de credenciales, recuperación no incluida |
| UI04 | Carrito | Cantidad por variante, subtotal, eliminación, aviso de precio/stock |
| UI05 | Checkout | Retiro en tienda, resumen, botón de pagar, error y espera |
| UI06 | Pedido/resultado | Estado pendiente, pagado, rechazado, expirado; número de pedido |
| UI07 | POS de caja | Búsqueda/SKU, carrito de caja, forma de pago, importe recibido, cambio |
| UI08 | Comprobante POS | Número, fecha, cajero, ítems, total y medio de pago |
| UI09 | Gestión de productos | Tabla, alta/edición, variantes y activación/desactivación |
| UI10 | Inventario | Stock físico, reservado, disponible, bajo mínimo, movimientos y entrada |
| UI11 | Pedidos/usuarios | Historial con filtros, detalle y administración de roles |
| UI12 | Proyectos | Lista, detalle, fases, tareas, responsables, avance |
| UI13 | Dashboard | Resumen ventas, alertas y tareas pendientes |

## 3. Sistema de diseño propuesto

- Imagen moderna, deportiva, tipografía legible y buen contraste.
- Responsive desde 360 px de ancho hasta escritorio grande; POS optimizado a PC/tablet.
- Tablas densas en escritorio con versión de tarjetas en móvil.
- Jerarquía visual clara para montos, SKU, estados y alertas de existencias.
- Mensajes de error concretos; nunca informar pago aprobado sólo por retorno de pasarela.
- Navegación por teclado, campos con labels y estados de foco visibles.

## 4. Entregable Figma y validación

Archivo compartido que incluya: mapa de navegación, biblioteca mínima de componentes, layouts escritorio (1440 px) y móvil (390 px) para UI01-UI13, flujos enlazados de compra online, POS y gestión de tareas; estados de vacío, error y confirmación. Validar con al menos un usuario simulando cada rol y registrar 3 observaciones/mejoras. Se puede priorizar diseñar UI01-UI10 primero, pero las 13 pantallas quedan previstas en el plan.
