import bcrypt from 'bcryptjs';
import { openDatabase } from './index.js';

const CATEGORIES = [
  ['Footwear', 'footwear'],
  ['Apparel', 'apparel'],
  ['Bags', 'bags'],
  ['Home', 'home'],
  ['Beauty', 'beauty'],
  ['Tech', 'tech'],
];

const FOOTWEAR_SIZES = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
const APPAREL_SIZES = ['S', 'M', 'L', 'XL'];

// [slug, title, subtitle, category, price, mrp, stock, rating, ratingCount, from, to, badge, description]
const PRODUCTS = [
  ['aero-runner-pro', 'Aero Runner Pro', 'Footwear · Unisex', 'footwear', 429900, 599900, 42, 4.6, 214, '#EDEBFF', '#D6CDFF', 'Bestseller',
    'A cushioned daily runner with a breathable knit upper and a responsive foam midsole. Built for 5K mornings and long city days alike.'],
  ['trail-grip-runner', 'Trail Grip Runner', 'Footwear · Men', 'footwear', 349900, 429900, 28, 4.3, 128, '#EAF0FF', '#CFDDFF', null,
    'Aggressive lugs, a rock plate and a water-repellent upper — for the days you take the long way home.'],
  ['court-low-sneaker', 'Court Low Sneaker', 'Footwear · Unisex', 'footwear', 289900, 349900, 55, 4.7, 402, '#FFF1E8', '#FFD8C2', 'New',
    'A clean court silhouette in full-grain leather with a gum rubber outsole. Goes with everything, quietly.'],
  ['everyday-slide-sandal', 'Everyday Slide Sandal', 'Footwear · Unisex', 'footwear', 99900, 129900, 90, 4.2, 76, '#E8F5EF', '#C6E8D8', null,
    'Contoured footbed, soft EVA strap, zero fuss. The one you keep by the door.'],
  ['linen-oversized-shirt', 'Linen Oversized Shirt', 'Apparel · Men', 'apparel', 179900, 249900, 36, 4.5, 312, '#EAF0FF', '#CFDDFF', 'Bestseller',
    'Washed European linen with a relaxed drop shoulder. Softens with every wear.'],
  ['cotton-crew-tee', 'Cotton Crew Tee', 'Apparel · Unisex', 'apparel', 69900, 99900, 120, 4.4, 890, '#F5F5FA', '#E4E4F0', null,
    'Heavyweight combed cotton, 220 GSM, pre-shrunk. The tee that survives the wash cycle.'],
  ['merino-crew-sweater', 'Merino Crew Sweater', 'Apparel · Women', 'apparel', 349900, 449900, 22, 4.8, 143, '#FDECF3', '#F8CEDF', null,
    'Fine-gauge extra-fine merino. Warm without weight, and it never itches.'],
  ['relaxed-chino-trousers', 'Relaxed Chino Trousers', 'Apparel · Men', 'apparel', 219900, 299900, 40, 4.3, 208, '#EEF1F5', '#D8DFE8', null,
    'Mid-rise, straight leg, garment-dyed cotton twill with a hint of stretch.'],
  ['everyday-canvas-tote', 'Everyday Canvas Tote', 'Bags · Women', 'bags', 129900, 189900, 64, 4.4, 89, '#FFF1E8', '#FFD8C2', null,
    '16 oz canvas, reinforced base, internal zip pocket. Holds a laptop and a week of groceries.'],
  ['commuter-backpack-22l', 'Commuter Backpack 22L', 'Bags · Unisex', 'bags', 289900, 349900, 33, 4.6, 167, '#EEF1F5', '#D8DFE8', 'Bestseller',
    'Padded 16-inch laptop sleeve, water-resistant shell, and a luggage pass-through for travel days.'],
  ['leather-card-holder', 'Leather Card Holder', 'Bags · Unisex', 'bags', 89900, 119900, 80, 4.5, 54, '#F5EFE6', '#E6D8C6', null,
    'Full-grain vegetable-tanned leather with six card slots. Ages beautifully.'],
  ['weekender-duffel', 'Weekender Duffel', 'Bags · Unisex', 'bags', 459900, 599900, 18, 4.7, 38, '#EDEBFF', '#D6CDFF', null,
    'Cabin-friendly 40L duffel in waxed canvas with a leather base. Two nights, one bag.'],
  ['ceramic-pour-over-set', 'Ceramic Pour-Over Set', 'Home · Kitchen', 'home', 215000, 265000, 26, 4.8, 56, '#E8F5EF', '#C6E8D8', null,
    'Stoneware dripper and 600 ml carafe, glazed by hand in matte white. Brews two cups.'],
  ['stoneware-dinner-plates', 'Stoneware Dinner Plates', 'Home · Kitchen', 'home', 189900, 239900, 44, 4.5, 71, '#F5F5FA', '#E4E4F0', null,
    'Set of four reactive-glaze plates. Each one is a little different, which is the point.'],
  ['cotton-throw-blanket', 'Cotton Throw Blanket', 'Home · Living', 'home', 249900, 329900, 30, 4.6, 47, '#FFF1E8', '#FFD8C2', null,
    'Handloom cotton with a fringed edge, 130 × 180 cm. Light enough for Chennai evenings.'],
  ['brass-table-lamp', 'Brass Table Lamp', 'Home · Lighting', 'home', 379900, 479900, 12, 4.7, 29, '#FDF1E1', '#F0DCBE', 'New',
    'Solid brass base, linen shade, warm 2700K bulb included. Dimmable.'],
  ['vitamin-c-serum', 'Vitamin C Serum', 'Beauty · Skincare', 'beauty', 89900, 119900, 75, 4.5, 623, '#FFF1E8', '#FFD8C2', 'Bestseller',
    '10% stabilised ethyl ascorbic acid with hyaluronic acid. Brightens without the sting.'],
  ['rose-face-mist', 'Rose Face Mist', 'Beauty · Skincare', 'beauty', 54900, 69900, 88, 4.3, 240, '#FDECF3', '#F8CEDF', null,
    'Steam-distilled rose water with glycerin. A two-second reset, any time of day.'],
  ['shea-body-butter', 'Shea Body Butter', 'Beauty · Body', 'beauty', 64900, 84900, 66, 4.6, 188, '#F5EFE6', '#E6D8C6', null,
    'Unrefined shea with cold-pressed jojoba. Rich, fast-absorbing, fragrance-free.'],
  ['charcoal-face-wash', 'Charcoal Face Wash', 'Beauty · Skincare', 'beauty', 39900, 49900, 95, 4.2, 412, '#EEF1F5', '#D8DFE8', null,
    'Activated charcoal and salicylic acid gel cleanser for oily, congested skin.'],
  ['wireless-earbuds-air', 'Wireless Earbuds Air', 'Tech · Audio', 'tech', 299900, 499900, 48, 4.4, 1204, '#EDEBFF', '#D6CDFF', 'Bestseller',
    '28-hour battery with the case, hybrid ANC, and USB-C fast charge. Pairs in one tap.'],
  ['65w-gan-charger', '65W GaN Charger', 'Tech · Power', 'tech', 179900, 229900, 70, 4.6, 388, '#F5F5FA', '#E4E4F0', null,
    'Three ports, 65W total, smaller than a matchbox. Charges a laptop and a phone together.'],
  ['braided-usb-c-cable', 'Braided USB-C Cable', 'Tech · Power', 'tech', 49900, 69900, 140, 4.3, 512, '#EEF1F5', '#D8DFE8', null,
    '1.5 m nylon-braided cable rated for 100W and 10,000 bends.'],
  ['bluetooth-speaker-mini', 'Bluetooth Speaker Mini', 'Tech · Audio', 'tech', 229900, 299900, 36, 4.5, 226, '#E8F5EF', '#C6E8D8', null,
    'IPX7, 14-hour battery, and a surprising amount of bass for something this size.'],
];

