#!/usr/bin/env node
/**
 * One-command setup for a freshly cloned shop.
 *
 *   npm run setup
 *
 * Creates .env from the example (with a real JWT secret), then seeds the
 * catalogue. Safe to run more than once — it never overwrites an existing .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

const ok = (msg) => console.log(`  ✓ ${msg}`);
const info = (msg) => console.log(`  · ${msg}`);
const warn = (msg) => console.log(`  ! ${msg}`);

console.log('\nShopfront setup\n');

// 1. dependencies
if (!fs.existsSync(path.join(root, 'node_modules'))) {
  warn('Dependencies are not installed yet. Run `npm install` first, then `npm run setup` again.');
  process.exit(1);
}
ok('Dependencies present');

// 2. .env
if (fs.existsSync(envPath)) {
  ok('.env already exists — leaving it untouched');
} else if (fs.existsSync(examplePath)) {
  const secret = crypto.randomBytes(32).toString('base64url');
  const contents = fs.readFileSync(examplePath, 'utf8').replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  fs.writeFileSync(envPath, contents);
  ok('.env created with a generated JWT_SECRET');
} else {
  warn('.env.example is missing — skipping .env creation');
}

// 3. database
const { openDatabase, getDb } = await import('./server/db/index.js');
const { seed } = await import('./server/db/seed.js');

await openDatabase();
const db = getDb();
const existing = db.get('SELECT COUNT(*) AS n FROM products').n;

if (existing === 0) {
  await seed({ silent: true });
  ok(`Database seeded with ${db.get('SELECT COUNT(*) AS n FROM products').n} demo products`);
} else {
  info(`Database already has ${existing} products — not reseeding`);
}

const settings = db.all('SELECT key, value FROM settings');
ok(`Store: ${settings.find((s) => s.key === 'storeName')?.value || 'Shopfront'}`);

console.log(`
Next steps:

  1. Edit .env to set your shop name, currency and JWT secret
  2. npm start
  3. Storefront  http://localhost:4000
     Admin panel http://localhost:4001/mukhiya
     Admin login admin@shopfront.in / Admin@1234  (change this before going live)

Full deployment guide: SETUP.md
`);
process.exit(0);
