import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncRoute } from '../../common/errors.js';
import { requireRole } from '../auth/auth.middleware.js';
import * as service from './inventory.service.js';

export const inventoryRouter = Router();
const idSchema = z.uuid();
const categorySchema = z.object({ name: z.string().trim().min(2).max(100), slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });
const categoryUpdateSchema = categorySchema.partial().extend({ active: z.boolean() }).partial().refine((value) => Object.keys(value).length > 0);
const productSchema = z.object({
  categoryId: z.uuid(), name: z.string().trim().min(2).max(160), description: z.string().max(5000).default(''),
  brand: z.string().max(100).default(''), sport: z.string().max(100).default(''),
});
const productUpdateSchema = productSchema.partial().extend({ active: z.boolean() }).refine((value) => Object.keys(value).length > 0);
const variantSchema = z.object({
  sku: z.string().trim().min(1).max(80), size: z.string().max(50).default(''), color: z.string().max(50).default(''),
  price: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
});
const variantUpdateSchema = variantSchema.partial().extend({ active: z.boolean(), lowStockThreshold: z.number().int().min(0).max(1_000_000) }).partial().refine((value) => Object.keys(value).length > 0);
const receiptSchema = z.object({ variantId: z.uuid(), quantity: z.number().int().positive().max(1_000_000), reason: z.string().trim().min(3).max(500) });
const adjustmentSchema = z.object({ variantId: z.uuid(), delta: z.number().int().refine((n) => n !== 0).max(1_000_000).min(-1_000_000), reason: z.string().trim().min(3).max(500) });

function parseId(value: string) {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, 'INVALID_ID', 'Identificador inválido.');
  return parsed.data;
}

inventoryRouter.get('/catalog/categories', asyncRoute(async (req, res) => {
  const admin = req.auth?.role === 'ADMIN';
  res.json({ categories: await service.listCategories(admin && req.query.includeInactive === 'true') });
}));
inventoryRouter.post('/catalog/categories', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = categorySchema.parse(req.body);
  res.status(201).json({ category: await service.createCategory(input.name, input.slug) });
}));
inventoryRouter.patch('/catalog/categories/:id', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = categoryUpdateSchema.parse(req.body);
  res.json({ category: await service.updateCategory(parseId(String(req.params.id)), input) });
}));

inventoryRouter.get('/catalog/products', asyncRoute(async (req, res) => {
  const admin = req.auth?.role === 'ADMIN';
  const categoryId = req.query.categoryId ? parseId(String(req.query.categoryId)) : undefined;
  const query = z.string().trim().max(100).optional().parse(req.query.q);
  res.json({ products: await service.listProducts({ query, categoryId, includeInactive: admin && req.query.includeInactive === 'true' }) });
}));
inventoryRouter.get('/catalog/products/:id', asyncRoute(async (req, res) => {
  const admin = req.auth?.role === 'ADMIN';
  const product = await service.getProduct(parseId(String(req.params.id)), admin && req.query.includeInactive === 'true');
  res.json({ product });
}));
inventoryRouter.post('/catalog/products', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = productSchema.parse(req.body);
  res.status(201).json({ product: await service.createProduct(input) });
}));
inventoryRouter.patch('/catalog/products/:id', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = productUpdateSchema.parse(req.body);
  res.json({ product: await service.updateProduct(parseId(String(req.params.id)), input) });
}));
inventoryRouter.post('/catalog/products/:id/variants', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = variantSchema.parse(req.body);
  res.status(201).json({ variant: await service.createVariant(parseId(String(req.params.id)), input) });
}));
inventoryRouter.patch('/catalog/variants/:id', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = variantUpdateSchema.parse(req.body);
  res.json({ variant: await service.updateVariant(parseId(String(req.params.id)), input) });
}));

inventoryRouter.get('/inventory', requireRole('ADMIN', 'EMPLOYEE'), asyncRoute(async (req, res) => {
  const categoryId = req.query.categoryId ? parseId(String(req.query.categoryId)) : undefined;
  const query = z.string().trim().max(100).optional().parse(req.query.q);
  const lowStock = z.enum(['true', 'false']).optional().parse(req.query.lowStock) === 'true';
  res.json({ inventory: await service.listInventory({ query, categoryId, lowStock }) });
}));
inventoryRouter.post('/inventory/receipts', requireRole('ADMIN', 'EMPLOYEE'), asyncRoute(async (req, res) => {
  const input = receiptSchema.parse(req.body);
  res.status(201).json({ result: await service.receiveStock(input.variantId, input.quantity, input.reason, req.auth!.id) });
}));
inventoryRouter.post('/inventory/adjustments', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = adjustmentSchema.parse(req.body);
  res.status(201).json({ result: await service.adjustStock(input.variantId, input.delta, input.reason, req.auth!.id) });
}));
inventoryRouter.get('/inventory/movements', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const query = z.string().trim().max(100).optional().parse(req.query.q);
  res.json({ movements: await service.listMovements(query) });
}));

