import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { posRouter } from './modules/pos/pos.routes.js';
import { commerceRouter } from './modules/commerce/commerce.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { loadAuth, requireCsrf } from './modules/auth/auth.middleware.js';
import { errorHandler } from './common/errors.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (origin, callback) => callback(null, !origin || origin === env.FRONTEND_URL), credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(loadAuth);
app.use(requireCsrf);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not-ready' }); }
});
app.use('/api/v1/auth', authRouter);
app.use('/api/v1', inventoryRouter);
app.use('/api/v1', posRouter);
app.use('/api/v1', commerceRouter);
app.use('/api/v1', projectsRouter);
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } }));
app.use(errorHandler);

// Vercel detects src/app.ts as the Express function entry point. The local
// listener and database readiness check remain isolated in src/server.ts.
export default app;
