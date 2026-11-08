import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * File storage for product photos.
 *
 * Locally this writes to public/uploads. On Netlify the filesystem is read-only
 * and per-instance, so blobs go to Netlify Blobs and are streamed back through
 * the API instead.
 */
let blobStore = null;

export function useBlobStore(store) {
  blobStore = store;
}

export const isBlobStorage = () => Boolean(blobStore);

const extFor = (name = '', mime = '') => {
  const fromName = path.extname(name).toLowerCase();
  if (fromName) return fromName;
  const map = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
  return map[mime] || '.jpg';
};

/** Stores an uploaded file and returns the public URL to save against a product. */
export async function saveUpload({ buffer, originalname, mimetype }) {
  const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${extFor(originalname, mimetype)}`;

  if (blobStore) {
    await blobStore.set(key, buffer, { metadata: { contentType: mimetype || 'image/jpeg' } });
    return `/api/uploads/${key}`;
  }

  const dir = path.join(config.root, config.uploadDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, key), buffer);
  return `/uploads/${key}`;
}

/** Reads a stored upload back out (used by the /api/uploads route). */
export async function readUpload(key) {
  if (blobStore) {
    const entry = await blobStore.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!entry) return null;
    return {
      buffer: Buffer.from(entry.data),
      contentType: entry.metadata?.contentType || 'image/jpeg',
    };
  }

  const file = path.join(config.root, config.uploadDir, path.basename(key));
  if (!fs.existsSync(file)) return null;
  return { buffer: fs.readFileSync(file), contentType: 'image/jpeg' };
}

export async function deleteUpload(url) {
  if (!url) return;
  const key = path.basename(url);
  if (blobStore) {
    await blobStore.delete(key).catch(() => {});
    return;
  }
  fs.rm(path.join(config.root, config.uploadDir, key), { force: true }, () => {});
}
