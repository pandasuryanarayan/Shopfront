import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { notFound, badRequest, conflict, asyncHandler } from '../lib/errors.js';
import { requireAdmin, requireAdminOrStaff, requireOwner } from '../middleware/auth.js';
import { productDto, orderDto, orderItemDto } from '../lib/serialize.js';
import { config } from '../config.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { refund as refundPayment } from '../services/payment.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../lib/totp.js';
import { saveUpload, deleteUpload } from '../storage.js';

const router = Router();
router.use(requireAdminOrStaff);

/* ------------------------------------------------------------------ helpers */
function audit(req, action, entity, entityId, meta) {
  const db = getDb();
  db.run(
    'INSERT INTO audit_log (actor_id, actor_email, action, entity, entity_id, meta) VALUES (?,?,?,?,?,?)',
    [req.user?.id ?? null, req.user?.email ?? null, action, entity ?? null, entityId != null ? String(entityId) : null, meta ? JSON.stringify(meta) : null]
  );
}

function paged(req, { defaultLimit = 20 } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

const pageMeta = (total, { page, limit }) => ({
  page,
  pageSize: limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const firstImage = `(SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort LIMIT 1) AS image`;

/* -------------------------------------------------------------------- stats */
router.get('/stats', (req, res) => {
  const db = getDb();
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = `datetime('now', '-${days} days')`;

  const revenue = db.get(`SELECT COALESCE(SUM(total_paise),0) AS v FROM orders WHERE payment_status = 'paid' AND created_at >= ${since}`).v;
  const orders = db.get(`SELECT COUNT(*) AS v FROM orders WHERE created_at >= ${since}`).v;
  const customers = db.get("SELECT COUNT(*) AS v FROM users WHERE role = 'customer' AND is_guest = 0").v;
  const products = db.get('SELECT COUNT(*) AS v FROM products WHERE is_active = 1').v;
  const lowStock = db.all('SELECT id, title, stock FROM products WHERE stock <= 15 AND is_active = 1 ORDER BY stock ASC LIMIT 5');
  const avgOrder = orders ? Math.round(revenue / orders) : 0;
  const refunded = db.get(`SELECT COALESCE(SUM(total_paise),0) AS v FROM orders WHERE payment_status = 'refunded' AND created_at >= ${since}`).v;

  const byMonth = db.all(
    `SELECT strftime('%Y-%m', created_at) AS month, SUM(total_paise) AS revenue, COUNT(*) AS orders
       FROM orders WHERE payment_status = 'paid' GROUP BY month ORDER BY month DESC LIMIT 12`
  ).reverse();

  const topCategories = db.all(
    `SELECT c.name, SUM(oi.unit_price_paise * oi.qty) AS revenue, SUM(oi.qty) AS units
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
      GROUP BY c.id ORDER BY revenue DESC LIMIT 5`
  );

  const recent = db.all('SELECT * FROM orders ORDER BY id DESC LIMIT 8').map((o) =>
    orderDto(o, db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto))
  );

  const statusCounts = db.all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');

  res.json({
    window: { days },
    kpis: {
      revenuePaise: revenue,
      orders,
      customers,
      products,
      avgOrderValuePaise: avgOrder,
      refundedPaise: refunded,
      conversionRate: customers ? Number(((orders / customers) * 3.4).toFixed(2)) : 0,
    },
    byMonth,
    topCategories,
    recentOrders: recent,
    lowStock,
    statusCounts,
  });
});

/* ----------------------------------------------------------------- products */
const productSchema = z.object({
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  categoryId: z.coerce.number().int().positive(),
  pricePaise: z.coerce.number().int().min(1),
  mrpPaise: z.coerce.number().int().min(1),
  stock: z.coerce.number().int().min(0),
  badge: z.string().trim().max(24).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
  gradientFrom: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  gradientTo: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sizes: z.array(z.object({
    label: z.string().trim().min(1).max(20),
    stock: z.coerce.number().int().min(0),
  })).max(12).optional(),
});

const PALETTE = [
  ['#EDEBFF', '#D6CDFF'], ['#FFF1E8', '#FFD8C2'], ['#E8F5EF', '#C6E8D8'],
  ['#EAF0FF', '#CFDDFF'], ['#FDECF3', '#F8CEDF'], ['#EEF1F5', '#D8DFE8'],
];

const SIZES_BY_CATEGORY = {
  footwear: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
  apparel: ['S', 'M', 'L', 'XL'],
};

function defaultSizes(slug, stock) {
  const labels = SIZES_BY_CATEGORY[slug];
  if (!labels) return [{ label: 'One size', stock }];
  const each = Math.max(0, Math.floor(stock / labels.length));
  return labels.map((label, i) => ({
    label,
    stock: i === labels.length - 1 ? Math.max(0, stock - each * (labels.length - 1)) : each,
  }));
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

router.get('/products', (req, res) => {
  const db = getDb();
  const p = paged(req);
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all');
  const category = String(req.query.category || '');

  if (q) { where.push('(p.title LIKE ? OR p.slug LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (status === 'active') where.push('p.is_active = 1');
  if (status === 'archived') where.push('p.is_active = 0');
  if (status === 'low') where.push('p.stock <= 15');
  if (category) { where.push('c.slug = ?'); params.push(category); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`, params).n;
  const rows = db.all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, ${firstImage}
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereSql}
      ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset]
  );

  res.json({
    products: rows.map((r) => ({ ...productDto(r), isActive: !!r.is_active, image: r.image })),
    ...pageMeta(total, p),
  });
});

router.get('/products/export.csv', (req, res) => {
  const db = getDb();
  const rows = db.all(
    `SELECT p.id, p.slug, p.title, c.name AS category, p.price_paise, p.mrp_paise, p.stock, p.rating, p.is_active
       FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.id`
  );
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['id', 'slug', 'title', 'category', 'price_inr', 'mrp_inr', 'stock', 'rating', 'active'].join(','),
    ...rows.map((r) => [r.id, esc(r.slug), esc(r.title), esc(r.category), (r.price_paise / 100).toFixed(2), (r.mrp_paise / 100).toFixed(2), r.stock, r.rating, r.is_active].join(',')),
  ].join('\n');

  audit(req, 'products.export', 'product', null, { rows: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shopfront-products-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.post('/products', (req, res) => {
  const data = parse(productSchema, req.body);
  const db = getDb();

  const category = db.get('SELECT * FROM categories WHERE id = ?', [data.categoryId]);
  if (!category) throw badRequest('Unknown category');
  if (data.mrpPaise < data.pricePaise) throw badRequest('MRP cannot be lower than the selling price');

  let slug = slugify(data.title) || 'product';
  let n = 1;
  while (db.get('SELECT id FROM products WHERE slug = ?', [slug])) slug = `${slugify(data.title) || 'product'}-${++n}`;

  const palette = PALETTE[db.get('SELECT COUNT(*) AS n FROM products').n % PALETTE.length];
  const sizes = data.sizes?.length ? data.sizes : defaultSizes(category.slug, data.stock);

  const id = db.transaction(() => {
    const { lastInsertRowid } = db.run(
      `INSERT INTO products (slug, title, subtitle, description, category_id, price_paise, mrp_paise, stock, badge, gradient_from, gradient_to)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [slug, data.title, data.subtitle, data.description, data.categoryId, data.pricePaise, data.mrpPaise, data.stock,
        data.badge ?? null, data.gradientFrom ?? palette[0], data.gradientTo ?? palette[1]]
    );
    for (const size of sizes) {
      db.run('INSERT INTO product_sizes (product_id, label, stock) VALUES (?,?,?)', [lastInsertRowid, size.label, size.stock]);
    }
    return lastInsertRowid;
  });

  audit(req, 'product.create', 'product', id, { title: data.title });
  const row = db.get(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`, [id]);
  res.status(201).json({ product: productDto(row, sizes) });
});

router.patch('/products/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const product = db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) throw notFound('Product not found');

  const data = parse(productSchema.partial(), req.body);
  const fields = [];
  const params = [];
  const map = {
    title: 'title', subtitle: 'subtitle', description: 'description', categoryId: 'category_id',
    pricePaise: 'price_paise', mrpPaise: 'mrp_paise', stock: 'stock', badge: 'badge',
    isActive: 'is_active', gradientFrom: 'gradient_from', gradientTo: 'gradient_to',
  };
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push(key === 'isActive' ? (data[key] ? 1 : 0) : data[key]);
    }
  }
  if (!fields.length && !data.sizes) throw badRequest('Nothing to update');

  const nextPrice = data.pricePaise ?? product.price_paise;
  const nextMrp = data.mrpPaise ?? product.mrp_paise;
  if (nextMrp < nextPrice) throw badRequest('MRP cannot be lower than the selling price');

  db.transaction(() => {
    if (fields.length) db.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
    if (data.sizes) {
      for (const size of data.sizes) {
        const existing = db.get('SELECT id FROM product_sizes WHERE product_id = ? AND label = ?', [id, size.label]);
        if (existing) db.run('UPDATE product_sizes SET stock = ? WHERE id = ?', [size.stock, existing.id]);
        else db.run('INSERT INTO product_sizes (product_id, label, stock) VALUES (?,?,?)', [id, size.label, size.stock]);
      }
    }
  });

  audit(req, 'product.update', 'product', id, { fields: Object.keys(data) });
  const row = db.get(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`, [id]);
  res.json({ product: { ...productDto(row), isActive: !!row.is_active } });
});

/** Bulk stock update from the products table. */
router.patch('/products', (req, res) => {
  const schema = z.object({
    updates: z.array(z.object({ id: z.coerce.number().int().positive(), stock: z.coerce.number().int().min(0) })).min(1).max(200),
  });
  const { updates } = parse(schema, req.body);
  const db = getDb();

  db.transaction(() => {
    for (const u of updates) db.run('UPDATE products SET stock = ? WHERE id = ?', [u.stock, u.id]);
  });
  audit(req, 'product.bulk_stock', 'product', null, { count: updates.length });
  res.json({ ok: true, updated: updates.length });
});

router.delete('/products/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!db.get('SELECT id FROM products WHERE id = ?', [id])) throw notFound('Product not found');
  db.run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  db.flush();
  audit(req, 'product.archive', 'product', id);
  res.json({ ok: true });
});

router.post('/products/:id/restore', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!db.get('SELECT id FROM products WHERE id = ?', [id])) throw notFound('Product not found');
  db.run('UPDATE products SET is_active = 1 WHERE id = ?', [id]);
  db.flush();
  audit(req, 'product.restore', 'product', id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------ product images */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

router.get('/products/:id/images', (req, res) => {
  const db = getDb();
  res.json({ images: db.all('SELECT id, url, alt, sort FROM product_images WHERE product_id = ? ORDER BY sort', [Number(req.params.id)]) });
});

router.post('/products/:id/images', upload.single('image'), asyncHandler(async (req, res) => {
  const db = getDb();
  const product = db.get('SELECT id, title FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!product) throw notFound('Product not found');
  if (!req.file) throw badRequest('Attach an image file (JPEG, PNG, WebP or GIF)');

  const url = await saveUpload({ buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype });
  const sort = db.get('SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?', [product.id]).n;
  db.run('INSERT INTO product_images (product_id, url, alt, sort) VALUES (?,?,?,?)',
    [product.id, url, `${product.title} image ${sort + 1}`, sort]);
  db.flush();
  audit(req, 'product.image_upload', 'product', product.id, { url });
  res.status(201).json({ image: { url, alt: `${product.title} image ${sort + 1}` } });
}));

router.delete('/products/:id/images/:imageId', asyncHandler(async (req, res) => {
  const db = getDb();
  const row = db.get('SELECT * FROM product_images WHERE id = ? AND product_id = ?',
    [Number(req.params.imageId), Number(req.params.id)]);
  if (!row) throw notFound('Image not found');
  db.run('DELETE FROM product_images WHERE id = ?', [row.id]);
  db.flush();
  if (!row.url.startsWith('/uploads/demo/')) await deleteUpload(row.url);
  audit(req, 'product.image_delete', 'product', Number(req.params.id), { url: row.url });
  res.json({ ok: true });
}));

/* -------------------------------------------------------------------- orders */
router.get('/orders', (req, res) => {
  const db = getDb();
  const p = paged(req);
  const where = [];
  const params = [];
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');

  if (q) { where.push('(o.reference LIKE ? OR u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('o.status = ?'); params.push(status); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id ${whereSql}`, params).n;
  const rows = db.all(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON u.id = o.user_id
       ${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset]
  );

  res.json({
    orders: rows.map((o) => ({
      ...orderDto(o, db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto)),
      customer: { name: o.customer_name, email: o.customer_email },
    })),
    ...pageMeta(total, p),
  });
});

router.get('/orders/:reference', (req, res) => {
  const db = getDb();
  const o = db.get(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.id AS customer_id
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.reference = ?`,
    [req.params.reference]
  );
  if (!o) throw notFound('Order not found');

  const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto).map((item) => ({
    ...item,
    image: db.get('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort LIMIT 1', [item.productId])?.url || null,
  }));
  const returns = db.all('SELECT * FROM return_requests WHERE order_id = ?', [o.id]);
  const history = db.all('SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 20', ['order', String(o.id)]);

  res.json({
    order: {
      ...orderDto(o, items),
      customer: { id: o.customer_id, name: o.customer_name, email: o.customer_email },
      returns,
      history,
    },
  });
});

router.patch('/orders/:reference/status', (req, res) => {
  const schema = z.object({ status: z.enum(['placed', 'packed', 'shipped', 'delivered', 'cancelled']) });
  const { status } = parse(schema, req.body);
  const db = getDb();
  const order = db.get('SELECT * FROM orders WHERE reference = ?', [req.params.reference]);
  if (!order) throw notFound('Order not found');

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
  if (status === 'delivered' && order.payment_method === 'cod' && order.payment_status === 'pending') {
    db.run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [order.id]);
  }
  db.flush();
  audit(req, 'order.status', 'order', order.id, { from: order.status, to: status, reference: order.reference });
  res.json({ ok: true, status });
});

/** Manual refund — owner only. */
router.post('/orders/:reference/refund', requireOwner, async (req, res) => {
  const schema = z.object({ amountPaise: z.coerce.number().int().min(1).optional(), note: z.string().trim().max(300).optional() });
  const { amountPaise, note } = parse(schema, req.body);
  const db = getDb();
  const order = db.get('SELECT * FROM orders WHERE reference = ?', [req.params.reference]);
  if (!order) throw notFound('Order not found');
  if (order.payment_status === 'refunded') throw badRequest('This order has already been refunded');
  if (order.payment_status !== 'paid') throw badRequest('Only paid orders can be refunded');

  const amount = Math.min(amountPaise ?? order.total_paise, order.total_paise);
  const result = await refundPayment({ reference: order.reference, amountPaise: amount });
  if (!result.ok) throw badRequest('The payment gateway rejected the refund');

  db.transaction(() => {
    db.run("UPDATE orders SET payment_status = 'refunded', status = CASE WHEN status = 'delivered' THEN status ELSE 'cancelled' END WHERE id = ?", [order.id]);
    const items = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
    for (const item of items) {
      db.run('UPDATE product_sizes SET stock = stock + ? WHERE product_id = ? AND label = ?', [item.qty, item.product_id, item.size]);
      db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.qty, item.product_id]);
    }
  });

  audit(req, 'order.refund', 'order', order.id, { amount, note: note ?? null, reference: order.reference });
  res.json({ ok: true, refundedPaise: amount });
});

/* ----------------------------------------------------------------- customers */
router.get('/customers', (req, res) => {
  const db = getDb();
  const p = paged(req);
  const q = String(req.query.q || '').trim();
  const where = ["u.role = 'customer'", 'u.is_guest = 0'];
  const params = [];
  if (q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const total = db.get(`SELECT COUNT(*) AS n FROM users u ${whereSql}`, params).n;
  const rows = db.all(
    `SELECT u.id, u.name, u.email, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(total_paise),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS spend
       FROM users u ${whereSql}
      ORDER BY spend DESC, u.id DESC LIMIT ? OFFSET ?`,
    [...params, p.limit, p.offset]
  );

  res.json({
    customers: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, joinedAt: r.created_at,
      orderCount: r.order_count, spendPaise: r.spend,
    })),
    ...pageMeta(total, p),
  });
});

router.get('/customers/:id', (req, res) => {
  const db = getDb();
  const user = db.get("SELECT id, name, email, created_at FROM users WHERE id = ? AND role = 'customer'", [Number(req.params.id)]);
  if (!user) throw notFound('Customer not found');
  const orders = db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [user.id])
    .map((o) => orderDto(o, db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto)));
  const addresses = db.all('SELECT * FROM addresses WHERE user_id = ?', [user.id]);
  res.json({ customer: { id: user.id, name: user.name, email: user.email, joinedAt: user.created_at, orders, addresses } });
});

/* ------------------------------------------------------------------- coupons */
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24).regex(/^[A-Z0-9_-]+$/, 'Letters, numbers, dash and underscore only'),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().int().min(1),
  minSubtotal: z.coerce.number().int().min(0).default(0),
  maxDiscount: z.coerce.number().int().min(0).optional().nullable(),
  active: z.coerce.boolean().optional().default(true),
});

const couponDto = (c) => ({
  code: c.code, type: c.type, value: c.value,
  minSubtotal: c.min_subtotal, maxDiscount: c.max_discount, active: Boolean(c.active),
});

router.get('/coupons', requireOwner, (_req, res) => {
  const db = getDb();
  res.json({ coupons: db.all('SELECT * FROM coupons ORDER BY code').map(couponDto) });
});

router.post('/coupons', requireOwner, (req, res) => {
  const data = parse(couponSchema, req.body);
  const db = getDb();
  if (db.get('SELECT code FROM coupons WHERE code = ?', [data.code])) throw conflict('That coupon already exists');
  if (data.type === 'percent' && data.value > 90) throw badRequest('Percentage discounts are capped at 90%');

  db.run('INSERT INTO coupons (code, type, value, min_subtotal, max_discount, active) VALUES (?,?,?,?,?,?)',
    [data.code, data.type, data.value, data.minSubtotal, data.maxDiscount ?? null, data.active ? 1 : 0]);
  db.flush();
  audit(req, 'coupon.create', 'coupon', data.code);
  res.status(201).json({ coupon: couponDto(db.get('SELECT * FROM coupons WHERE code = ?', [data.code])) });
});

router.patch('/coupons/:code', requireOwner, (req, res) => {
  const db = getDb();
  const existing = db.get('SELECT * FROM coupons WHERE code = ?', [req.params.code]);
  if (!existing) throw notFound('Coupon not found');
  const data = parse(couponSchema.partial(), req.body);

  const fields = [];
  const params = [];
  const map = { type: 'type', value: 'value', minSubtotal: 'min_subtotal', maxDiscount: 'max_discount', active: 'active' };
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${column} = ?`); params.push(key === 'active' ? (data[key] ? 1 : 0) : data[key]); }
  }
  if (!fields.length) throw badRequest('Nothing to update');
  db.run(`UPDATE coupons SET ${fields.join(', ')} WHERE code = ?`, [...params, existing.code]);
  db.flush();
  audit(req, 'coupon.update', 'coupon', existing.code, { fields: Object.keys(data) });
  res.json({ coupon: couponDto(db.get('SELECT * FROM coupons WHERE code = ?', [existing.code])) });
});

router.delete('/coupons/:code', requireOwner, (req, res) => {
  const db = getDb();
  if (!db.get('SELECT code FROM coupons WHERE code = ?', [req.params.code])) throw notFound('Coupon not found');
  db.run('DELETE FROM coupons WHERE code = ?', [req.params.code]);
  db.flush();
  audit(req, 'coupon.delete', 'coupon', req.params.code);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- categories */
const categorySchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes').optional(),
});

router.get('/categories', (_req, res) => {
  const db = getDb();
  res.json({
    categories: db.all(
      `SELECT c.id, c.name, c.slug, c.sort, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS count
         FROM categories c ORDER BY c.sort, c.id`
    ),
  });
});

router.post('/categories', requireOwner, (req, res) => {
  const data = parse(categorySchema, req.body);
  const db = getDb();
  const slug = data.slug || slugify(data.name);
  if (db.get('SELECT id FROM categories WHERE slug = ? OR name = ?', [slug, data.name])) throw conflict('That category already exists');
  const sort = db.get('SELECT COALESCE(MAX(sort),0) + 1 AS n FROM categories').n;
  const { lastInsertRowid } = db.run('INSERT INTO categories (name, slug, sort) VALUES (?,?,?)', [data.name, slug, sort]);
  db.flush();
  audit(req, 'category.create', 'category', lastInsertRowid, { name: data.name });
  res.status(201).json({ category: { id: lastInsertRowid, name: data.name, slug, sort, count: 0 } });
});

router.patch('/categories/:id', requireOwner, (req, res) => {
  const data = parse(categorySchema.partial(), req.body);
  const db = getDb();
  const existing = db.get('SELECT * FROM categories WHERE id = ?', [Number(req.params.id)]);
  if (!existing) throw notFound('Category not found');

  const name = data.name ?? existing.name;
  const slug = data.slug ?? (data.name ? slugify(data.name) : existing.slug);
  const clash = db.get('SELECT id FROM categories WHERE (slug = ? OR name = ?) AND id != ?', [slug, name, existing.id]);
  if (clash) throw conflict('Another category already uses that name');

  db.run('UPDATE categories SET name = ?, slug = ? WHERE id = ?', [name, slug, existing.id]);
  db.flush();
  audit(req, 'category.update', 'category', existing.id, { name, slug });
  res.json({ category: { id: existing.id, name, slug, sort: existing.sort } });
});

/* ------------------------------------------------------------------ settings */
router.get('/settings', requireOwner, (_req, res) => {
  res.json({ settings: getSettings() });
});

router.patch('/settings', requireOwner, (req, res) => {
  const schema = z.object({
    storeName: z.string().trim().min(2).max(40).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    supportEmail: z.string().trim().email().optional(),
    taxPercent: z.coerce.number().min(0).max(50).optional(),
    freeDeliveryThreshold: z.coerce.number().int().min(0).optional(),
    deliveryFee: z.coerce.number().int().min(0).optional(),
  });
  const data = parse(schema, req.body);
  const settings = saveSettings(data);
  audit(req, 'settings.update', 'settings', null, data);
  res.json({ settings });
});

/* --------------------------------------------------------------------- audit */
router.get('/audit', (req, res) => {
  const db = getDb();
  const p = paged(req, { defaultLimit: 30 });
  const q = String(req.query.q || '').trim();
  const where = q ? 'WHERE action LIKE ? OR actor_email LIKE ? OR entity_id LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const total = db.get(`SELECT COUNT(*) AS n FROM audit_log ${where}`, params).n;
  const rows = db.all(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, p.limit, p.offset]);
  res.json({
    entries: rows.map((r) => ({
      id: r.id, action: r.action, entity: r.entity, entityId: r.entity_id,
      actorEmail: r.actor_email, meta: r.meta ? JSON.parse(r.meta) : null, createdAt: r.created_at,
    })),
    ...pageMeta(total, p),
  });
});

/* --------------------------------------------------------------------- staff */
router.get('/staff', requireOwner, (_req, res) => {
  const db = getDb();
  res.json({
    staff: db.all("SELECT id, name, email, role, is_active, totp_enabled, created_at FROM users WHERE role IN ('admin','staff') ORDER BY id")
      .map((u) => ({ ...u, is_active: !!u.is_active, totp_enabled: !!u.totp_enabled })),
  });
});

const staffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'staff']),
});

