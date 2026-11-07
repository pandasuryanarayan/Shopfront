# Shopfront — E-Commerce Web Application

A complete, production-minded e-commerce application: storefront, cart, checkout, order
management and an admin dashboard. Built with **Node.js + Express + SQLite** on the back end
and **plain HTML, CSS and JavaScript** (no framework, no build step) on the front end.

The UI follows a design system that lives in Figma — tokens, components and six screens:

> **Figma:** https://www.figma.com/design/uUwFz57dQ4bbSSxSQhLZuD

---

## What's inside

**Storefront**
- Home page with hero, category tiles, trending and new-arrival rails, deal band with live countdown
- Product listing with category, price, size and search filters, sorting and pagination
- Product detail with gallery, size picker (sold-out sizes disabled), quantity, reviews and related products
- Cart with quantity steppers, coupon codes, delivery thresholds and live totals
- Checkout with address validation, UPI / card / COD payment selection and server-computed totals
- Wishlist with working save/remove, a dedicated page and a header badge
- Write a review with a star picker (one review per customer per product)
- Saved addresses: an address book at checkout, plus "save this address"
- Guest checkout — no account needed, just an email for the receipt
- Order detail page with a status timeline, and self-service cancellation
- Returns and exchanges on delivered items, within a 7-day window
- Colour variants per product, carried through cart and order lines
- Search autocomplete, recently-viewed rail and a "Picked for you" home rail
- Email + password authentication (bcrypt hashing, JWT in an httpOnly cookie)

**Admin dashboard** — served at `/mukhiya`
- Revenue, orders, AOV and customer KPIs
- Monthly revenue chart, top categories, low-stock alerts
- Order management with status transitions
- Catalogue management: add products from a form (sizes inferred from the category,
  slug generated, card colour picked) — a new product is in the shop immediately
- Archive (soft delete)

**Two independent surfaces**
- The storefront and the admin panel are separate Express apps on separate ports
- Separate session cookies (`sf_token` vs `sf_admin_token`) — cookies are scoped by host and
  ignore the port, so distinct names are what actually keeps the two sessions apart
- The admin surface only serves the admin panel, its assets and its own API; customer accounts
  cannot sign in there, and `/mukhiya` on the storefront redirects to the admin origin

**Guest shopping**
- Anonymous visitors get a lightweight guest session on first cart write, so the same
  cart, checkout, stock and order code paths run unchanged
- Guest orders carry an email for the receipt and stay visible on that browser

**Engineering**
- Strict server-side validation with Zod on every write endpoint
- All money handled as integer paise — no floating point currency bugs
- Stock is checked and decremented inside a transaction; cancellation restocks
- Helmet CSP, rate limiting, hashed passwords, httpOnly + SameSite cookies, parameterised SQL
- Consistent JSON error envelope (`{ error: { code, message, details } }`)
- 13 integration tests covering the full purchase flow

---

## Quick start

```bash
npm install
cp .env.example .env        # then set JWT_SECRET
npm run seed                # optional: create the demo catalogue
npm start
```

`npm start` brings up **both surfaces from one process** (one database, two ports):

| Surface    | URL                             | Session cookie  |
| ---------- | ------------------------------- | --------------- |
| Storefront | http://localhost:4000           | `sf_token`      |
| Admin      | http://localhost:4001/mukhiya   | `sf_admin_token`|

The server seeds itself automatically if the catalogue is empty, so `npm run seed` is optional.

### Demo accounts

| Role     | Email                | Password     |
| -------- | -------------------- | ------------ |
| Customer | `demo@shopfront.in`  | `Demo@1234`  |
| Admin    | `admin@shopfront.in` | `Admin@1234` |

Admin dashboard: **http://localhost:4001/mukhiya** — a separate origin with its own cookie, so you can be
signed in as an admin there and as a customer in the shop at the same time. Set `ADMIN_PORT=0` to run the
storefront only.

### Scripts

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `npm start`    | Start the server                              |
| `npm run dev`  | Start with `node --watch` for auto-reload     |
| `npm run seed` | Reset and reseed the demo catalogue           |
| `npm test`     | Run the integration test suite                |

---

## Project structure

```
server/
  app.js              Express app factory — `createApp({ surface: 'store' | 'admin' })`
  index.js            Bootstrap: database, auto-seed, both listeners, graceful shutdown
  config.js           Environment configuration
  db/
    index.js          SQLite wrapper (sql.js) — query helpers, transactions, atomic flush
    schema.sql        Tables, indexes and constraints
    seed.js           Demo catalogue, users and 8 months of order history
  lib/                Errors, validation, money helpers, DTO serialisers
  middleware/         JWT auth (cookie or bearer), error handling
  services/           Pricing, cart maths, payment gateway adapter
  routes/             auth · catalog · cart · orders · admin
public/
  *.html              One file per screen (no build step)
  css/                tokens.css · app.css · pages.css
  js/                 api.js (fetch client) · store.js · ui.js (components) · pages/*
tests/
  api.test.js         Integration tests over the real Express stack
```

### Database

SQLite via `sql.js` (WebAssembly), so there is **no native build step** — `npm install` works on
any machine, including CI containers without compilers. The database is a single file at
`data/shopfront.db`, written atomically after each mutation.

