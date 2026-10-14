import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncRoute } from '../../common/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as service from './pos.service.js';

export const posRouter = Router();
const paymentMethod = z.enum(['CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER']);
const saleSchema = z.object({
  idempotencyKey: z.uuid(),
  paymentMethod,
  cashReceived: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(1_000_000) })).min(1).max(50),
}).refine((input) => input.paymentMethod === 'CASH' ? Boolean(input.cashReceived) : input.cashReceived === undefined, {
  message: 'El efectivo recibido solo corresponde al medio de pago en efectivo.',
  path: ['cashReceived'],
});

posRouter.post('/pos/sales', requireRole('ADMIN', 'EMPLOYEE'), asyncRoute(async (req, res) => {
  const input = saleSchema.parse(req.body);
  const result = await service.createPosSale(req.auth!.id, input);
  res.status(result.replayed ? 200 : 201).json(result);
}));

posRouter.get('/pos/sales', requireRole('ADMIN', 'EMPLOYEE'), asyncRoute(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  res.json({ sales: await service.listPosSales(req.auth!.id, req.auth!.role === 'ADMIN', limit) });
}));

posRouter.get('/pos/sales/:id', requireRole('ADMIN', 'EMPLOYEE'), asyncRoute(async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw new AppError(400, 'INVALID_ID', 'Identificador de venta inválido.');
  res.json({ sale: await service.getPosSale(id.data, req.auth!.id, req.auth!.role === 'ADMIN') });
}));