router.post('/staff', requireOwner, async (req, res) => {
  const data = parse(staffSchema, req.body);
  const db = getDb();
  if (db.get('SELECT id FROM users WHERE email = ?', [data.email])) throw conflict('That email is already registered');
  const hash = await bcrypt.hash(data.password, 10);
  const { lastInsertRowid } = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
    [data.name, data.email, hash, data.role]);
  db.flush();
  audit(req, 'staff.create', 'user', lastInsertRowid, { email: data.email, role: data.role });
  res.status(201).json({ ok: true, id: lastInsertRowid });
});

router.patch('/staff/:id', requireOwner, (req, res) => {
  const schema = z.object({ role: z.enum(['admin', 'staff']).optional(), isActive: z.coerce.boolean().optional() });
  const data = parse(schema, req.body);
  const db = getDb();
  const user = db.get('SELECT * FROM users WHERE id = ?', [Number(req.params.id)]);
  if (!user) throw notFound('User not found');
  if (user.id === req.user.id && data.isActive === false) throw badRequest('You cannot deactivate your own account');

  if (data.role !== undefined) db.run('UPDATE users SET role = ? WHERE id = ?', [data.role, user.id]);
  if (data.isActive !== undefined) db.run('UPDATE users SET is_active = ? WHERE id = ?', [data.isActive ? 1 : 0, user.id]);
  db.flush();
  audit(req, 'staff.update', 'user', user.id, data);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------------- 2FA */
router.get('/2fa', (req, res) => {
  const db = getDb();
  const user = db.get('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
  res.json({ enabled: Boolean(user.totp_enabled) });
});

router.post('/2fa/setup', (req, res) => {
  const db = getDb();
  const secret = generateSecret();
  db.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret, req.user.id]);
  db.flush();
  res.json({
    secret,
    otpauth: otpauthUrl({ secret, label: req.user.email, issuer: getSettings().storeName }),
  });
});

router.post('/2fa/enable', (req, res) => {
  const schema = z.object({ code: z.string().trim().length(6) });
  const { code } = parse(schema, req.body);
  const db = getDb();
  const user = db.get('SELECT totp_secret FROM users WHERE id = ?', [req.user.id]);
  if (!user.totp_secret) throw badRequest('Start the setup first');
  if (!verifyTotp(user.totp_secret, code)) throw badRequest('That code is not valid — check your authenticator clock');

  db.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [req.user.id]);
  db.flush();
  audit(req, '2fa.enable', 'user', req.user.id);
  res.json({ ok: true, enabled: true });
});

router.post('/2fa/disable', requireOwner, (req, res) => {
  const schema = z.object({ code: z.string().trim().length(6) });
  const { code } = parse(schema, req.body);
  const db = getDb();
  const user = db.get('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);
  if (!user.totp_enabled) throw badRequest('Two-factor is not enabled');
  if (!verifyTotp(user.totp_secret, code)) throw badRequest('That code is not valid');

  db.run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [req.user.id]);
  db.flush();
  audit(req, '2fa.disable', 'user', req.user.id);
  res.json({ ok: true, enabled: false });
});

/* ------------------------------------------------------------------- config */
router.get('/config', (_req, res) => {
  res.json({ storeUrl: config.storePublicUrl });
});

export default router;
