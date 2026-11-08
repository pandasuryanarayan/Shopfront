import serverless from 'serverless-http';
import { getStore } from '@netlify/blobs';
import { createApp } from '../../server/app.js';
import { openDatabase, getDb, useBlobStore } from '../../server/db/index.js';
import { seed } from '../../server/db/seed.js';
import { useBlobStore as useUploadStore } from '../../server/storage.js';

/**
 * Netlify Function entry point.
 *
 * The whole Express app runs here on a single origin; the database and uploaded
 * photos are persisted in Netlify Blobs, because the function filesystem is
 * read-only and per-instance.
 */
let booted;

async function bootstrap() {
  const store = getStore({ name: 'shopfront', consistency: 'strong' });
  useBlobStore(store);
  useUploadStore(store);

  await openDatabase();
  const db = getDb();
  if (db.get('SELECT COUNT(*) AS n FROM products').n === 0) {
    await seed({ silent: true });
    await db.persist();
  }

  return serverless(createApp({ surface: 'all' }), { binary: ['image/*', 'application/octet-stream'] });
}

export async function handler(event, context) {
  booted ||= bootstrap();
  const fn = await booted;
  const response = await fn(event, context);

  // Persist after the response is built, before the instance can freeze.
  try {
    await getDb().persist();
  } catch (err) {
    console.error('persist failed', err);
  }
  return response;
}
