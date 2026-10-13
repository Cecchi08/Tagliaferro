import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors.js';
import { authenticate } from './auth.service.js';
import { env } from '../../config/env.js';
import type { Role } from './types.js';
import { canAccessRole } from './policies.js';

export const loadAuth: RequestHandler = async (req, _res, next) => {
  const session = await authenticate(req.cookies?.[env.SESSION_COOKIE_NAME]);
  if (session) { req.auth = session.user; req.csrfToken = session.csrfToken; }
  next();
};
export const requireAuth: RequestHandler = (req, _res, next) => req.auth ? next() : next(new AppError(401, 'UNAUTHENTICATED', 'Iniciá sesión para continuar.'));
export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Iniciá sesión para continuar.'));
  if (!canAccessRole(req.auth.role, ...roles)) return next(new AppError(403, 'FORBIDDEN', 'No tenés permisos para esta acción.'));
  next();
};
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin !== env.FRONTEND_URL) return next(new AppError(403, 'INVALID_ORIGIN', 'Origen no permitido.'));
  if (req.path.endsWith('/register') || req.path.endsWith('/login')) return next();
  if (!req.auth || !req.csrfToken || req.get('x-csrf-token') !== req.csrfToken) return next(new AppError(403, 'CSRF_INVALID', 'La solicitud no superó la validación de seguridad.'));
  next();
};
