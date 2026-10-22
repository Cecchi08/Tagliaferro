import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute, AppError } from '../../common/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as service from './commerce.service.js';
import * as payments from './payments.service.js';

export const commerceRouter = Router();
commerceRouter.post('/store/orders', requireRole('CUSTOMER'), asyncRoute(async (req, res) => {
  const input = z.object({ idempotencyKey: z.uuid(), items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(50) }).parse(req.body);
  const order = await payments.createOnlineOrder(req.auth!.id, input.idempotencyKey, input.items);
  res.status(order.replayed ? 200 : 201).json(order);
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
  await payments.cancelOnlineOrder(id.data, req.auth!.id);
  res.status(204).end();
}));

commerceRouter.post('/payments/webhook', asyncRoute(async (req, res) => {
  const paymentId = z.string().min(1).max(100).safeParse(req.query['data.id'] ?? req.body?.data?.id).data;
  const eventId = z.union([z.string(), z.number()]).transform(String).safeParse(req.body?.id ?? req.query.id).data;
  if (!paymentId || !eventId || !payments.validWebhookSignature(req.get('x-signature'), req.get('x-request-id'), paymentId)) {
    throw new AppError(401, 'INVALID_PAYMENT_SIGNATURE', 'La notificación de pago no tiene una firma válida.');
  }
  await payments.processPaymentWebhook(paymentId, eventId);
  res.status(200).json({ received: true });
}));
