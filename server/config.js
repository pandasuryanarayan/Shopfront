import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env loader (no dependency). Values already present in the real
 * environment always win, so a hosting dashboard overrides the local file.
 */
function loadEnvFile() {
  for (const candidate of ['.env', path.join('..', '.env')]) {
    const file = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      if (value) process.env[key] = value;
    }
    return;
  }
}

loadEnvFile();

/**
 * Project root. Resolved from the working directory rather than import.meta.url,
 * because serverless bundlers compile this to CommonJS where import.meta is
 * undefined. The app is always started from the project root.
 */
function findRoot() {
  const candidates = [process.env.APP_ROOT, process.cwd(), path.resolve(process.cwd(), '..')].filter(Boolean);
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'server', 'db', 'schema.sql'))) || process.cwd();
}

const root = findRoot();

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
  guestCookieName: 'sf_guest',
  uploadDir: 'public/uploads',
  cookieSecure: env === 'production',
  // Branding and pricing defaults. These seed the settings table on a fresh
  // database; after that the admin Settings page is the source of truth.
  shopName: process.env.SHOP_NAME || 'Shopfront',
  currency: (process.env.CURRENCY || 'INR').toUpperCase(),
  supportEmail: process.env.SUPPORT_EMAIL || 'help@shopfront.in',
  taxPercent: process.env.TAX_PERCENT || '18',
  freeDeliveryThreshold: process.env.FREE_DELIVERY_THRESHOLD || '49900',
  deliveryFee: process.env.DELIVERY_FEE || '4900',
  freeDeliveryThresholdPaise: 49900,
  deliveryFeePaise: 4900,
  maxCartQty: 10,
};

config.adminPublicUrl = process.env.ADMIN_PUBLIC_URL || `http://localhost:${config.adminPort}`;
config.storePublicUrl = process.env.STORE_PUBLIC_URL || `http://localhost:${config.port}`;
