import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export function setAuthCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(config.cookieName, { path: '/' });
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === config.cookieName) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const db = getDb();
    const user = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [payload.sub]);
    if (user) req.user = user;
  } catch {
    /* invalid token is treated as anonymous */
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Admin access only'));
  next();
}
