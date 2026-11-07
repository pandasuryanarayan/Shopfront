import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, notFound, forbidden, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { loadCartItems } from '../services/cart.js';
import { readCoupon } from '../services/cart.js';
import { computeTotals } from '../services/pricing.js';
import { charge, refund } from '../services/payment.js';
import { orderDto, orderItemDto } from '../lib/serialize.js';

const router = Router();
router.use(requireAuth);

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[+0-9][0-9\s-]{7,16}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(5).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode'),
});

const createSchema = z.object({
  address: addressSchema,
  paymentMethod: z.enum(['upi', 'card', 'cod']),
  couponCode: z.string().trim().max(24).optional(),
  vpa: z.string().trim().max(60).optional(),
});

function nextReference(db) {
  const row = db.get('SELECT COUNT(*) AS n FROM orders');
  return `SF-${10440 + row.n + 1}`;
}

router.post('/', asyncHandler(async (req, res) => {
  const { address, paymentMethod, couponCode, vpa } = parse(createSchema, req.body);
  const db = getDb();

  const items = loadCartItems(db, req.user.id);
  if (items.length === 0) throw badRequest('Your cart is empty');

  for (const item of items) {
    const sizeRow = db.get('SELECT stock FROM product_sizes WHERE product_id = ? AND label = ?', [item.productId, item.size]);
    if (!sizeRow || sizeRow.stock < item.qty) {
      throw badRequest(`${item.title} (${item.size}) is no longer available in that quantity`);
    }
  }

  const coupon = couponCode ? readCoupon(db, couponCode) : null;
  if (couponCode && !coupon) throw badRequest('That coupon code is not valid');

  const totals = computeTotals({ subtotalPaise: items.reduce((s, i) => s + i.lineTotalPaise, 0), coupon });
  const reference = nextReference(db);

  const payment = await charge({ method: paymentMethod, amountPaise: totals.totalPaise, reference, vpa });
  if (!payment.ok) {
    throw badRequest(payment.reason || 'Payment could not be completed');
  }

  const orderId = db.transaction(() => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO orders (reference, user_id, status, payment_method, payment_status, subtotal_paise, discount_paise, delivery_paise, total_paise, coupon_code, address_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [reference, req.user.id, 'placed', paymentMethod, payment.status, totals.subtotalPaise, totals.discountPaise, totals.deliveryPaise, totals.totalPaise, coupon ? coupon.code : null, JSON.stringify(address)]
    );

    for (const item of items) {
      db.run('INSERT INTO order_items (order_id, product_id, title, size, unit_price_paise, qty) VALUES (?,?,?,?,?,?)',
        [lastInsertRowid, item.productId, item.title, item.size, item.pricePaise, item.qty]);
      db.run('UPDATE product_sizes SET stock = stock - ? WHERE product_id = ? AND label = ?', [item.qty, item.productId, item.size]);
      db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.qty, item.productId]);
    }

    db.run('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
    return lastInsertRowid;
  });

  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  const orderItems = db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  res.status(201).json({ order: orderDto(order, orderItems.map(orderItemDto)) });
}));

router.get('/', (req, res) => {
  const db = getDb();
  const orders = db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
  res.json({
    orders: orders.map((o) => orderDto(o, db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto))),
  });
});

router.get('/:reference', (req, res) => {
  const db = getDb();
  const order = db.get('SELECT * FROM orders WHERE reference = ?', [req.params.reference]);
  if (!order) throw notFound('Order not found');
  if (order.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden();
  res.json({ order: orderDto(order, db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]).map(orderItemDto)) });
});

router.post('/:reference/cancel', asyncHandler(async (req, res) => {
  const db = getDb();
  const order = db.get('SELECT * FROM orders WHERE reference = ?', [req.params.reference]);
  if (!order) throw notFound('Order not found');
  if (order.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden();
  if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
    throw badRequest(`A ${order.status} order cannot be cancelled`);
  }

  if (order.payment_status === 'paid') {
    await refund({ reference: order.reference, amountPaise: order.total_paise });
  }

  db.transaction(() => {
    db.run("UPDATE orders SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END WHERE id = ?", [order.id]);
    const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    for (const item of items) {
      db.run('UPDATE product_sizes SET stock = stock + ? WHERE product_id = ? AND label = ?', [item.qty, item.product_id, item.size]);
      db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.qty, item.product_id]);
    }
  });

  const updated = db.get('SELECT * FROM orders WHERE id = ?', [order.id]);
  res.json({ order: orderDto(updated, db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]).map(orderItemDto)) });
}));

export default router;
