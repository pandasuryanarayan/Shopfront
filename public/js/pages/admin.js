import { api } from '../api.js';
import { qs, qsa, esc, money, statusBadge, toast, handleError, icon, boot } from '../ui.js';
import { store } from '../store.js';

await boot();

const root = qs('#admin-root');
let view = 'overview';
let stats = null;
let storeUrl = '';   // set from /api/mukhiya/config so links cross to the shop origin

const monthLabel = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};

function shell(content) {
  root.innerHTML = `
    <aside class="admin-side">
      <a class="brand" href="/"><span class="brand-mark">S</span>Shopfront</a>
      <nav class="admin-nav">
        <span class="label">Menu</span>
        ${[['overview', 'Overview'], ['orders', 'Orders'], ['products', 'Products']].map(([key, label]) => `
          <a href="#${key}" class="${view === key ? 'is-active' : ''}" data-view="${key}">${label}</a>`).join('')}
        <span class="label">System</span>
        <a href="${esc(storeUrl || '/')}" target="_blank" rel="noopener">View store ↗</a>
        <a href="#" id="admin-logout">Sign out</a>
      </nav>
      <div style="margin-top:auto;padding:12px;border-radius:12px;background:rgba(255,255,255,.06)">
        <div style="font-size:14px;font-weight:600;color:#fff">${esc(store.user?.name || 'Admin')}</div>
        <div style="font-size:12px;color:var(--ink-500)">Store admin</div>
      </div>
    </aside>
    <div class="admin-main">
      <header class="admin-top">
        <div>
          <h1 class="h2">${view === 'overview' ? 'Overview' : view === 'orders' ? 'Orders' : 'Products'}</h1>
          <p class="tiny">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div class="row" style="gap:10px">
          <span class="badge badge-brand">Last 30 days</span>
          <a class="btn btn-secondary btn-sm" href="${esc(storeUrl || '/')}" target="_blank" rel="noopener">Open storefront</a>
        </div>
      </header>
      <div class="admin-content">${content}</div>
    </div>`;

  qsa('[data-view]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    view = el.dataset.view;
    render();
  }));
  qs('#admin-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api.logout();
    store.setUser(null);
    location.href = '/';
  });
}

