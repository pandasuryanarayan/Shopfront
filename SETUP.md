# Setup guide — run your own shop

This guide is for someone who wants to run their own copy of this shop without
editing any code. You will clone the project, run one command, set a few values,
and deploy it to a host of your choice.

Nothing here is tied to a particular hosting company. Any host that can run a
Node.js app — or a host that offers serverless functions plus static files —
will work.

---

## What you are deploying

One application that serves two things:

| Surface | What it is | Where it lives |
| --- | --- | --- |
| **Shop** | The customer-facing storefront | `/` |
| **Admin panel** | Manage products, orders, customers, settings | `/mukhiya` |
| **API** | Everything both surfaces call | `/api/...` |

The shop and the admin share one database, so a product you add in the panel
appears in the shop immediately.

---

## Step 1 — Get your own copy

Fork this repository on GitHub (the **Fork** button, top right), then clone your
fork:

```bash
git clone https://github.com/YOUR-USERNAME/Shopfront.git
cd Shopfront
```

## Step 2 — One command

```bash
npm install
npm run setup
```

`npm run setup` creates your `.env` file with a freshly generated secret, builds
the database, and adds a demo catalogue so the shop is not empty. It never
overwrites a `.env` you already have, so it is safe to run again.

## Step 3 — Make it yours

Open `.env` and change these. Every one of them is optional except `JWT_SECRET`.

| Setting | What it does | Example |
| --- | --- | --- |
| `JWT_SECRET` | Signs login sessions. **Must** be long and random. | `npm run setup` generates one |
| `SHOP_NAME` | Your shop's name, used in the header, footer and page titles | `Kolkata Bazaar` |
| `CURRENCY` | Currency code for prices | `INR`, `USD`, `EUR` |
| `SUPPORT_EMAIL` | Where customers write for help | `help@yourshop.com` |
| `TAX_PERCENT` | Tax added at checkout | `18` |
| `FREE_DELIVERY_THRESHOLD` | Free delivery above this amount, in **paise/cents** | `49900` = ₹499 |
| `DELIVERY_FEE` | Delivery charge below that amount, in **paise/cents** | `4900` = ₹49 |
| `PORT` | Shop port | `4000` |
| `ADMIN_PORT` | Admin panel port (set to `0` to turn it off) | `4001` |

These values only seed a **new** database. Once your shop is running you can
change the name, currency, tax and delivery rules from the admin panel under
**Settings** — no redeploy needed.

## Step 4 — Run it locally

```bash
npm start
```

- Shop: <http://localhost:4000>
- Admin: <http://localhost:4001/mukhiya>

Demo logins (change these before you go live):

| Role | Email | Password |
| --- | --- | --- |
| Customer | `demo@shopfront.in` | `Demo@1234` |
| Admin | `admin@shopfront.in` | `Admin@1234` |

---

## Step 5 — Deploy

Pick whichever of these matches your host. Both are provider-agnostic.

### Option A — a host that runs Node.js

Any host offering a Node application (a VPS, a container host, a platform that
runs a `start` command) works with no changes.

1. Push your fork to GitHub.
2. Create a new app on your host and point it at your repository.
3. Build command: `npm install && npm run setup`
4. Start command: `npm start`
5. Add your settings from Step 3 as **environment variables** in the host's
   dashboard (not in a file — that keeps secrets out of git).
6. Attach your domain.

### Option B — a static host with serverless functions

The frontend is plain HTML/CSS/JS, so it can sit on a CDN, with the API running
as a single serverless function. `netlify.toml` is included as a working
example; the same shape works on any platform that supports a publish directory
plus functions.

1. Create a new site from your fork.
2. Publish directory: `public`
3. Build command: `npm run build` (there is no build step; this prints a notice)
4. Add the same environment variables as above.
5. The database and uploaded photos are stored in the platform's blob/object
   storage automatically.

> On serverless hosting the database is a single file in object storage. That is
> fine for a demo or a small shop, but two orders placed at the same instant can
> overwrite each other. For a busy shop, use Option A with a real database.

### Two domains

You can serve the shop and the admin panel on separate domains:

- `yourshop.com` → the shop
- `admin.yourshop.com` → the admin panel

Deploy the same code twice, once per domain, and set `ADMIN_PUBLIC_URL` on the
shop deployment to your admin URL. Both deployments must point at the **same**
database, or the admin will not see the shop's orders.

If that sounds like more than you need, keep one deployment and use
`yourshop.com/mukhiya` for the admin panel.

---

## Before you take real orders

1. **Change the demo passwords** — the admin account shipped with `Admin@1234`.
2. **Set a real `JWT_SECRET`** and keep it out of git.
3. **Replace the demo products** in the admin panel.
4. **Turn on two-factor** for your admin account (Admin → Staff & security).
5. **Swap the demo photos** for your own — upload them from the product editor.

---

## If something goes wrong

| Symptom | Likely cause |
| --- | --- |
| Shop loads but no products | The API is not running, or `DATABASE_URL`/`DB_FILE` points somewhere empty. Run `npm run setup`. |
| "JWT_SECRET must be set in production" on start | You are in production mode without a secret. Add `JWT_SECRET` to your environment. |
| Admin page shows "Admin access only" | You are signed in as a customer. Sign in with an admin account. |
| Changes to `.env` do nothing | Environment variables set on your host override the file. Check the host's dashboard. |
