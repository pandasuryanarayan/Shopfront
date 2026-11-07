import { getDb } from '../db/index.js';

export const DEFAULTS = {
  storeName: 'Shopfront',
  currency: 'INR',
  supportEmail: 'help@shopfront.in',
  taxPercent: '18',
  freeDeliveryThreshold: '49900',
  deliveryFee: '4900',
};

/** Settings are stored as strings; this coerces the numeric ones on read. */
export function getSettings() {
  const db = getDb();
  const rows = db.all('SELECT key, value FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULTS, ...stored };
  return {
    ...merged,
    taxPercent: Number(merged.taxPercent) || 0,
    freeDeliveryThreshold: Number(merged.freeDeliveryThreshold) || 0,
    deliveryFee: Number(merged.deliveryFee) || 0,
  };
}

export function saveSettings(patch) {
  const db = getDb();
  const allowed = Object.keys(DEFAULTS);
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (!allowed.includes(key)) continue;
      db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, String(value)]
      );
    }
  });
  return getSettings();
}
