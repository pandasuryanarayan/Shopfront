import { percentOff } from '../lib/money.js';
import { computeTotals } from './pricing.js';

export function loadCartItems(db, userId) {
  return db.all(
    `SELECT c.id, c.size, c.qty, p.id AS productId, p.slug, p.title, p.subtitle,
            p.price_paise AS pricePaise, p.mrp_paise AS mrpPaise, p.stock,
            p.gradient_from AS gradientFrom, p.gradient_to AS gradientTo
       FROM cart_items c
       JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ?
      ORDER BY c.id DESC`,
    [userId]
  ).map((row) => ({
    id: row.id,
    productId: row.productId,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    size: row.size,
    qty: row.qty,
    stock: row.stock,
    pricePaise: row.pricePaise,
    mrpPaise: row.mrpPaise,
    lineTotalPaise: row.pricePaise * row.qty,
    discountPercent: percentOff(row.mrpPaise, row.pricePaise),
    gradient: [row.gradientFrom, row.gradientTo],
  }));
}

export function cartSummary(items, coupon = null) {
  const subtotalPaise = items.reduce((sum, i) => sum + i.lineTotalPaise, 0);
  const totals = computeTotals({ subtotalPaise, coupon });
  return {
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    lineCount: items.length,
    ...totals,
  };
}

export function readCoupon(db, code) {
  if (!code) return null;
  const coupon = db.get('SELECT * FROM coupons WHERE code = ? AND active = 1', [String(code).toUpperCase().trim()]);
  return coupon ?? null;
}
