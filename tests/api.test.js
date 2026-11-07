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

test('anonymous visitors get an empty cart rather than a 401', async () => {
  const res = await request(app).get('/api/cart');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.summary.itemCount, 0);
});

test('a guest can add to cart and check out without an account', async () => {
  const agent = request.agent(app);
  const product = getDb().get("SELECT id FROM products WHERE slug = 'cotton-crew-tee'");

  const add = await agent.post('/api/cart').send({ productId: product.id, size: 'M', colour: 'Ecru', qty: 1 });
  assert.equal(add.status, 201);
  assert.equal(add.body.items[0].colour, 'Ecru');

  // guests are not "signed in"
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user, null);
  assert.equal(me.body.guest, true);

  const noEmail = await agent.post('/api/orders').send({
    address: { fullName: 'Guest Buyer', phone: '+919876543210', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    paymentMethod: 'cod',
  });
  assert.equal(noEmail.status, 400, 'guest checkout needs an email');

  const ok = await agent.post('/api/orders').send({
    address: { fullName: 'Guest Buyer', phone: '+919876543210', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    paymentMethod: 'cod',
    guestEmail: 'guest@example.com',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.order.guestEmail, 'guest@example.com');
});

test('wishlist add, list and remove', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const product = getDb().get("SELECT id FROM products WHERE slug = 'trail-grip-runner'");

  const add = await agent.post('/api/wishlist').send({ productId: product.id });
  assert.equal(add.status, 201);
  assert.equal(add.body.saved, true);

  const list = await agent.get('/api/wishlist');
  assert.ok(list.body.items.some((i) => i.slug === 'trail-grip-runner'));
  assert.ok(list.body.items[0].image, 'wishlist items carry an image');

  const remove = await agent.delete(`/api/wishlist/${product.id}`);
  assert.equal(remove.body.saved, false);
});

test('saved addresses: create, default flag, list', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });

  const created = await agent.post('/api/addresses').send({
    label: 'Parents', fullName: 'Ramesh Panda', phone: '+919812345678',
    line1: '7 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016', isDefault: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.address.isDefault, true);

  const list = await agent.get('/api/addresses');
  assert.equal(list.body.addresses.filter((a) => a.isDefault).length, 1, 'exactly one default');
  assert.ok(list.body.addresses.some((a) => a.label === 'Parents'));
});

test('delivered orders can be returned, and only once', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const db = getDb();
  const product = db.get("SELECT id FROM products WHERE slug = 'cotton-throw-blanket'");

  await agent.post('/api/cart').send({ productId: product.id, size: 'One size', qty: 1 });
  const placed = await agent.post('/api/orders').send({
    address: { fullName: 'Test Buyer', phone: '+919876543210', line1: '42, 3rd Cross', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' },
    paymentMethod: 'cod',
  });
  assert.equal(placed.status, 201);

  const order = db.get('SELECT * FROM orders WHERE reference = ?', [placed.body.order.reference]);
  db.run("UPDATE orders SET status = 'delivered' WHERE id = ?", [order.id]);
  const item = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id])[0];

  const res = await agent.post(`/api/orders/${order.reference}/returns`).send({ orderItemId: item.id, reason: 'size' });
  assert.equal(res.status, 201);
  assert.equal(res.body.order.returns.length, 1);
  assert.equal(res.body.order.returns[0].status, 'requested');

  const again = await agent.post(`/api/orders/${order.reference}/returns`).send({ orderItemId: item.id, reason: 'size' });
  assert.equal(again.status, 400, 'a second return for the same item is rejected');
});

test('the return window closes after seven days', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const db = getDb();
  const product = db.get("SELECT id FROM products WHERE slug = 'rose-face-mist'");

  await agent.post('/api/cart').send({ productId: product.id, size: 'One size', qty: 1 });
  const placed = await agent.post('/api/orders').send({
    address: { fullName: 'Test Buyer', phone: '+919876543210', line1: '42, 3rd Cross', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' },
    paymentMethod: 'cod',
  });

  const order = db.get('SELECT * FROM orders WHERE reference = ?', [placed.body.order.reference]);
  db.run("UPDATE orders SET status = 'delivered', created_at = datetime('now', '-20 days') WHERE id = ?", [order.id]);
  const item = db.all('SELECT * FROM order_items WHERE order_id = ?', [order.id])[0];

  const res = await agent.post(`/api/orders/${order.reference}/returns`).send({ orderItemId: item.id, reason: 'changed-mind' });
  assert.equal(res.status, 400);
});

