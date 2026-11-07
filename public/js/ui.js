import { api, ApiError } from './api.js';
import { store } from './store.js';

/* ---------- formatting ---------- */
export const money = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((paise || 0) / 100);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export const debounce = (fn, wait = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

/* ---------- product artwork ---------- */
/** Deterministic abstract artwork so every product has a distinct visual without stock photos. */
export function productArt(product, { className = 'art', label = false } = {}) {
  const [g1, g2] = product.gradient || ['#EDEBFF', '#D6CDFF'];
  const seed = (product.id || 1) % 5;
  const shapes = [
    '<circle cx="86" cy="34" r="40" fill="rgba(255,255,255,.55)"/><circle cx="30" cy="96" r="26" fill="rgba(255,255,255,.35)"/>',
    '<rect x="18" y="40" width="64" height="64" rx="20" fill="rgba(255,255,255,.5)"/><circle cx="112" cy="94" r="22" fill="rgba(255,255,255,.35)"/>',
    '<circle cx="60" cy="60" r="46" fill="rgba(255,255,255,.42)"/><circle cx="104" cy="30" r="18" fill="rgba(255,255,255,.6)"/>',
    '<path d="M0 96 Q40 48 80 96 T160 96 V120 H0Z" fill="rgba(255,255,255,.45)"/><circle cx="120" cy="40" r="26" fill="rgba(255,255,255,.4)"/>',
    '<rect x="40" y="14" width="80" height="92" rx="40" fill="rgba(255,255,255,.42)"/><circle cx="36" cy="34" r="14" fill="rgba(255,255,255,.6)"/>',
  ];
  const initials = label ? `<text x="50%" y="58%" text-anchor="middle" font-family="Inter, sans-serif" font-size="34" font-weight="700" fill="rgba(18,18,26,.28)">${esc(product.title?.[0] || 'S')}</text>` : '';
  return `<div class="${className}" style="--g1:${esc(g1)};--g2:${esc(g2)}">
    <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true">${shapes[seed]}${initials}</svg>
  </div>`;
}

/* ---------- product card ---------- */
export function productCard(p) {
  return `
    <article class="product-card">
      <a class="product-media" href="/product.html?slug=${encodeURIComponent(p.slug)}" aria-label="${esc(p.title)}">
        ${productArt(p)}
        ${p.badge ? `<span class="badge ${p.badge === 'New' ? 'badge-brand' : 'badge-accent'}">${esc(p.badge)}</span>` : ''}
        <button class="wish-btn" type="button" aria-label="Save ${esc(p.title)}" data-wish="${esc(p.slug)}">♡</button>
      </a>
      <div class="product-body">
        <a class="product-title" href="/product.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>
        <span class="product-meta">${esc(p.subtitle)}</span>
        <div class="price-row">
          <span class="price">${money(p.pricePaise)}</span>
          ${p.mrpPaise > p.pricePaise ? `<span class="price-strike">${money(p.mrpPaise)}</span><span class="price-off">${p.discountPercent}% off</span>` : ''}
        </div>
        <div class="rating"><span class="star">★</span> ${p.rating.toFixed(1)} <span class="muted">(${p.ratingCount})</span></div>
      </div>
    </article>`;
}

export function skeletonCards(count = 4) {
  return Array.from({ length: count }).map(() => `
    <div class="product-card">
      <div class="skeleton" style="aspect-ratio:4/3.2"></div>
      <div class="product-body">
        <div class="skeleton" style="height:16px;width:70%"></div>
        <div class="skeleton" style="height:12px;width:45%"></div>
        <div class="skeleton" style="height:16px;width:55%"></div>
      </div>
    </div>`).join('');
}

/* ---------- feedback ---------- */
let toastHost;
export function toast(message, type = '') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.setAttribute('role', 'status');
  node.textContent = message;
  toastHost.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 250);
  }, 3200);
}

export function handleError(err) {
  if (err instanceof ApiError && err.status === 401) {
    store.setUser(null);
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
    return;
  }
  toast(err.message || 'Something went wrong', 'error');
}

