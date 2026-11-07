import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const env = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production';

if (env === 'production' && jwtSecret === 'dev-only-secret-change-me-in-production') {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT || 4000),
  // The admin panel runs on its own port with its own session cookie, so an
  // admin login and a customer login can coexist in the same browser.
  // Set ADMIN_PORT=0 to serve the storefront only.
  adminPort: Number(process.env.ADMIN_PORT ?? 4001),
  root,
  publicDir: path.join(root, 'public'),
  dbFile: process.env.DB_FILE || path.join(root, 'data', 'shopfront.db'),
  jwtSecret,
  jwtTtl: process.env.JWT_TTL || '7d',
  cookieName: 'sf_token',
  adminCookieName: 'sf_admin_token',
  cookieSecure: env === 'production',
  currency: 'INR',
  freeDeliveryThresholdPaise: 49900,
  deliveryFeePaise: 4900,
  maxCartQty: 10,
};

config.adminPublicUrl = process.env.ADMIN_PUBLIC_URL || `http://localhost:${config.adminPort}`;