test('products expose images and colour variants', async () => {
  const res = await request(app).get('/api/products/aero-runner-pro');
  assert.ok(res.body.product.images.length >= 1);
  assert.match(res.body.product.images[0].url, /^\/uploads\//);
  assert.ok(res.body.product.colours.length >= 2);
  assert.equal(res.body.product.colours[0].name, 'Black');
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

test('a product created in the admin panel appears in the storefront', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const created = await agent.post('/api/mukhiya/products').send({
    title: 'Alpine Fleece Jacket',
    subtitle: 'Apparel · Unisex',
    description: 'A warm mid-layer for cold mornings.',
    categoryId: 2,
    pricePaise: 249900,
    mrpPaise: 349900,
    stock: 32,
    badge: 'New',
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.product.title, 'Alpine Fleece Jacket');
  assert.equal(created.body.product.slug, 'alpine-fleece-jacket');
  // Apparel sizes are inferred when the admin does not spell them out.
  assert.deepEqual(created.body.product.sizes.map((s) => s.label), ['S', 'M', 'L', 'XL']);

  const listed = await request(app).get('/api/products?q=Alpine');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].slug, 'alpine-fleece-jacket');
  assert.equal(listed.body.items[0].discountPercent, 29);

  const detail = await request(app).get('/api/products/alpine-fleece-jacket');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.product.stock, 32);
});

test('admin cannot create a product priced above its MRP', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  const res = await agent.post('/api/mukhiya/products').send({
    title: 'Impossible Deal',
    categoryId: 1,
    pricePaise: 99900,
    mrpPaise: 49900,
    stock: 5,
  });
  assert.equal(res.status, 400);
});

test('only admins can create products', async () => {
  const storeAgent = request.agent(app);
  await storeAgent.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  const res = await storeAgent.post('/api/mukhiya/products').send({
    title: 'Nope', categoryId: 1, pricePaise: 100, mrpPaise: 200, stock: 1,
  });
  assert.equal(res.status, 404); // admin API is not mounted on the storefront
});

test('admin product tables paginate, filter and export', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const page1 = await agent.get('/api/mukhiya/products?limit=5&page=1');
  assert.equal(page1.status, 200);
  assert.equal(page1.body.products.length, 5);
  assert.equal(page1.body.pageSize, 5);
  assert.ok(page1.body.totalPages >= 2);
  assert.ok(page1.body.products.some((p) => p.image), 'admin rows carry a thumbnail');

  const low = await agent.get('/api/mukhiya/products?status=low');
  assert.ok(low.body.products.every((p) => p.stock <= 15));

  const csv = await agent.get('/api/mukhiya/products/export.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text.split('\n')[0], /^id,slug,title/);
});

test('admin can edit a product and archive then restore it', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  const db = getDb();
  const product = db.get("SELECT * FROM products WHERE slug = 'aero-runner-pro'");

  const edited = await agent.patch(`/api/mukhiya/products/${product.id}`).send({ pricePaise: 399900, stock: 7 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.product.pricePaise, 399900);
  assert.equal(edited.body.product.stock, 7);

  const bad = await agent.patch(`/api/mukhiya/products/${product.id}`).send({ pricePaise: 999900, mrpPaise: 100 });
  assert.equal(bad.status, 400, 'MRP below price is rejected');

  await agent.delete(`/api/mukhiya/products/${product.id}`);
  assert.equal(getDb().get('SELECT is_active FROM products WHERE id = ?', [product.id]).is_active, 0);

  await agent.post(`/api/mukhiya/products/${product.id}/restore`);
  assert.equal(getDb().get('SELECT is_active FROM products WHERE id = ?', [product.id]).is_active, 1);
});

test('bulk stock update applies to many products at once', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  const ids = getDb().all('SELECT id FROM products ORDER BY id LIMIT 3').map((r) => r.id);

  const res = await agent.patch('/api/mukhiya/products').send({ updates: ids.map((id) => ({ id, stock: 55 })) });
  assert.equal(res.status, 200);
  assert.equal(res.body.updated, 3);
  for (const id of ids) assert.equal(getDb().get('SELECT stock FROM products WHERE id = ?', [id]).stock, 55);
});

test('coupons can be created, disabled and deleted', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const created = await agent.post('/api/mukhiya/coupons').send({ code: 'WINTER20', type: 'percent', value: 20, minSubtotal: 100000 });
  assert.equal(created.status, 201);
  assert.equal(created.body.coupon.code, 'WINTER20');

  const dupe = await agent.post('/api/mukhiya/coupons').send({ code: 'WINTER20', type: 'percent', value: 10 });
  assert.equal(dupe.status, 409);

  await agent.patch('/api/mukhiya/coupons/WINTER20').send({ active: false });
  assert.equal(getDb().get("SELECT active FROM coupons WHERE code = 'WINTER20'").active, 0);

  await agent.delete('/api/mukhiya/coupons/WINTER20');
  assert.equal(getDb().get("SELECT code FROM coupons WHERE code = 'WINTER20'"), null);
});

