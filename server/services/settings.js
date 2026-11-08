import { getDb } from '../db/index.js';
import { config } from '../config.js';

/**
 * Defaults for a fresh database. A shop owner sets these once as environment
 * variables on their host; the admin Settings page can change them afterwards.
 */
export const DEFAULTS = {
  storeName: config.shopName,
  currency: config.currency,
  supportEmail: config.supportEmail,
  taxPercent: String(config.taxPercent),
  freeDeliveryThreshold: String(config.freeDeliveryThreshold),
  deliveryFee: String(config.deliveryFee),
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
