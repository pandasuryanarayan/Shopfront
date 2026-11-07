import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { loadCartItems, cartSummary, readCoupon } from '../services/cart.js';
import { couponDiscount } from '../services/pricing.js';

const router = Router();
router.use(requireAuth);

const addSchema = z.object({
  productId: z.coerce.number().int().positive(),
  size: z.string().trim().min(1).max(20).default('One size'),
  qty: z.coerce.number().int().min(1).max(config.maxCartQty).default(1),
});

const qtySchema = z.object({ qty: z.coerce.number().int().min(0).max(config.maxCartQty) });

const couponSchema = z.object({ code: z.string().trim().min(2).max(24), subtotalPaise: z.coerce.number().int().min(0) });

function payload(db, userId, couponCode) {
  const items = loadCartItems(db, userId);
  const coupon = readCoupon(db, couponCode);
  return { items, summary: cartSummary(items, coupon), coupon: coupon ? { code: coupon.code } : null };
}

router.get('/', (req, res) => {
  const db = getDb();
  res.json(payload(db, req.user.id, req.query.coupon));
});

router.post('/', (req, res) => {
  const { productId, size, qty } = parse(addSchema, req.body);
  const db = getDb();

  const product = db.get('SELECT id, stock, title FROM products WHERE id = ? AND is_active = 1', [productId]);
  if (!product) throw notFound('That product is no longer available');

  const sizeRow = db.get('SELECT stock FROM product_sizes WHERE product_id = ? AND label = ?', [productId, size]);
  if (!sizeRow) throw badRequest('Choose an available size');

  const existing = db.get('SELECT id, qty FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?', [req.user.id, productId, size]);
  const nextQty = (existing ? existing.qty : 0) + qty;

  if (nextQty > config.maxCartQty) throw badRequest(`You can order up to ${config.maxCartQty} units of this item`);
  if (nextQty > sizeRow.stock) throw badRequest(`Only ${sizeRow.stock} left in ${size}`);

  if (existing) {
    db.run('UPDATE cart_items SET qty = ? WHERE id = ?', [nextQty, existing.id]);
  } else {
    db.run('INSERT INTO cart_items (user_id, product_id, size, qty) VALUES (?,?,?,?)', [req.user.id, productId, size, qty]);
  }
  db.flush();
  res.status(201).json(payload(db, req.user.id));
});

router.patch('/:id', (req, res) => {
  const { qty } = parse(qtySchema, req.body);
  const db = getDb();
  const item = db.get('SELECT * FROM cart_items WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  if (!item) throw notFound('That item is not in your cart');

  if (qty === 0) {
    db.run('DELETE FROM cart_items WHERE id = ?', [item.id]);
  } else {
    const sizeRow = db.get('SELECT stock FROM product_sizes WHERE product_id = ? AND label = ?', [item.product_id, item.size]);
    if (sizeRow && qty > sizeRow.stock) throw badRequest(`Only ${sizeRow.stock} left in this size`);
    db.run('UPDATE cart_items SET qty = ? WHERE id = ?', [qty, item.id]);
  }
  db.flush();
  res.json(payload(db, req.user.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const item = db.get('SELECT id FROM cart_items WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  if (!item) throw notFound('That item is not in your cart');
  db.run('DELETE FROM cart_items WHERE id = ?', [item.id]);
  db.flush();
  res.json(payload(db, req.user.id));
});

router.delete('/', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
  db.flush();
  res.json(payload(db, req.user.id));
});

router.post('/coupon', (req, res) => {
  const { code, subtotalPaise } = parse(couponSchema, req.body);
  const db = getDb();
  const coupon = readCoupon(db, code);
  if (!coupon) throw badRequest('That coupon code is not valid');
  if (subtotalPaise < coupon.min_subtotal) {
    throw badRequest(`This coupon needs a minimum order of ₹${Math.round(coupon.min_subtotal / 100)}`);
  }
  res.json({
    coupon: { code: coupon.code, type: coupon.type, value: coupon.value },
    discountPaise: couponDiscount(coupon, subtotalPaise),
  });
});

export default router;
