import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { productDto } from '../lib/serialize.js';

const router = Router();
router.use(requireAuth);

const bodySchema = z.object({ productId: z.coerce.number().int().positive() });

function items(db, userId) {
  const rows = db.all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug, w.created_at AS saved_at
       FROM wishlist w
       JOIN products p ON p.id = w.product_id
       JOIN categories c ON c.id = p.category_id
      WHERE w.user_id = ? AND p.is_active = 1
      ORDER BY w.id DESC`,
    [userId]
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const images = db.all(`SELECT * FROM product_images WHERE product_id IN (${marks}) ORDER BY sort`, ids);
  return rows.map((r) => ({
    ...productDto(r, [], images.filter((i) => i.product_id === r.id)),
    savedAt: r.saved_at,
  }));
}

router.get('/', (req, res) => {
  const db = getDb();
  res.json({ items: items(db, req.user.id), count: db.get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', [req.user.id]).n });
});

router.get('/ids', (req, res) => {
  const db = getDb();
  const rows = db.all('SELECT product_id FROM wishlist WHERE user_id = ?', [req.user.id]);
  res.json({ productIds: rows.map((r) => r.product_id) });
});

router.post('/', (req, res) => {
  const { productId } = parse(bodySchema, req.body);
  const db = getDb();
  if (!db.get('SELECT id FROM products WHERE id = ? AND is_active = 1', [productId])) {
    throw notFound('That product is no longer available');
  }
  db.run('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?,?)', [req.user.id, productId]);
  db.flush();
  res.status(201).json({ saved: true, count: db.get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', [req.user.id]).n });
});

router.delete('/:productId', (req, res) => {
  const db = getDb();
  db.run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', [req.user.id, Number(req.params.productId)]);
  db.flush();
  res.json({ saved: false, count: db.get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', [req.user.id]).n });
});

export default router;
