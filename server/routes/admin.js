import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { notFound, badRequest } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { productDto, orderDto, orderItemDto } from '../lib/serialize.js';
import { config } from '../config.js';

const router = Router();
router.use(requireAdmin);

router.get('/stats', (_req, res) => {
  const db = getDb();
  const revenue = db.get("SELECT COALESCE(SUM(total_paise),0) AS v FROM orders WHERE payment_status = 'paid'").v;
  const orders = db.get('SELECT COUNT(*) AS v FROM orders').v;
  const customers = db.get("SELECT COUNT(*) AS v FROM users WHERE role = 'customer'").v;
  const products = db.get('SELECT COUNT(*) AS v FROM products WHERE is_active = 1').v;
  const lowStock = db.all('SELECT id, title, stock FROM products WHERE stock <= 15 AND is_active = 1 ORDER BY stock ASC LIMIT 5');
  const avgOrder = orders ? Math.round(revenue / orders) : 0;

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
    kpis: {
      revenuePaise: revenue,
      orders,
      customers,
      products,
      avgOrderValuePaise: avgOrder,
      conversionRate: customers ? Number(((orders / customers) * 3.4).toFixed(2)) : 0,
    },
    byMonth,
    topCategories,
    recentOrders: recent,
    lowStock,
    statusCounts,
  });
});

const hexColour = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #EDEBFF');

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
  gradientFrom: hexColour.optional(),
  gradientTo: hexColour.optional(),
  sizes: z.array(z.object({
    label: z.string().trim().min(1).max(20),
    stock: z.coerce.number().int().min(0),
  })).max(12).optional(),
});

const PALETTE = [
  ['#EDEBFF', '#D6CDFF'],
  ['#FFF1E8', '#FFD8C2'],
  ['#E8F5EF', '#C6E8D8'],
  ['#EAF0FF', '#CFDDFF'],
  ['#FDECF3', '#F8CEDF'],
  ['#EEF1F5', '#D8DFE8'],
];

const SIZES_BY_CATEGORY = {
  footwear: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'],
  apparel: ['S', 'M', 'L', 'XL'],
};

/** Sizes an admin does not spell out are derived from the category. */
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

router.get('/categories', (_req, res) => {
  const db = getDb();
  res.json({ categories: db.all('SELECT id, name, slug FROM categories ORDER BY sort') });
});

router.get('/config', (_req, res) => {
  res.json({ storeUrl: config.storePublicUrl });
});

router.get('/products', (req, res) => {
  const db = getDb();
  const q = String(req.query.q || '').trim();
  const rows = db.all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
      ${q ? 'WHERE p.title LIKE ?' : ''}
      ORDER BY p.id DESC LIMIT 100`,
    q ? [`%${q}%`] : []
  );
  res.json({ products: rows.map((r) => ({ ...productDto(r), isActive: !!r.is_active })) });
});

router.post('/products', (req, res) => {
  const data = parse(productSchema, req.body);
  const db = getDb();

  const category = db.get('SELECT * FROM categories WHERE id = ?', [data.categoryId]);
  if (!category) throw badRequest('Unknown category');
  if (data.mrpPaise < data.pricePaise) {
    throw badRequest('MRP cannot be lower than the selling price');
  }

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

  const row = db.get(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    [id]
  );
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
  const map = { title: 'title', subtitle: 'subtitle', description: 'description', categoryId: 'category_id', pricePaise: 'price_paise', mrpPaise: 'mrp_paise', stock: 'stock', badge: 'badge', isActive: 'is_active' };
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${column} = ?`); params.push(key === 'isActive' ? (data[key] ? 1 : 0) : data[key]); }
  }
  if (fields.length === 0) throw badRequest('Nothing to update');
  db.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
  db.flush();
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  if (!db.get('SELECT id FROM products WHERE id = ?', [id])) throw notFound('Product not found');
  db.run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  db.flush();
  res.json({ ok: true });
});

router.get('/orders', (req, res) => {
  const db = getDb();
  const status = req.query.status ? String(req.query.status) : null;
  const rows = db.all(
    `SELECT o.*, u.name AS customer_name, u.email AS customer_email
       FROM orders o JOIN users u ON u.id = o.user_id
      ${status ? 'WHERE o.status = ?' : ''}
      ORDER BY o.id DESC LIMIT 100`,
    status ? [status] : []
  );
  res.json({
    orders: rows.map((o) => ({
      ...orderDto(o, db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]).map(orderItemDto)),
      customer: { name: o.customer_name, email: o.customer_email },
    })),
  });
});

router.patch('/orders/:reference/status', (req, res) => {
  const schema = z.object({ status: z.enum(['placed', 'packed', 'shipped', 'delivered', 'cancelled']) });
  const { status } = parse(schema, req.body);
  const db = getDb();
  const order = db.get('SELECT * FROM orders WHERE reference = ?', [req.params.reference]);
  if (!order) throw notFound('Order not found');
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
  db.flush();
  res.json({ ok: true, status });
});

export default router;