function overviewView() {
  const k = stats.kpis;
  const max = Math.max(1, ...stats.byMonth.map((m) => m.revenue));
  return `
    <div class="kpi-grid">
      ${[
        ['Gross revenue', money(k.revenuePaise), 'badge-success', 'paid orders'],
        ['Orders', k.orders.toLocaleString('en-IN'), 'badge-brand', 'all time'],
        ['Avg. order value', money(k.avgOrderValuePaise), 'badge-accent', 'per order'],
        ['Customers', k.customers.toLocaleString('en-IN'), 'badge-success', `${k.products} live products`],
      ].map(([label, value, badge, sub]) => `
        <div class="kpi">
          <div class="row-between"><span class="tiny">${label}</span><span class="badge ${badge}">${sub}</span></div>
          <span class="value">${value}</span>
        </div>`).join('')}
    </div>

    <div class="admin-grid">
      <div class="card">
        <div class="row-between" style="margin-bottom:8px">
          <div><h2 class="h4">Revenue</h2><p class="tiny">Monthly, paid orders</p></div>
          <span class="badge badge-brand">${stats.byMonth.length} month${stats.byMonth.length === 1 ? '' : 's'}</span>
        </div>
        <div class="chart">
          ${stats.byMonth.map((m) => `
            <div class="chart-bar" title="${monthLabel(m.month)}: ${money(m.revenue)}">
              <div class="bar" style="height:${Math.max(6, Math.round((m.revenue / max) * 180))}px"></div>
              <small>${monthLabel(m.month)}</small>
            </div>`).join('')}
        </div>
      </div>

      <div class="card stack">
        <h2 class="h4">Top categories</h2>
        ${stats.topCategories.map((c) => {
          const maxRev = Math.max(1, ...stats.topCategories.map((x) => x.revenue));
          return `
            <div class="stack" style="gap:6px">
              <div class="row-between" style="font-size:14px"><strong>${esc(c.name)}</strong><span class="tiny">${money(c.revenue)}</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c.revenue / maxRev) * 100)}%"></div></div>
            </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <div class="row-between" style="padding:20px"><h2 class="h4">Recent orders</h2><span class="tiny">${stats.recentOrders.length} shown</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            ${stats.recentOrders.map((o) => `
              <tr>
                <td><strong style="color:var(--brand)">${esc(o.reference)}</strong></td>
                <td>${esc(o.address.fullName)}</td>
                <td class="muted">${new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                <td><strong>${money(o.totalPaise)}</strong></td>
                <td>${statusBadge(o.status)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${stats.lowStock.length ? `
    <div class="card stack">
      <h2 class="h4">Low stock alerts</h2>
      ${stats.lowStock.map((p) => `
        <div class="row-between" style="font-size:14px">
          <span>${esc(p.title)}</span>
          <span class="badge ${p.stock < 5 ? 'badge-danger' : 'badge-warning'}">${p.stock} left</span>
        </div>`).join('')}
    </div>` : ''}`;
}

async function ordersView() {
  const { orders } = await api.adminOrders();
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div class="row-between" style="padding:20px"><h2 class="h4">All orders</h2><span class="tiny">${orders.length} orders</span></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>
            ${orders.map((o) => `
              <tr>
                <td><strong style="color:var(--brand)">${esc(o.reference)}</strong></td>
                <td>${esc(o.customer.name)}<div class="tiny">${esc(o.customer.email)}</div></td>
                <td class="muted">${o.items.reduce((n, i) => n + i.qty, 0)}</td>
                <td><strong>${money(o.totalPaise)}</strong></td>
                <td>${statusBadge(o.paymentStatus)}<div class="tiny">${esc(o.paymentMethod.toUpperCase())}</div></td>
                <td>
                  <select class="select" style="height:36px;font-size:13px" data-order="${esc(o.reference)}">
                    ${['placed', 'packed', 'shipped', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function productsView() {
  const [{ products }, { categories }] = await Promise.all([api.adminProducts(), api.adminCategories()]);
  addProduct.categories = categories;
  return `
    <div class="card stack">
      <div class="row-between">
        <div>
          <h2 class="h4">Catalogue</h2>
          <p class="tiny">${products.length} products · changes appear in the shop immediately</p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-add-product>+ Add product</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th></th></tr></thead>
          <tbody>
            ${products.map((p) => `
              <tr>
                <td><strong>${esc(p.title)}</strong><div class="tiny">${esc(p.slug)}</div></td>
                <td class="muted">${esc(p.category.name)}</td>
                <td>${money(p.pricePaise)}</td>
                <td><span class="badge ${p.stock > 15 ? 'badge-success' : p.stock > 0 ? 'badge-warning' : 'badge-danger'}">${p.stock}</span></td>
                <td>★ ${p.rating.toFixed(1)} <span class="tiny">(${p.ratingCount})</span></td>
                <td>
                  <div class="row" style="gap:8px;justify-content:flex-end">
                    <a class="btn btn-secondary btn-sm" href="${esc(storeUrl)}/product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">View</a>
                    ${p.isActive ? `<button class="btn btn-secondary btn-sm" data-archive="${p.id}">Archive</button>` : '<span class="badge badge-danger">Archived</span>'}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function render() {
  if (view === 'overview') shell(overviewView());
  else if (view === 'orders') { shell('<div class="skeleton" style="height:320px"></div>'); shell(await ordersView()); }
  else { shell('<div class="skeleton" style="height:320px"></div>'); shell(await productsView()); }

  qsa('[data-order]').forEach((sel) => sel.addEventListener('change', async () => {
    try {
      await api.adminSetOrderStatus(sel.dataset.order, sel.value);
      toast(`${sel.dataset.order} → ${sel.value}`, 'success');
      stats = await api.adminStats();
    } catch (err) { handleError(err); }
  }));

  qsa('[data-add-product]').forEach((btn) => btn.addEventListener('click', () => openProductModal()));

  qsa('[data-archive]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Archive this product? It will disappear from the storefront.')) return;
    try {
      await api.adminArchiveProduct(btn.dataset.archive);
      toast('Product archived', 'success');
      render();
    } catch (err) { handleError(err); }
  }));
}

/* ---------- add product ---------- */
const addProduct = { categories: [] };

const PALETTE = [
  ['#EDEBFF', '#D6CDFF'],
  ['#FFF1E8', '#FFD8C2'],
  ['#E8F5EF', '#C6E8D8'],
  ['#EAF0FF', '#CFDDFF'],
  ['#FDECF3', '#F8CEDF'],
  ['#EEF1F5', '#D8DFE8'],
];

function openProductModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <div>
          <h2 class="h3" id="modal-title">Add a product</h2>
          <p class="tiny">It goes live in the shop as soon as you save.</p>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Close">✕</button>
      </div>
      <form class="stack" id="product-form" novalidate>
        <div class="field">
          <label for="p-title">Product name</label>
          <input class="input" id="p-title" name="title" placeholder="Alpine Fleece Jacket" required>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="p-subtitle">Short label</label>
            <input class="input" id="p-subtitle" name="subtitle" placeholder="Apparel · Unisex">
          </div>
          <div class="field">
            <label for="p-category">Category</label>
            <select class="select" id="p-category" name="categoryId" required>
              ${addProduct.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="p-price">Selling price (₹)</label>
            <input class="input" id="p-price" name="price" type="number" min="1" step="1" placeholder="2499" required>
          </div>
          <div class="field">
            <label for="p-mrp">MRP (₹)</label>
            <input class="input" id="p-mrp" name="mrp" type="number" min="1" step="1" placeholder="3499" required>
          </div>
          <div class="field">
            <label for="p-stock">Stock</label>
            <input class="input" id="p-stock" name="stock" type="number" min="0" step="1" placeholder="25" required>
          </div>
          <div class="field">
            <label for="p-badge">Badge</label>
            <select class="select" id="p-badge" name="badge">
              <option value="">None</option>
              <option value="New">New</option>
              <option value="Bestseller">Bestseller</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="p-description">Description</label>
          <textarea class="textarea" id="p-description" name="description" placeholder="What makes it worth buying?"></textarea>
        </div>
        <div class="field">
          <label>Card colour</label>
          <div class="swatches" id="p-swatches">
            ${PALETTE.map(([a, b], i) => `
              <button class="swatch" type="button" data-swatch="${i}" aria-pressed="${i === 0}"
                      style="background:linear-gradient(135deg,${a},${b})" aria-label="Colour ${i + 1}"></button>`).join('')}
          </div>
        </div>
        <div class="alert alert-error hide" id="p-error"></div>
        <div class="row" style="justify-content:flex-end;gap:10px">
          <button class="btn btn-secondary" type="button" data-close>Cancel</button>
          <button class="btn btn-primary" type="submit" id="p-submit">Save product</button>
        </div>
      </form>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  let swatch = 0;
  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });

  qsa('[data-swatch]').forEach((el) => el.addEventListener('click', () => {
    swatch = Number(el.dataset.swatch);
    qsa('[data-swatch]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  }));

  qs('#p-category').addEventListener('change', () => {
    const cat = addProduct.categories.find((c) => String(c.id) === qs('#p-category').value);
    if (cat && !qs('#p-subtitle').value) qs('#p-subtitle').value = `${cat.name} · Unisex`;
  });

  qs('#product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = qs('#p-error');
    const submit = qs('#p-submit');
    errorBox.classList.add('hide');

    const form = new FormData(event.currentTarget);
    const price = Number(form.get('price'));
    const mrp = Number(form.get('mrp'));

    if (mrp < price) {
      errorBox.textContent = 'MRP cannot be lower than the selling price.';
      errorBox.classList.remove('hide');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Saving…';

    try {
      const { product } = await api.adminCreateProduct({
        title: form.get('title').trim(),
        subtitle: form.get('subtitle').trim(),
        description: form.get('description').trim(),
        categoryId: Number(form.get('categoryId')),
        pricePaise: Math.round(price * 100),
        mrpPaise: Math.round(mrp * 100),
        stock: Number(form.get('stock')),
        badge: form.get('badge') || null,
        gradientFrom: PALETTE[swatch][0],
        gradientTo: PALETTE[swatch][1],
      });
      close();
      toast(`${product.title} is live in the shop`, 'success');
      stats = await api.adminStats();
      view = 'products';
      render();
    } catch (err) {
      errorBox.textContent = err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message;
      errorBox.classList.remove('hide');
      submit.disabled = false;
      submit.textContent = 'Save product';
    }
  });

  // Typing into a pre-filled number field silently appends digits; select it instead.
  qsa('#product-form input[type=number]').forEach((el) => el.addEventListener('focus', () => el.select()));

  setTimeout(() => qs('#p-title')?.focus(), 50);
}

async function init() {
  try {
    const me = await api.me();
    store.setUser(me.user);
  } catch {
    location.href = `/login.html?next=${encodeURIComponent('/mukhiya')}`;
    return;
  }
  if (store.user.role !== 'admin') {
    root.classList.remove('admin-shell');
    root.innerHTML = `<div class="empty-state" style="min-height:100vh"><div class="icon" style="opacity:.35">${icon('lock', 44)}</div>
      <h1 class="h2">Admin access only</h1>
      <p class="muted">Sign in with an administrator account to open the dashboard.</p>
      <a class="btn btn-primary" href="/login.html">Sign in</a></div>`;
    return;
  }
  try {
    const [config, statsData] = await Promise.all([api.adminConfig(), api.adminStats()]);
    storeUrl = config.storeUrl;
    stats = statsData;
    render();
  } catch (err) {
    handleError(err);
  }
}

init();