test('categories can be added and renamed', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const created = await agent.post('/api/mukhiya/categories').send({ name: 'Outdoor' });
  assert.equal(created.status, 201);
  assert.equal(created.body.category.slug, 'outdoor');

  const renamed = await agent.patch(`/api/mukhiya/categories/${created.body.category.id}`).send({ name: 'Outdoors' });
  assert.equal(renamed.body.category.slug, 'outdoors');
});

test('settings drive tax and delivery, and are audited', async () => {
  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });

  const saved = await agent.patch('/api/mukhiya/settings').send({ taxPercent: 5, deliveryFee: 2000, freeDeliveryThreshold: 1000000 });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.settings.taxPercent, 5);

  // an order now carries 5% tax and the new delivery fee
  const product = getDb().get("SELECT id FROM products WHERE slug = 'charcoal-face-wash'");
  const buyer = request.agent(app);
  await buyer.post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'Demo@1234' });
  await buyer.post('/api/cart').send({ productId: product.id, size: 'One size', qty: 1 });
  const cart = await buyer.get('/api/cart');
  assert.equal(cart.body.summary.taxPaise, Math.round(cart.body.summary.subtotalPaise * 0.05));
  assert.equal(cart.body.summary.deliveryPaise, 2000);

  const audit = await agent.get('/api/mukhiya/audit?q=settings');
  assert.ok(audit.body.entries.some((e) => e.action === 'settings.update'));
});

test('staff accounts can work orders but not settings', async () => {
  const owner = request.agent(adminApp);
  await owner.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  await owner.post('/api/mukhiya/staff').send({
    name: 'Ops Person', email: 'ops@shopfront.in', password: 'StaffPass1', role: 'staff',
  });

  const staff = request.agent(adminApp);
  const login = await staff.post('/api/auth/login').send({ email: 'ops@shopfront.in', password: 'StaffPass1' });
  assert.equal(login.status, 200);

  const orders = await staff.get('/api/mukhiya/orders');
  assert.equal(orders.status, 200, 'staff can read orders');

  const settings = await staff.patch('/api/mukhiya/settings').send({ taxPercent: 1 });
  assert.equal(settings.status, 403, 'staff cannot change settings');

  const coupons = await staff.get('/api/mukhiya/coupons');
  assert.equal(coupons.status, 403, 'staff cannot see coupons');
});

test('refunds are owner-only and restock the order', async () => {
  const db = getDb();
  const paid = db.get("SELECT * FROM orders WHERE payment_status = 'paid' AND status != 'cancelled' ORDER BY id DESC LIMIT 1");
  const item = db.all('SELECT * FROM order_items WHERE order_id = ?', [paid.id])[0];
  const before = db.get('SELECT stock FROM products WHERE id = ?', [item.product_id]).stock;

  const agent = request.agent(adminApp);
  await agent.post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  const res = await agent.post(`/api/mukhiya/orders/${paid.reference}/refund`).send({});
  assert.equal(res.status, 200);
  assert.equal(getDb().get('SELECT payment_status FROM orders WHERE id = ?', [paid.id]).payment_status, 'refunded');
  assert.equal(getDb().get('SELECT stock FROM products WHERE id = ?', [item.product_id]).stock, before + item.qty);
});

test('two-factor enrolment issues a challenge at login', async () => {
  const { generateSecret, verifyTotp } = await import('../server/lib/totp.js');
  const secret = generateSecret();
  const db = getDb();
  db.run("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE email = 'admin@shopfront.in'", [secret]);

  // produce a valid code for "now"
  const code = await new Promise((resolve) => {
    import('../server/lib/totp.js').then(() => {
      const counter = Math.floor(Date.now() / 30000);
      const enc = (n) => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = 0, value = 0, out = '';
        for (const byte of n) {
          value = (value << 8) | byte; bits += 8;
          while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
        }
        return out;
      };
      // reuse the library by verifying a range instead
      resolve(null);
    });
  });

  const login = await request(adminApp).post('/api/auth/login').send({ email: 'admin@shopfront.in', password: 'Admin@1234' });
  assert.equal(login.body.twoFactor, true);
  assert.ok(login.body.tempToken);
  assert.equal(login.headers['set-cookie'], undefined, 'no session until the code is verified');

  const bad = await request(adminApp).post('/api/auth/2fa').send({ tempToken: login.body.tempToken, code: '000000' });
  assert.equal(bad.status, 401);

  db.run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE email = 'admin@shopfront.in'");
});

test('login with wrong password is rejected', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'demo@shopfront.in', password: 'wrong-password' });
  assert.equal(res.status, 401);
});
