import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export function cookieNameFor(req) {
  return req.app?.locals?.cookieName || config.cookieName;
}

export function setAuthCookie(res, token, cookieName = config.cookieName) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res, cookieName = config.cookieName) {
  res.clearCookie(cookieName, { path: '/' });
}

function cookieValue(cookies, name) {
  if (!cookies) return null;
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = req.headers.cookie;
  // A signed-in customer wins over a guest session in the same browser.
  return cookieValue(cookies, cookieNameFor(req)) || cookieValue(cookies, config.guestCookieName);
}

export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const db = getDb();
    const user = db.get('SELECT id, name, email, role, is_guest, is_active FROM users WHERE id = ?', [payload.sub]);
    if (user && user.is_active !== 0) {
      req.user = user;
      req.isGuest = Boolean(user.is_guest);
    }
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

/** Admin or staff: day-to-day operations. */
export function requireAdminOrStaff(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!['admin', 'staff'].includes(req.user.role)) return next(forbidden('Admin access only'));
  next();
}

/** Full admin only: money movement, settings, staff and coupons. */
export function requireOwner(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Only an account owner can do this'));
  next();
}

/**
 * Cart and checkout work for anonymous shoppers too: the first write creates a
 * lightweight guest user and hands back a guest cookie, so the existing cart,
 * order and stock code runs unchanged.
 */
export function ensureCartOwner(req, res, next) {
  if (req.user) return next();
  const db = getDb();
  const { lastInsertRowid } = db.run(
    "INSERT INTO users (name, email, password_hash, role, is_guest) VALUES (?,?,?,?,1)",
    ['Guest shopper', `guest_${crypto.randomUUID()}@local`, 'x', 'customer']
  );
  const user = db.get('SELECT id, name, email, role FROM users WHERE id = ?', [lastInsertRowid]);
  res.cookie(config.guestCookieName, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  req.user = user;
  req.isGuest = true;
  next();
}

export function clearGuestCookie(res) {
  res.clearCookie(config.guestCookieName, { path: '/' });
}