For high-traffic deployments, swap `server/db/index.js` for `better-sqlite3` (same synchronous
API) or Postgres. Only that one module touches the driver.

---

## API reference

All responses are JSON. Authentication uses an httpOnly cookie set by `/api/auth/login`;
a `Authorization: Bearer <token>` header also works for API clients.

| Method | Endpoint                          | Auth   | Description                        |
| ------ | --------------------------------- | ------ | ---------------------------------- |
| POST   | `/api/auth/register`              | —      | Create an account                  |
| POST   | `/api/auth/login`                 | —      | Sign in                            |
| POST   | `/api/auth/logout`                | —      | Clear the session cookie           |
| GET    | `/api/auth/me`                    | user   | Current user                       |
| GET    | `/api/categories`                 | —      | Categories with product counts     |
| GET    | `/api/products`                   | —      | List + filter (`q`, `category`, `minPrice`, `maxPrice`, `size`, `sort`, `page`, `limit`) |
| GET    | `/api/products/:slug`             | —      | Product, reviews, images, colours and related items |
| GET    | `/api/search/suggestions`         | —      | Type-ahead suggestions             |
| POST   | `/api/products/:slug/reviews`     | user   | Create or update your review       |
| GET    | `/api/cart`                       | user   | Cart with totals                   |
| POST   | `/api/cart`                       | user   | Add an item                        |
| PATCH  | `/api/cart/:id`                   | user   | Change quantity (`0` removes)      |
| DELETE | `/api/cart/:id`                   | user   | Remove an item                     |
| POST   | `/api/cart/coupon`                | user   | Validate a coupon                  |
| POST   | `/api/orders`                     | user   | Place an order from the cart       |
| GET    | `/api/orders`                     | user   | Order history                      |
| GET    | `/api/orders/:reference`          | user   | Single order with returns          |
| POST   | `/api/orders/:reference/returns`  | user   | Request a return on an item        |
| GET    | `/api/wishlist`                   | user   | Saved products                     |
| POST   | `/api/wishlist`                   | user   | Save a product                     |
| DELETE | `/api/wishlist/:productId`        | user   | Remove from wishlist               |
| GET    | `/api/addresses`                  | user   | Saved addresses                    |
| POST   | `/api/addresses`                  | user   | Add an address                     |
| PATCH  | `/api/addresses/:id`              | user   | Edit / set default                 |
| DELETE | `/api/addresses/:id`              | user   | Delete an address                  |
| POST   | `/api/orders/:reference/cancel`   | user   | Cancel (restocks items)            |
| GET    | `/api/mukhiya/stats`              | admin  | Dashboard aggregates               |
| GET    | `/api/mukhiya/categories`         | admin  | Categories for the product form     |
| GET    | `/api/mukhiya/config`             | admin  | Storefront URL for cross-links      |
| GET    | `/api/mukhiya/products`           | admin  | Catalogue for admin                |
| POST   | `/api/mukhiya/products`           | admin  | Create a product                   |
| PATCH  | `/api/mukhiya/products/:id`       | admin  | Update a product                   |
| POST   | `/api/mukhiya/products/:id/images`| admin  | Upload a product photo             |
| DELETE | `/api/mukhiya/products/:id`       | admin  | Archive a product                  |
| GET    | `/api/mukhiya/orders`             | admin  | All orders                         |
| PATCH  | `/api/mukhiya/orders/:ref/status` | admin  | Move an order through the pipeline |

Demo coupons: `WELCOME10` (10% off, min ₹999) and `FLAT250` (₹250 off, min ₹1,999).

---

## Payments

`server/services/payment.js` is a **deterministic mock gateway** so the full checkout works
without live keys: UPI and card succeed, COD stays `pending` until delivery, and a UPI handle
starting with `fail_` is declined so you can exercise the error path.

To go live, replace `charge()` and `refund()` with Razorpay/Stripe calls. The rest of the
application depends only on the returned `{ ok, status, gatewayRef }` shape.

---

## Going to production

1. Set `NODE_ENV=production` and a strong `JWT_SECRET` (the server refuses to boot without it).
   Put the admin panel on an internal hostname or VPN — its port should not be publicly routable,
   and set `ADMIN_PUBLIC_URL` so the storefront redirect points at the right place.
2. Terminate TLS in front of the app — the auth cookie switches to `Secure` automatically.
3. Point `DB_FILE` at a persistent volume, and back it up.
4. Replace the demo photography. `public/uploads/demo/` holds procedurally generated
   studio mockups (see `scripts/generate_demo_images.py`) so the image pipeline is exercised
   end to end; upload real photos per product from the admin API or drop files into
   `public/uploads/`. Products fall back to generated gradient artwork when they have no image.
5. Swap the mock gateway for your payment provider and wire webhooks for payment status.

A `Dockerfile` is included:

```bash
docker build -t shopfront .
docker run -p 4000:4000 -e JWT_SECRET=change-me -v shopfront-data:/app/data shopfront
```

---

## Licence

GPL-3.0 — see [`LICENSE`](LICENSE).
