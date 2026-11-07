import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

export const addressSchema = z.object({
  label: z.string().trim().max(20).optional().default('Home'),
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[+0-9][0-9\s-]{7,16}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(5).max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode'),
  isDefault: z.coerce.boolean().optional().default(false),
});

const dto = (row) => ({
  id: row.id,
  label: row.label,
  fullName: row.full_name,
  phone: row.phone,
  line1: row.line1,
  line2: row.line2,
  city: row.city,
  state: row.state,
  pincode: row.pincode,
  isDefault: Boolean(row.is_default),
});

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.user.id]);
  res.json({ addresses: rows.map(dto) });
});

router.post('/', (req, res) => {
  const data = parse(addressSchema, req.body);
  const db = getDb();
  const count = db.get('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', [req.user.id]).n;
  const makeDefault = data.isDefault || count === 0;

  const id = db.transaction(() => {
    if (makeDefault) db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    const { lastInsertRowid } = db.run(
      `INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, data.label, data.fullName, data.phone, data.line1, data.line2, data.city, data.state, data.pincode, makeDefault ? 1 : 0]
    );
    return lastInsertRowid;
  });

  res.status(201).json({ address: dto(db.get('SELECT * FROM addresses WHERE id = ?', [id])) });
});

router.patch('/:id', (req, res) => {
  const data = parse(addressSchema.partial(), req.body);
  const db = getDb();
  const row = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  if (!row) throw notFound('Address not found');

  const map = { label: 'label', fullName: 'full_name', phone: 'phone', line1: 'line1', line2: 'line2', city: 'city', state: 'state', pincode: 'pincode' };
  const fields = [];
  const params = [];
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) { fields.push(`${column} = ?`); params.push(data[key]); }
  }

  db.transaction(() => {
    if (fields.length) db.run(`UPDATE addresses SET ${fields.join(', ')} WHERE id = ?`, [...params, row.id]);
    if (data.isDefault) {
      db.run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
      db.run('UPDATE addresses SET is_default = 1 WHERE id = ?', [row.id]);
    }
  });

  res.json({ address: dto(db.get('SELECT * FROM addresses WHERE id = ?', [row.id])) });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.get('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  if (!row) throw notFound('Address not found');
  db.run('DELETE FROM addresses WHERE id = ?', [row.id]);
  if (row.is_default) {
    const next = db.get('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1', [req.user.id]);
    if (next) db.run('UPDATE addresses SET is_default = 1 WHERE id = ?', [next.id]);
  }
  db.flush();
  res.json({ ok: true });
});

export default router;
