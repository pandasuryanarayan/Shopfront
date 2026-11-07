import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { notFound, badRequest, asyncHandler } from '../lib/errors.js';
import { productDto } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SORTS = {
  popular: 'p.rating_count DESC, p.rating DESC',
  newest: 'p.id DESC',
  price_asc: 'p.price_paise ASC',
  price_desc: 'p.price_paise DESC',
  rating: 'p.rating DESC, p.rating_count DESC',
};

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.string().trim().max(20).optional(),
  sort: z.enum(Object.keys(SORTS)).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(48).optional(),
});

router.get('/categories', (_req, res) => {
  const db = getDb();
  const rows = db.all(
    `SELECT c.id, c.name, c.slug, COUNT(p.id) AS count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      GROUP BY c.id ORDER BY c.sort`
  );
  res.json({ categories: rows });
});

router.get('/products', (req, res) => {
  const query = parse(listSchema, req.query);
  const db = getDb();
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;

  const where = ['p.is_active = 1'];
  const params = [];

  if (query.q) {
    where.push('(p.title LIKE ? OR p.subtitle LIKE ? OR p.description LIKE ?)');
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  if (query.category) {
    where.push('c.slug = ?');
    params.push(query.category);
  }
  if (query.minPrice !== undefined) { where.push('p.price_paise >= ?'); params.push(query.minPrice); }
  if (query.maxPrice !== undefined) { where.push('p.price_paise <= ?'); params.push(query.maxPrice); }
  if (query.size) {
    where.push('EXISTS (SELECT 1 FROM product_sizes s WHERE s.product_id = p.id AND s.label = ? AND s.stock > 0)');
    params.push(query.size);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.get(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id ${whereSql}`, params).n;

  const rows = db.all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereSql}
      ORDER BY ${SORTS[query.sort ?? 'popular']}
      LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  res.json({
    items: rows.map((r) => productDto(r)),
    page,
    pageSize: limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get('/products/:slug', (req, res) => {
  const db = getDb();
  const row = db.get(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.is_active = 1`,
    [req.params.slug]
  );
  if (!row) throw notFound('That product does not exist');

  const sizes = db.all('SELECT label, stock FROM product_sizes WHERE product_id = ? ORDER BY id', [row.id]);
  const reviews = db.all(
    `SELECT r.id, r.rating, r.body, r.created_at, u.name AS author
       FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 20`,
    [row.id]
  );
  const related = db.all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
      ORDER BY p.rating DESC LIMIT 4`,
    [row.category_id, row.id]
  );

  res.json({
    product: productDto(row, sizes),
    reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, author: r.author, createdAt: r.created_at })),
    related: related.map((r) => productDto(r)),
  });
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(1000).optional(),
});

router.post('/products/:slug/reviews', requireAuth, asyncHandler(async (req, res) => {
  const { rating, body } = parse(reviewSchema, req.body);
  const db = getDb();
  const product = db.get('SELECT id FROM products WHERE slug = ?', [req.params.slug]);
  if (!product) throw notFound('That product does not exist');

  db.run(
    `INSERT INTO reviews (product_id, user_id, rating, body) VALUES (?,?,?,?)
     ON CONFLICT (product_id, user_id) DO UPDATE SET rating = excluded.rating, body = excluded.body`,
    [product.id, req.user.id, rating, body ?? '']
  );
  const agg = db.get('SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE product_id = ?', [product.id]);
  db.run('UPDATE products SET rating = ?, rating_count = ? WHERE id = ?', [Number(agg.avg.toFixed(2)), agg.n, product.id]);
  db.flush();

  res.status(201).json({ ok: true, rating: Number(agg.avg.toFixed(2)), ratingCount: agg.n });
}));

router.get('/products/:slug/sizes', (req, res) => {
  const db = getDb();
  const product = db.get('SELECT id FROM products WHERE slug = ?', [req.params.slug]);
  if (!product) throw notFound('That product does not exist');
  res.json({ sizes: db.all('SELECT label, stock FROM product_sizes WHERE product_id = ?', [product.id]) });
});

router.get('/search/suggestions', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ suggestions: [] });
  const db = getDb();
  const rows = db.all(
    'SELECT slug, title FROM products WHERE is_active = 1 AND title LIKE ? ORDER BY rating_count DESC LIMIT 6',
    [`%${q}%`]
  );
  res.json({ suggestions: rows });
});

export default router;
