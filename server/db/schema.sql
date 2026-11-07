-- Shopfront schema. All monetary columns are integer paise.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','staff')),
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  subtitle      TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  price_paise   INTEGER NOT NULL CHECK (price_paise >= 0),
  mrp_paise     INTEGER NOT NULL CHECK (mrp_paise >= 0),
  stock         INTEGER NOT NULL DEFAULT 0,
  rating        REAL    NOT NULL DEFAULT 0,
  rating_count  INTEGER NOT NULL DEFAULT 0,
  gradient_from TEXT    NOT NULL DEFAULT '#EDEBFF',
  gradient_to   TEXT    NOT NULL DEFAULT '#D6CDFF',
  badge         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

CREATE TABLE IF NOT EXISTS product_sizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, label)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       TEXT    NOT NULL DEFAULT 'One size',
  qty        INTEGER NOT NULL CHECK (qty > 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, product_id, size)
);

CREATE TABLE IF NOT EXISTS coupons (
  code             TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('percent','flat')),
  value            INTEGER NOT NULL,
  min_subtotal     INTEGER NOT NULL DEFAULT 0,
  max_discount     INTEGER,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reference       TEXT    NOT NULL UNIQUE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'placed'
                  CHECK (status IN ('placed','packed','shipped','delivered','cancelled')),
  payment_method  TEXT    NOT NULL CHECK (payment_method IN ('upi','card','cod')),
  payment_status  TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (payment_status IN ('pending','paid','failed','refunded')),
  subtotal_paise  INTEGER NOT NULL,
  discount_paise  INTEGER NOT NULL DEFAULT 0,
  delivery_paise  INTEGER NOT NULL DEFAULT 0,
  tax_paise       INTEGER NOT NULL DEFAULT 0,
  total_paise     INTEGER NOT NULL,
  coupon_code     TEXT,
  address_json    TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title            TEXT    NOT NULL,
  size             TEXT    NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  qty              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);


-- ---------------------------------------------------------------------------
-- Feature tables: wishlist, saved addresses, product images, colour variants,
-- return requests. Guest checkouts reuse the users table with is_guest = 1.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wishlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL DEFAULT 'Home',
  full_name  TEXT    NOT NULL,
  phone      TEXT    NOT NULL,
  line1      TEXT    NOT NULL,
  line2      TEXT    NOT NULL DEFAULT '',
  city       TEXT    NOT NULL,
  state      TEXT    NOT NULL,
  pincode    TEXT    NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  alt        TEXT    NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_images ON product_images(product_id);

CREATE TABLE IF NOT EXISTS product_variants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  colour     TEXT    NOT NULL,
  colour_hex TEXT    NOT NULL DEFAULT '#12121A',
  stock      INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, colour)
);

CREATE TABLE IF NOT EXISTS return_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT    NOT NULL,
  note          TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','approved','rejected','picked_up','refunded')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_item_id)
);


-- ---------------------------------------------------------------------------
-- Admin: store settings, audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  actor_email TEXT,
  action      TEXT    NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  meta        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