const REVIEWS = [
  [5, 'Genuinely the most comfortable pair I own. Wore them straight out of the box for a 12 km walk.'],
  [4, 'Great build quality. Runs half a size small, so size up.'],
  [5, 'Delivered in two days, packaging was excellent.'],
  [4, 'Good value for the price. Colour is slightly darker than the photos.'],
  [3, 'Decent, but I expected a softer fabric for this price.'],
];

export async function seed({ silent = false } = {}) {
  const db = await openDatabase();
  const log = (...args) => { if (!silent) console.log(...args); };

  db.transaction(() => {
    for (const table of ['reviews', 'order_items', 'orders', 'cart_items', 'product_sizes', 'products', 'categories', 'coupons', 'users']) {
      db.run(`DELETE FROM ${table}`);
    }
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('reviews','order_items','orders','cart_items','product_sizes','products','categories','users')");

    for (const [name, slug] of CATEGORIES) {
      db.run('INSERT INTO categories (name, slug, sort) VALUES (?,?,?)', [name, slug, CATEGORIES.findIndex((c) => c[1] === slug)]);
    }
    const catId = (slug) => db.get('SELECT id FROM categories WHERE slug = ?', [slug]).id;

    for (const p of PRODUCTS) {
      const [slug, title, subtitle, cat, price, mrp, stock, rating, ratingCount, from, to, badge, description] = p;
      const res = db.run(
        `INSERT INTO products (slug, title, subtitle, description, category_id, price_paise, mrp_paise, stock, rating, rating_count, gradient_from, gradient_to, badge)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [slug, title, subtitle, description, catId(cat), price, mrp, stock, rating, ratingCount, from, to, badge]
      );
      const id = res.lastInsertRowid;
      const sizes = cat === 'footwear' ? FOOTWEAR_SIZES : cat === 'apparel' ? APPAREL_SIZES : ['One size'];
      // The first size of multi-size products is intentionally out of stock so the
      // "sold out size" state is exercised by the demo data.
      sizes.forEach((sizeLabel, index) => {
        const sizeStock = sizes.length > 1 && index === 0 ? 0 : Math.max(2, Math.floor(stock / sizes.length));
        db.run('INSERT INTO product_sizes (product_id, label, stock) VALUES (?,?,?)', [id, sizeLabel, sizeStock]);
      });
    }

    db.run('INSERT INTO coupons (code, type, value, min_subtotal, max_discount) VALUES (?,?,?,?,?)', ['WELCOME10', 'percent', 10, 99900, 100000]);
    db.run('INSERT INTO coupons (code, type, value, min_subtotal, max_discount) VALUES (?,?,?,?,?)', ['FLAT250', 'flat', 25000, 199900, null]);

    const customer = bcrypt.hashSync('Demo@1234', 10);
    const admin = bcrypt.hashSync('Admin@1234', 10);
    const c = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', ['Suryanarayan Panda', 'demo@shopfront.in', customer, 'customer']);
    const a = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', ['Store Admin', 'admin@shopfront.in', admin, 'admin']);

    const products = db.all('SELECT id FROM products ORDER BY id');
    products.forEach((p, i) => {
      REVIEWS.forEach((r, j) => {
        if ((i + j) % 3 === 0) {
          db.run('INSERT OR IGNORE INTO reviews (product_id, user_id, rating, body) VALUES (?,?,?,?)', [p.id, j % 2 === 0 ? c.lastInsertRowid : a.lastInsertRowid, r[0], r[1]]);
        }
      });
    });

    // Extra customers + historical orders spread across the last 8 months so the
    // admin dashboard has a realistic revenue curve to render.
    const CUSTOMERS = [
      ['Ananya Rao', 'ananya@example.com'],
      ['Rahul Mehta', 'rahul@example.com'],
      ['Priya Nair', 'priya@example.com'],
      ['Karthik Iyer', 'karthik@example.com'],
    ];
    const customerIds = [c.lastInsertRowid];
    for (const [name, email] of CUSTOMERS) {
      const res = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', [name, email, customer, 'customer']);
      customerIds.push(res.lastInsertRowid);
    }

    const allProducts = db.all('SELECT * FROM products ORDER BY id');
    const STATUSES = ['delivered', 'delivered', 'shipped', 'packed', 'placed', 'cancelled'];
    let orderNo = 0;
    for (let monthsAgo = 7; monthsAgo >= 0; monthsAgo--) {
      const perMonth = 2 + ((monthsAgo * 3) % 4);
      for (let k = 0; k < perMonth; k++) {
        const buyer = customerIds[(monthsAgo + k) % customerIds.length];
        const picks = [allProducts[(orderNo * 3) % allProducts.length], allProducts[(orderNo * 7 + 4) % allProducts.length]];
        const subtotal = picks.reduce((sum, p) => sum + p.price_paise, 0);
        const discount = orderNo % 4 === 0 ? Math.round(subtotal * 0.1) : 0;
        const delivery = subtotal - discount >= 49900 ? 0 : 4900;
        const status = monthsAgo === 0 ? STATUSES[orderNo % 3] : 'delivered';
        const paymentStatus = status === 'cancelled' ? 'refunded' : 'paid';
        const daysAgo = monthsAgo * 30 + (k * 3) + 1;
        const ref = `SF-${10440 + orderNo}`;

        const ord = db.run(
          `INSERT INTO orders (reference, user_id, status, payment_method, payment_status, subtotal_paise, discount_paise, delivery_paise, total_paise, address_json, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`,
          [ref, buyer, status, orderNo % 3 === 0 ? 'cod' : 'upi', paymentStatus, subtotal, discount, delivery, subtotal - discount + delivery,
            JSON.stringify({ fullName: CUSTOMERS.find((_, i) => customerIds[i + 1] === buyer)?.[0] || 'Suryanarayan Panda', phone: '+91 98765 43210', line1: '42, 3rd Cross, Indiranagar', city: 'Bengaluru', state: 'Karnataka', pincode: '560038' }),
            `-${daysAgo} days`]
        );
        picks.forEach((p, idx) => {
          db.run('INSERT INTO order_items (order_id, product_id, title, size, unit_price_paise, qty) VALUES (?,?,?,?,?,?)',
            [ord.lastInsertRowid, p.id, p.title, idx === 0 ? 'One size' : 'UK 9', p.price_paise, 1 + (orderNo % 2)]);
        });
        orderNo++;
      }
    }

    log(`Seeded ${PRODUCTS.length} products, ${CATEGORIES.length} categories, 2 users.`);
  });

  db.flush();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then(() => {
    console.log('Seed complete.');
    process.exit(0);
  });
}
