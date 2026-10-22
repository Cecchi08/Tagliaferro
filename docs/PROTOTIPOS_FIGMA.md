# Checklist de prototipos para Figma

El estudiante construye los prototipos. Cubrir pantallas y estados reales del repositorio; usar datos ficticios solo como contenido de diseño, claramente rotulados.

## Pantallas

- Acceso, registro de cliente, cierre de sesión y sesión expirada.
- Catálogo público: categorías, búsqueda, producto, variantes disponibles, variante sin stock y error de carga.
- Carrito: cantidades, quitar línea, total estimado, checkout bloqueado por stock o servicio no configurado.
- Retorno del checkout: pago pendiente de verificación, confirmado, rechazado/cancelado y revisión manual.
- Historial y detalle de pedidos propios; cancelación mientras está pendiente.
- POS: búsqueda, selección de variantes, carrito, cantidad, medios de pago presenciales, efectivo/vuelto, validación de stock y comprobante interno.
- Inventario: lista, filtro por bajo stock, recepción, ajuste admin y movimientos.
- Administración del catálogo: categorías, producto, variante, SKU, precio y estado activo.
- Usuarios: lista admin, empleados activos/inactivos y estados de permiso.
- Proyectos: lista, detalle, fases, tareas, responsables, fecha, prioridad, progreso y archivo.
- Mi trabajo: tareas asignadas y edición permitida de estado/progreso.

## Flujos y estados

- Auth: autenticación correcta/incorrecta, cliente/empleado/admin, permisos 401/403.
- Inventario: alerta cuando disponible ≤ umbral; rechazo de stock negativo o reservado.
- POS: doble envío/reintento idempotente, precio vigente servidor, stock insuficiente.
- E-commerce: reserva, apertura de Mercado Pago, vuelta sin confirmación, webhook aprobado, rechazo, cancelación y vencimiento.
- Proyectos: crear proyecto/fase/tarea, asignar empleado, editar avance, restringir reasignación a empleado, eliminar tarea/fase vacía.
- Todas las pantallas: carga, vacío, error, confirmación, teclado/foco y diseño responsive.

No presentar el pago online como validado: requiere evidencia sandbox real antes de cambiar esa etiqueta.
