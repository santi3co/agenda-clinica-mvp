import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import authRoutes from './modules/auth/auth.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import publicRoutes from './modules/public/public.routes.js';
import appointmentRoutes from './modules/appointments/appointments.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // CORS: solo el origen del frontend configurado (en desarrollo Vite actúa como proxy y no se necesita).
  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (origin && origin === config.webOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  });

  // Protección CSRF complementaria a SameSite=Strict: toda mutación debe ser JSON.
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return next(new HttpError(415, 'Se requiere Content-Type: application/json'));
    }
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, prototype: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/staff', appointmentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

  // Si existe el build del frontend (npm run build), se sirve desde el mismo servidor.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  // Manejador de errores: nunca expone trazas ni detalles internos al cliente.
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
