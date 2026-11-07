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
  const media = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async">`
    : productArt(p);
  return `
    <article class="product-card">
      <a class="product-media" href="/product.html?slug=${encodeURIComponent(p.slug)}" aria-label="${esc(p.title)}">
        ${media}
        ${p.badge ? `<span class="badge ${p.badge === 'New' ? 'badge-brand' : 'badge-accent'}">${esc(p.badge)}</span>` : ''}
        <button class="wish-btn${isSaved(p.id) ? ' is-saved' : ''}" type="button" aria-label="Save ${esc(p.title)}"
                aria-pressed="${isSaved(p.id)}" data-wish-id="${p.id}">${isSaved(p.id) ? '♥' : '♡'}</button>
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

/* ---------- wishlist ---------- */
const savedIds = new Set();
export const isSaved = (id) => savedIds.has(Number(id));

export function refreshHearts() {
  document.querySelectorAll('.wish-btn[data-wish-id]').forEach((btn) => {
    const on = isSaved(btn.dataset.wishId);
    // Only touch nodes that are actually out of date: this runs from a
    // MutationObserver, so writing unconditionally would re-trigger itself.
    if (btn.classList.contains('is-saved') === on) return;
    btn.classList.toggle('is-saved', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '♥' : '♡';
  });
}

export async function syncWishlist() {
  try {
    const { productIds } = await api.wishlistIds();
    savedIds.clear();
    productIds.forEach((id) => savedIds.add(Number(id)));
  } catch {
    savedIds.clear();
  }
  refreshHearts();
  return savedIds.size;
}

export async function toggleWishlist(productId) {
  const id = Number(productId);
  if (savedIds.has(id)) {
    await api.removeFromWishlist(id);
    savedIds.delete(id);
    toast('Removed from your wishlist');
  } else {
    await api.addToWishlist(id);
    savedIds.add(id);
    toast('Saved to your wishlist', 'success');
  }
  refreshHearts();
  document.dispatchEvent(new CustomEvent('wishlist:change', { detail: savedIds.size }));
  return savedIds.has(id);
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
  heart: '<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/>',
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

export function mountChrome({ active = '', storeUrl = '' } = {}) {
  // When the admin panel mounts this header, shop links must cross to the
  // storefront origin instead of pointing at pages that do not exist there.
  const base = String(storeUrl || '').replace(/\/+$/, '');
  const shop = (path) => `${base}${path}`;
  const announce = document.createElement('div');
  announce.className = 'announce';
  announce.textContent = 'Free delivery on orders over ₹499  ·  7-day easy returns  ·  UPI, cards & COD accepted';

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="${shop('/')}"><span class="brand-mark">S</span>Shopfront</a>
      <nav class="main-nav" id="main-nav" aria-label="Primary">
        ${NAV.map(([label, link]) => `<a href="${shop(link)}"${label === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      <form class="header-search" role="search" id="search-form">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="input" type="search" name="q" placeholder="Search for products, brands and more" aria-label="Search products">
      </form>
      <div class="header-actions">
        <a class="icon-btn" href="${shop('/wishlist.html')}" aria-label="Wishlist" title="Wishlist">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>
          <span class="cart-count hide" id="wish-count">0</span>
        </a>
        <a class="icon-btn" href="${shop('/orders.html')}" aria-label="Your orders" title="Your orders">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6"/></svg>
        </a>
        <a class="icon-btn" href="${shop('/cart.html')}" aria-label="Cart" title="Cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>
          <span class="cart-count hide" id="cart-count">0</span>
        </a>
        <div class="account-wrap" id="account-wrap"></div>
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
          <a class="brand" href="${shop('/')}" style="color:#fff"><span class="brand-mark">S</span>Shopfront</a>
          <p style="margin-top:12px;max-width:34ch;font-size:14px">Thoughtfully made goods, delivered across India. Free delivery over ₹499 and 7-day returns on everything.</p>
        </div>
        <div><h4>Shop</h4><a href="${shop('/products.html?sort=newest')}">New arrivals</a><a href="${shop('/products.html?category=footwear')}">Footwear</a><a href="${shop('/products.html?category=apparel')}">Apparel</a><a href="${shop('/products.html?category=home')}">Home</a></div>
        <div><h4>Help</h4><a href="${shop('/orders.html')}">Track order</a><a href="${shop('/orders.html')}">Returns</a><a href="${shop('/cart.html')}">Cart</a><a href="/login.html">Your account</a></div>
        <div><h4>Company</h4><a href="${shop('/')}">About</a><a href="${shop('/')}">Careers</a><a href="${shop('/')}">Privacy</a><a href="${shop('/')}">Terms</a></div>
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

  // ---- search suggestions ----
  const searchInput = qs('#search-form input[name=q]');
  const searchBox = qs('#search-form');
  if (searchInput) {
    const panel = document.createElement('div');
    panel.className = 'search-suggestions';
    panel.hidden = true;
    searchBox.appendChild(panel);

    const close = () => { panel.hidden = true; };
    const run = debounce(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) return close();
      try {
        const { suggestions } = await api.searchSuggestions(q);
        if (!suggestions.length) return close();
        panel.innerHTML = suggestions.map((s) => `
          <a class="search-suggestion" href="${shop(`/product.html?slug=${encodeURIComponent(s.slug)}`)}">${esc(s.title)}</a>`).join('')
          + `<a class="search-suggestion see-all" href="${shop(`/products.html?q=${encodeURIComponent(q)}`)}">See all results for “${esc(q)}”</a>`;
        panel.hidden = false;
      } catch {
        close();
      }
    }, 220);

    searchInput.addEventListener('input', run);
    searchInput.addEventListener('focus', () => { if (searchInput.value.trim().length >= 2) run(); });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', (e) => { if (!searchBox.contains(e.target)) close(); });
  }

  qs('#search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q').toString().trim();
    location.href = shop(`/products.html${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  });

  // ---- account menu (sign in / account / sign out) ----
  let lastUserId = 'unset';

  const closeMenu = () => {
    const menu = qs('#account-menu');
    const toggle = qs('#account-toggle');
    if (menu && !menu.hidden) {
      menu.hidden = true;
      toggle?.setAttribute('aria-expanded', 'false');
    }
  };

  const signOut = async (button) => {
    button.disabled = true;
    button.textContent = 'Signing out…';
    try {
      await api.logout();
    } catch {
      /* the cookie is cleared client-side either way */
    }
    store.setUser(null);
    store.setCartCount(0);
    store.setCoupon('');
    toast('You have been signed out');
    // Pages that require a session cannot stay open after signing out.
    if (['/orders.html', '/checkout.html', '/cart.html'].includes(location.pathname)) {
      location.href = '/';
    } else {
      location.reload();
    }
  };

  const renderAccount = () => {
    const wrap = qs('#account-wrap');
    if (!wrap) return;

    if (!store.user) {
      wrap.innerHTML = '<a class="btn btn-primary btn-sm" href="/login.html">Sign in</a>';
      return;
    }

    const initials = store.user.name
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    wrap.innerHTML = `
      <button class="account-btn" type="button" id="account-toggle" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu">
        <span class="avatar" aria-hidden="true">${esc(initials)}</span>
        <span class="account-name">${esc(store.user.name.split(' ')[0])}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        <span class="sr-only">Account menu</span>
      </button>
      <div class="account-menu" id="account-menu" role="menu" hidden>
        <div class="account-menu-head">
          <strong>${esc(store.user.name)}</strong>
          <span class="tiny">${esc(store.user.email)}</span>
        </div>
        <a class="account-menu-item" role="menuitem" href="${shop('/orders.html')}">Your orders</a>
        ${store.user.role === 'admin' ? '<a class="account-menu-item" role="menuitem" href="/mukhiya">Admin panel</a>' : ''}
        <button class="account-menu-item danger" role="menuitem" type="button" id="logout-btn">Sign out</button>
      </div>`;

    const toggle = qs('#account-toggle');
    const menu = qs('#account-menu');

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });

    qs('#logout-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      signOut(event.currentTarget);
    });
  };

  // header reacts to auth + cart state
  const render = () => {
    const count = qs('#cart-count');
    if (count) {
      count.textContent = String(store.cartCount);
      count.classList.toggle('hide', store.cartCount === 0);
    }
    const id = store.user ? store.user.id : null;
    if (id !== lastUserId) {
      lastUserId = id;
      renderAccount();
    }
  };

  document.addEventListener('click', async (event) => {
    const heart = event.target.closest('.wish-btn[data-wish-id]');
    if (!heart) return;
    event.preventDefault();
    if (!store.user) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return;
    }
    heart.disabled = true;
    try {
      await toggleWishlist(heart.dataset.wishId);
    } catch (err) {
      handleError(err);
    } finally {
      heart.disabled = false;
    }
  });

  document.addEventListener('wishlist:change', (e) => {
    const badge = qs('#wish-count');
    if (!badge) return;
    badge.textContent = String(e.detail);
    badge.classList.toggle('hide', e.detail === 0);
  });

  // Cards are rendered after boot on most pages; keep hearts in sync.
  let paintQueued = false;
  new MutationObserver(() => {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => { paintQueued = false; refreshHearts(); });
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  store.subscribe(render);
  render();

  return { render };
}

/** Boots shared state: current user + cart badge. Safe to call on every page. */
export async function boot() {
  const [me, cart] = await Promise.allSettled([api.me(), api.cart()]);
  store.setUser(me.status === 'fulfilled' ? me.value.user : null);
  store.setCartCount(cart.status === 'fulfilled' ? cart.value.summary.itemCount : 0);

  if (store.user) {
    const count = await syncWishlist();
    document.dispatchEvent(new CustomEvent('wishlist:change', { detail: count }));
  } else {
    savedIds.clear();
  }
  return store.user;
}
