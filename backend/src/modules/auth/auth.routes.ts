import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { asyncRoute, AppError } from '../../common/errors.js';
import * as service from './auth.service.js';
import { requireAuth, requireRole } from './auth.middleware.js';

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().max(254), password: z.string().min(12).max(128) });
const employeeSchema = registerSchema;
const emailSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const COOKIE_NAME = 'tienda_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 24 * 3_600_000 });

authRouter.post('/register', authLimiter, asyncRoute(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await service.register(input.name, input.email, input.password);
  res.status(201).json({ user });
}));
authRouter.post('/login', authLimiter, asyncRoute(async (req, res) => {
  const input = emailSchema.parse(req.body);
  const session = await service.login(input.email, input.password);
  res.cookie(COOKIE_NAME, session.token, cookieOptions());
  res.json({ user: session.user, csrfToken: session.csrfToken });
}));
authRouter.post('/logout', requireAuth, asyncRoute(async (req, res) => {
  await service.logout(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
}));
authRouter.get('/me', (req, res) => {
  if (!req.auth) return res.status(200).json({ user: null });
  return res.json({ user: req.auth, csrfToken: req.csrfToken });
});
authRouter.get('/users', requireRole('ADMIN'), asyncRoute(async (_req, res) => res.json({ users: await service.listUsers() })));
authRouter.post('/employees', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const input = employeeSchema.parse(req.body);
  res.status(201).json({ user: await service.createEmployee(input.name, input.email, input.password) });
}));
authRouter.post('/users/:id/deactivate', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(400, 'INVALID_ID', 'Identificador de usuario inválido.');
  if (req.auth?.id === parsed.data) throw new AppError(409, 'CANNOT_DEACTIVATE_SELF', 'No podés desactivar tu propia cuenta.');
  await service.deactivateUser(parsed.data);
  res.status(204).end();
}));
authRouter.post('/users/:id/reactivate', requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(400, 'INVALID_ID', 'Identificador de usuario inválido.');
  await service.reactivateEmployee(parsed.data);
  res.status(204).end();
}));
