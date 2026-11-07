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

/**
 * Builds an Express app for one of two surfaces:
 *
 *   'store' — the customer-facing shop (port 4000)
 *   'admin' — the admin panel at /mukhiya (port 4001)
 *
 * The two surfaces run as separate origins *and* use separate session cookies,
 * because cookies are scoped by host and ignore the port. Without distinct
 * cookie names, signing in as an admin would evict the customer session in the
 * same browser.
 */
export function createApp({ surface = 'store' } = {}) {
  const isAdminSurface = surface === 'admin';
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.locals.surface = surface;
  app.locals.cookieName = isAdminSurface ? config.adminCookieName : config.cookieName;

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

  app.get('/healthz', (_req, res) =>
    res.json({ ok: true, surface, uptime: process.uptime(), ...(isAdminSurface ? { storeUrl: config.storePublicUrl } : {}) })
  );

  app.use('/api/auth', authLimiter, authRoutes);

  if (isAdminSurface) {
    // The admin panel gets only what it needs: admin APIs and its own login.
    app.use('/api/mukhiya', apiLimiter, adminRoutes);

    // The shared header probes the cart on load; there is no cart on this origin.
    app.get('/api/cart', (_req, res) =>
      res.json({
        items: [],
        summary: { itemCount: 0, lineCount: 0, subtotalPaise: 0, discountPaise: 0, deliveryPaise: 0, totalPaise: 0 },
        coupon: null,
      })
    );
  } else {
    app.use('/api', apiLimiter, catalogRoutes);
    app.use('/api/cart', apiLimiter, cartRoutes);
    app.use('/api/orders', apiLimiter, orderRoutes);
  }

  if (isAdminSurface) {
    const page = (name) => (_req, res) => res.sendFile(name, { root: config.publicDir });
    app.get(['/', '/mukhiya'], page('admin.html'));
    app.get('/admin.html', (_req, res) => res.redirect(301, '/mukhiya'));
    app.get('/login.html', page('login.html'));
    app.get('/404.html', page('404.html'));

    // Static assets only — no storefront pages on the admin origin.
    const assetOpts = { maxAge: config.isProd ? '7d' : 0 };
    app.use('/css', express.static(path.join(config.publicDir, 'css'), assetOpts));
    app.use('/js', express.static(path.join(config.publicDir, 'js'), assetOpts));
    app.use('/assets', express.static(path.join(config.publicDir, 'assets'), assetOpts));
  } else {
    // /mukhiya on the storefront points at the admin panel's own origin.
    app.get(['/mukhiya', '/admin.html'], (_req, res) => res.redirect(302, config.adminPublicUrl));

    app.use(express.static(config.publicDir, {
      extensions: ['html'],
      maxAge: config.isProd ? '7d' : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
