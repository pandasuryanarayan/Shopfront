import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { openDatabase, getDb, resetDatabaseForTests } from '../server/db/index.js';
import { seed } from '../server/db/seed.js';
import { createApp } from '../server/app.js';

let app;       // storefront surface (port 4000)
let adminApp;  // admin surface (port 4001)

before(async () => {
  await openDatabase({ inMemory: true });
  await seed({ silent: true });
  app = createApp({ surface: 'store' });
  adminApp = createApp({ surface: 'admin' });
});

after(() => {
  getDb().close();
  resetDatabaseForTests();
});

test('health endpoint responds', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('catalogue lists products with pagination', async () => {
  const res = await request(app).get('/api/products?limit=5');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 5);
  assert.ok(res.body.total >= 24);
  assert.ok(res.body.items[0].pricePaise > 0);
});

test('catalogue filters by category and search', async () => {
  const byCategory = await request(app).get('/api/products?category=footwear');
  assert.equal(byCategory.status, 200);
  assert.ok(byCategory.body.items.every((p) => p.category.slug === 'footwear'));

  const search = await request(app).get('/api/products?q=runner');
  assert.ok(search.body.items.length >= 1);
});

test('product detail returns sizes and related items', async () => {
  const res = await request(app).get('/api/products/aero-runner-pro');
  assert.equal(res.status, 200);
  assert.equal(res.body.product.slug, 'aero-runner-pro');
  assert.ok(res.body.product.sizes.length >= 6);
  assert.ok(Array.isArray(res.body.related));
});

test('unknown product returns 404', async () => {
  const res = await request(app).get('/api/products/does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('registration validates input', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'nope', password: '123' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error.details.length >= 3);
});

test('full purchase flow: register → cart → checkout → orders', async () => {
  const agent = request.agent(app);

  const register = await agent.post('/api/auth/register').send({
    name: 'Test Buyer',
    email: 'buyer@example.com',
    password: 'SuperSecret1',
  });
  assert.equal(register.status, 201);
  assert.equal(register.body.user.email, 'buyer@example.com');

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);

  const product = getDb().get("SELECT id FROM products WHERE slug = 'aero-runner-pro'");

  const add = await agent.post('/api/cart').send({ productId: product.id, size: 'UK 9', qty: 2 });
  assert.equal(add.status, 201);
  assert.equal(add.body.items.length, 1);
  assert.equal(add.body.summary.itemCount, 2);

  const checkout = await agent.post('/api/orders').send({
    address: {
      fullName: 'Test Buyer',
      phone: '+91 98765 43210',
      line1: '42, 3rd Cross, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560038',
    },
    paymentMethod: 'cod',
  });
  assert.equal(checkout.status, 201);
  assert.match(checkout.body.order.reference, /^SF-/);
  assert.equal(checkout.body.order.items.length, 1);
  assert.equal(checkout.body.order.paymentStatus, 'pending');

  const cartAfter = await agent.get('/api/cart');
  assert.equal(cartAfter.body.items.length, 0);

  const orders = await agent.get('/api/orders');
  assert.equal(orders.status, 200);
  assert.ok(orders.body.orders.length >= 1);
});

test('checkout rejects an empty cart', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Empty Cart', email: 'empty@example.com', password: 'SuperSecret1' });
  const res = await agent.post('/api/orders').send({
    address: { fullName: 'A B', phone: '+919876543210', line1: 'Some street 12', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    paymentMethod: 'upi',
  });
  assert.equal(res.status, 400);
});

test('cart endpoints require authentication', async () => {
  const res = await request(app).get('/api/cart');
  assert.equal(res.status, 401);
});

test('coupon validation applies discount', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Coupon User', email: 'coupon@example.com', password: 'SuperSecret1' });
  const res = await agent.post('/api/cart/coupon').send({ code: 'WELCOME10', subtotalPaise: 500000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.discountPaise, 50000);
});

test('a customer session is not accepted on the admin surface', async () => {
  const storeLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const storeCookie = storeLogin.headers['set-cookie'][0].split(';')[0];

  // The storefront cookie is a different name, so the admin app ignores it.
  const res = await request(adminApp).get('/api/mukhiya/stats').set('Cookie', storeCookie);
  assert.equal(res.status, 401);
});

test('admin can read dashboard stats', async () => {
  const agent = request.agent(adminApp);
  const login = await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'admin');

  const stats = await agent.get('/api/mukhiya/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.kpis.orders >= 1);
  assert.ok(Array.isArray(stats.body.recentOrders));
});

test('admin API is not mounted on the storefront surface', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  const res = await agent.get('/api/mukhiya/stats');
  assert.equal(res.status, 404);
});

test('a customer cannot sign in on the admin surface', async () => {
  const res = await request(adminApp)
    .post('/api/auth/login')
    .send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  assert.equal(res.status, 403);
});

test('store and admin sessions use different cookies', async () => {
  const storeLogin = await request(app).post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const adminLogin = await request(adminApp).post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const storeCookie = storeLogin.headers['set-cookie'][0].split(';')[0];
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];
  assert.ok(storeCookie.startsWith('sf_token='), `expected sf_token, got ${storeCookie.split('=')[0]}`);
  assert.ok(adminCookie.startsWith('sf_admin_token='), `expected sf_admin_token, got ${adminCookie.split('=')[0]}`);
});

test('login with wrong password is rejected', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'wrong-password' });
  assert.equal(res.status, 401);
});
