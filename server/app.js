import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { config } from './config.js';
import { optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import cartRoutes from './routes/cart.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(optionalAuth);

  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 25,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api', apiLimiter, catalogRoutes);
  app.use('/api/cart', apiLimiter, cartRoutes);
  app.use('/api/orders', apiLimiter, orderRoutes);
  app.use('/api/admin', apiLimiter, adminRoutes);

  app.use(express.static(config.publicDir, {
    extensions: ['html'],
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
