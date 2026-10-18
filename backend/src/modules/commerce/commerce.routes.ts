import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute, AppError } from '../../common/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as service from './commerce.service.js';

export const commerceRouter = Router();
commerceRouter.post('/store/orders', requireRole('CUSTOMER'), asyncRoute(async () => {
  throw new AppError(503, 'ONLINE_CHECKOUT_DISABLED', 'Las compras online están temporalmente deshabilitadas. El catálogo y el carrito siguen disponibles; contactá a la tienda para comprar.');
}));
commerceRouter.get('/store/orders', requireRole('CUSTOMER'), asyncRoute(async (req, res) => res.json({ orders: await service.listOrders(req.auth!.id) })));
commerceRouter.get('/store/orders/:id', requireRole('CUSTOMER'), asyncRoute(async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_ID', 'Identificador inválido.');
  res.json({ order: await service.getOrder(id.data, req.auth!.id) });
}));
commerceRouter.post('/store/orders/:id/cancel', requireRole('CUSTOMER'), asyncRoute(async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_ID', 'Identificador inválido.');
  await service.cancelOrder(id.data, req.auth!.id);
  res.status(204).end();
}));
