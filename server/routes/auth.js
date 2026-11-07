import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { asyncHandler } from '../lib/errors.js';
import { userDto } from '../lib/serialize.js';
import { signToken, setAuthCookie, clearAuthCookie, clearGuestCookie, cookieNameFor } from '../middleware/auth.js';
import { forbidden } from '../lib/errors.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { verifyTotp } from '../lib/totp.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

router.post('/register', asyncHandler(async (req, res) => {
  if (req.app.locals.surface === 'admin') {
    throw forbidden('Accounts cannot be created on the admin panel');
  }
  const { name, email, password } = parse(registerSchema, req.body);
  const db = getDb();

  if (db.get('SELECT id FROM users WHERE email = ?', [email])) {
    throw conflict('An account with this email already exists');
  }

  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', [name, email, hash, 'customer']);
  db.flush();

  const user = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [lastInsertRowid]);
  setAuthCookie(res, signToken(user), cookieNameFor(req));
  res.status(201).json({ user: userDto(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const db = getDb();
  const user = db.get('SELECT * FROM users WHERE email = ?', [email]);

  // Constant-ish time: always run a comparison so a missing user is not faster.
  const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw unauthorized('Email or password is incorrect');

  if (user.is_active === 0) throw forbidden('This account has been deactivated');

  // The admin panel is a separate door: only admins and staff get a session there.
  if (req.app.locals.surface === 'admin' && !['admin', 'staff'].includes(user.role)) {
    throw forbidden('This account does not have admin access');
  }

  // Two-factor: hand back a short-lived ticket instead of a session.
  if (user.totp_enabled) {
    const tempToken = jwt.sign({ sub: user.id, purpose: '2fa' }, config.jwtSecret, { expiresIn: '5m' });
    return res.json({ twoFactor: true, tempToken });
  }

  setAuthCookie(res, signToken(user), cookieNameFor(req));
  res.json({ user: userDto(user) });
}));

const twoFactorSchema = z.object({ tempToken: z.string().min(10), code: z.string().trim().length(6) });

router.post('/2fa', asyncHandler(async (req, res) => {
  const { tempToken, code } = parse(twoFactorSchema, req.body);
  let payload;
  try {
    payload = jwt.verify(tempToken, config.jwtSecret);
  } catch {
    throw unauthorized('That sign-in attempt expired — start again');
  }
  if (payload.purpose !== '2fa') throw unauthorized('That sign-in attempt is not valid');

  const db = getDb();
  const user = db.get('SELECT * FROM users WHERE id = ?', [payload.sub]);
  if (!user || !user.totp_enabled) throw unauthorized('Two-factor is not enabled for this account');
  if (!verifyTotp(user.totp_secret, code)) throw unauthorized('That code is not valid');

  setAuthCookie(res, signToken(user), cookieNameFor(req));
  res.json({ user: userDto(user) });
}));

router.post('/logout', (req, res) => {
  clearAuthCookie(res, cookieNameFor(req));
  clearGuestCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user || req.isGuest) return res.json({ user: null, guest: Boolean(req.isGuest) });
  res.json({ user: userDto(req.user) });
});

export default router;