export const statusBadge = (status) => {
  const map = { delivered: 'success', paid: 'success', shipped: 'brand', packed: 'brand', placed: 'warning', processing: 'warning', pending: 'warning', cancelled: 'danger', failed: 'danger', refunded: 'danger' };
  return `<span class="badge badge-${map[status] || 'brand'}">${esc(status)}</span>`;
};

/* ---------- icons ---------- */
const ICONS = {
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
};

export function icon(name, size = 40) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
}

/* ---------- chrome ---------- */
const NAV = [
  ['Men', '/products.html?category=apparel'],
  ['Women', '/products.html?category=beauty'],
  ['Footwear', '/products.html?category=footwear'],
  ['Home', '/products.html?category=home'],
  ['Tech', '/products.html?category=tech'],
  ['Deals', '/products.html?sort=price_asc'],
];

export function mountChrome({ active = '' } = {}) {
  const announce = document.createElement('div');
  announce.className = 'announce';
  announce.textContent = 'Free delivery on orders over ₹499  ·  7-day easy returns  ·  UPI, cards & COD accepted';

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/"><span class="brand-mark">S</span>Shopfront</a>
      <nav class="main-nav" id="main-nav" aria-label="Primary">
        ${NAV.map(([label, href]) => `<a href="${href}"${label === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <form class="header-search" role="search" id="search-form">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="input" type="search" name="q" placeholder="Search for products, brands and more" aria-label="Search products">
      </form>
      <div class="header-actions">
        <a class="icon-btn" href="/orders.html" aria-label="Your orders" title="Your orders">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6"/></svg>
        </a>
        <a class="icon-btn" href="/cart.html" aria-label="Cart" title="Cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>
          <span class="cart-count hide" id="cart-count">0</span>
        </a>
        <a class="btn btn-primary btn-sm" href="/login.html" id="account-link">Sign in</a>
        <button class="icon-btn nav-toggle" type="button" aria-label="Menu" aria-expanded="false" id="nav-toggle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </div>`;

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="/" style="color:#fff"><span class="brand-mark">S</span>Shopfront</a>
          <p style="margin-top:12px;max-width:34ch;font-size:14px">Thoughtfully made goods, delivered across India. Free delivery over ₹499 and 7-day returns on everything.</p>
        </div>
        <div><h4>Shop</h4><a href="/products.html?sort=newest">New arrivals</a><a href="/products.html?category=footwear">Footwear</a><a href="/products.html?category=apparel">Apparel</a><a href="/products.html?category=home">Home</a></div>
        <div><h4>Help</h4><a href="/orders.html">Track order</a><a href="/orders.html">Returns</a><a href="/cart.html">Cart</a><a href="/login.html">Your account</a></div>
        <div><h4>Company</h4><a href="/">About</a><a href="/">Careers</a><a href="/">Privacy</a><a href="/">Terms</a></div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Shopfront Retail Pvt Ltd · Bengaluru, India</span>
        <span>UPI · Visa · Mastercard · RuPay · COD</span>
      </div>
    </div>`;

  document.body.prepend(header);
  document.body.prepend(announce);
  document.body.appendChild(footer);

  qs('#nav-toggle')?.addEventListener('click', (e) => {
    const nav = qs('#main-nav');
    const open = nav.classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  qs('#search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q').toString().trim();
    location.href = `/products.html${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });

  // header reacts to auth + cart state
  const render = () => {
    const count = qs('#cart-count');
    if (count) {
      count.textContent = String(store.cartCount);
      count.classList.toggle('hide', store.cartCount === 0);
    }
    const account = qs('#account-link');
    if (account) {
      if (store.user) {
        account.textContent = store.user.name.split(' ')[0];
        account.href = store.user.role === 'admin' ? '/mukhiya' : '/orders.html';
      } else {
        account.textContent = 'Sign in';
        account.href = '/login.html';
      }
    }
  };
  store.subscribe(render);
  render();

  return { render };
}

/** Boots shared state: current user + cart badge. Safe to call on every page. */
export async function boot() {
  const [me, cart] = await Promise.allSettled([api.me(), api.cart()]);
  store.setUser(me.status === 'fulfilled' ? me.value.user : null);
  store.setCartCount(cart.status === 'fulfilled' ? cart.value.summary.itemCount : 0);
  return store.user;
}
