import serverless from 'serverless-http';
import { connectLambda } from '@netlify/blobs';
import { createApp } from '../../server/app.js';
import { openDatabase, getDb, useBlobStore } from '../../server/db/index.js';
import { seed } from '../../server/db/seed.js';
import { useBlobStore as useUploadStore } from '../../server/storage.js';

/**
 * Netlify Function entry point.
 *
 * The whole Express app runs here on a single origin. The database and uploaded
 * photos live in Netlify Blobs, because the function filesystem is read-only and
 * per-instance. If Blobs cannot be reached the app still boots — it just falls
 * back to an in-memory database so the site serves instead of returning 502.
 */
let booted;

async function resolveStore() {
  const { getStore } = await import('@netlify/blobs');
  const attempts = [
    ['object+consistency', () => getStore({ name: 'shopfront', consistency: 'strong' })],
    ['string', () => getStore('shopfront')],
    ['env', () => getStore({
      name: 'shopfront',
      siteID: process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    })],
  ];

  let lastError = null;
  for (const [label, make] of attempts) {
    try {
      const candidate = make();
      await candidate.get('__probe__'); // forces a real call so misconfig surfaces here
      console.log(`blobs: connected via ${label}`);
      return candidate;
    } catch (err) {
      lastError = err;
      console.warn(`blobs: ${label} failed — ${err?.message}`);
    }
  }
  throw lastError || new Error('Blobs unavailable');
}

async function bootstrap() {
  let store = null;
  try {
    store = await resolveStore();
    useBlobStore(store);
    useUploadStore(store);
    globalThis.__storageMode = 'blob';
  } catch (err) {
    globalThis.__storageMode = 'memory';
    globalThis.__storageError = String(err?.message || err);
    console.warn('Running without blob storage:', globalThis.__storageError);
  }

  // Without blobs there is nowhere durable to write, so stay in memory.
  await openDatabase(store ? {} : { inMemory: true });

  const db = getDb();
  if (db.get('SELECT COUNT(*) AS n FROM products').n === 0) {
    await seed({ silent: true });
    await db.persist();
  }

  return serverless(createApp({ surface: 'all' }), { binary: ['image/*', 'application/octet-stream'] });
}

export async function handler(event, context) {
  // Modern runtimes inject the blob context into the environment; the classic
  // Lambda signature carries it on the event instead. connectLambda handles the
  // latter and is a no-op when the environment is already configured.
  try {
    connectLambda(event);
  } catch (err) {
    console.warn('connectLambda failed:', err?.message);
  }

  booted ||= bootstrap();
  const fn = await booted;
  const response = await fn(event, context);

  try {
    await getDb().persist();
  } catch (err) {
    console.error('persist failed', err);
  }
  return response;
}
