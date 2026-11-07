import { api, uploadProductImage } from '../api.js';
import { qs, qsa, esc, money, statusBadge, toast, handleError, icon, debounce } from '../ui.js';
import { store } from '../store.js';

const root = qs('#admin-root');
const NAV = [
  ['overview', 'Overview', 'any'],
  ['orders', 'Orders', 'any'],
  ['products', 'Products', 'any'],
  ['customers', 'Customers', 'any'],
  ['coupons', 'Coupons', 'owner'],
  ['categories', 'Categories', 'owner'],
  ['settings', 'Settings', 'owner'],
  ['staff', 'Staff & security', 'owner'],
  ['audit', 'Audit log', 'any'],
];

let view = 'overview';
let storeUrl = '';
let stats = null;
let isOwner = false;
const state = {
  orders: { page: 1, q: '', status: '' },
  products: { page: 1, q: '', status: 'all', category: '' },
  customers: { page: 1, q: '' },
  audit: { page: 1, q: '' },
  days: 30,
};

const dayLabel = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};

/* ------------------------------------------------------------------ chrome */
function shell(content) {
  const allowed = NAV.filter(([, , scope]) => scope === 'any' || isOwner);
  root.innerHTML = `
    <aside class="admin-side">
      <a class="brand" href="${esc(storeUrl || '/')}"><span class="brand-mark">S</span>Shopfront</a>
      <nav class="admin-nav">
        <span class="label">Menu</span>
        ${allowed.slice(0, 4).map(([key, label]) => `
          <a href="#${key}" class="${view === key ? 'is-active' : ''}" data-view="${key}">${label}</a>`).join('')}
        ${allowed.length > 4 ? '<span class="label">Store setup</span>' : ''}
        ${allowed.slice(4).map(([key, label]) => `
          <a href="#${key}" class="${view === key ? 'is-active' : ''}" data-view="${key}">${label}</a>`).join('')}
        <span class="label">System</span>
        <a href="${esc(storeUrl || '/')}" target="_blank" rel="noopener">View store ↗</a>
        <a href="#" id="admin-logout">Sign out</a>
      </nav>
      <div style="margin-top:auto;padding:12px;border-radius:12px;background:rgba(255,255,255,.06)">
        <div style="font-size:14px;font-weight:600;color:#fff">${esc(store.user?.name || 'Admin')}</div>
        <div style="font-size:12px;color:var(--ink-500)">${esc(store.user?.role === 'admin' ? 'Owner' : 'Staff')}</div>
      </div>
    </aside>
    <div class="admin-main">
      <header class="admin-top">
        <div>
          <h1 class="h2">${NAV.find((n) => n[0] === view)?.[1] || 'Dashboard'}</h1>
          <p class="tiny">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div class="row" style="gap:10px">
          ${view === 'overview' ? `
            <select class="select" id="range" style="height:38px;width:auto" aria-label="Date range">
              ${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']]
                .map(([d, l]) => `<option value="${d}" ${state.days === d ? 'selected' : ''}>${l}</option>`).join('')}
            </select>` : ''}
          <a class="btn btn-secondary btn-sm" href="${esc(storeUrl || '/')}" target="_blank" rel="noopener">Open storefront</a>
        </div>
      </header>
      <div class="admin-content">${content}</div>
    </div>`;

  qsa('[data-view]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    view = el.dataset.view;
    if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
    render();
  }));
  qs('#admin-logout').addEventListener('click', async (e) => {
    e.preventDefault();
    await api.logout();
    store.setUser(null);
    location.href = '/';
  });
  qs('#range')?.addEventListener('change', async (e) => {
    state.days = Number(e.target.value);
    stats = await api.adminStats(state.days);
    render();
  });
}

const toolbar = (id, placeholder, filters = '') => `
  <div class="toolbar">
    <input class="input" id="${id}-q" placeholder="${placeholder}" value="${esc(state[id]?.q || '')}" aria-label="Search">
    ${filters}
  </div>`;

const pager = (id, meta) => {
  if (!meta || meta.totalPages <= 1) return `<p class="tiny" style="padding:12px 20px">${meta?.total ?? 0} result${meta?.total === 1 ? '' : 's'}</p>`;
  return `
    <div class="row-between" style="padding:12px 20px">
      <span class="tiny">Page ${meta.page} of ${meta.totalPages} · ${meta.total} total</span>
      <div class="pagination" style="margin:0">
        <button type="button" data-page-id="${id}" data-page="${meta.page - 1}" ${meta.page === 1 ? 'disabled' : ''}>‹</button>
        <button type="button" data-page-id="${id}" data-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? 'disabled' : ''}>›</button>
      </div>
    </div>`;
};

function wirePager() {
  qsa('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
    state[btn.dataset.pageId].page = Number(btn.dataset.page);
    render();
  }));
}

function wireSearch(id, extra = () => {}) {
  const input = qs(`#${id}-q`);
  if (!input) return;
  input.addEventListener('input', debounce(() => {
    state[id].q = input.value.trim();
    state[id].page = 1;
    render();
  }, 350));
  extra();
}

/* ---------------------------------------------------------------- overview */
function overviewView() {
  const k = stats.kpis;
  const max = Math.max(1, ...stats.byMonth.map((m) => m.revenue));
  return `
    <div class="kpi-grid">
      ${[
        ['Gross revenue', money(k.revenuePaise), 'badge-success', `${state.days} days`],
        ['Orders', k.orders.toLocaleString('en-IN'), 'badge-brand', 'placed'],
        ['Avg. order value', money(k.avgOrderValuePaise), 'badge-accent', 'per order'],
        ['Refunded', money(k.refundedPaise), 'badge-danger', 'in window'],
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
            <div class="chart-bar" title="${dayLabel(m.month)}: ${money(m.revenue)}">
              <div class="bar" style="height:${Math.max(6, Math.round((m.revenue / max) * 180))}px"></div>
              <small>${dayLabel(m.month)}</small>
            </div>`).join('')}
        </div>
      </div>

      <div class="card stack">
        <h2 class="h4">Top categories</h2>
        ${stats.topCategories.map((c) => {
          const maxRev = Math.max(1, ...stats.topCategories.map((x) => x.revenue));
          return `<div class="stack" style="gap:6px">
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
              <tr data-open-order="${esc(o.reference)}" style="cursor:pointer">
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
      <div class="row-between"><h2 class="h4">Low stock</h2><a class="link-arrow" href="#products" data-view="products">Manage →</a></div>
      ${stats.lowStock.map((p) => `
        <div class="row-between" style="font-size:14px">
          <span>${esc(p.title)}</span>
          <span class="badge ${p.stock < 5 ? 'badge-danger' : 'badge-warning'}">${p.stock} left</span>
        </div>`).join('')}
    </div>` : ''}`;
}

/* ------------------------------------------------------------------ orders */
async function ordersView() {
  const s = state.orders;
  const data = await api.adminOrders({ page: s.page, q: s.q, status: s.status, limit: 15 });
  return `
    <div class="card" style="padding:0;overflow:hidden">
      ${toolbar('orders', 'Search reference, customer or email…', `
        <select class="select" id="order-status" style="height:44px;width:auto">
          ${[['', 'All statuses'], ['placed', 'Placed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
            .map(([v, l]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`)}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${data.orders.map((o) => `
              <tr>
                <td><strong style="color:var(--brand)">${esc(o.reference)}</strong><div class="tiny">${new Date(o.createdAt).toLocaleDateString('en-IN')}</div></td>
                <td>${esc(o.customer.name)}<div class="tiny">${esc(o.customer.email)}</div></td>
                <td class="muted">${o.items.reduce((n, i) => n + i.qty, 0)}</td>
                <td><strong>${money(o.totalPaise)}</strong></td>
                <td>${statusBadge(o.paymentStatus)}<div class="tiny">${esc(o.paymentMethod.toUpperCase())}</div></td>
                <td>${statusBadge(o.status)}</td>
                <td><button class="btn btn-secondary btn-sm" data-open-order="${esc(o.reference)}">Open</button></td>
              </tr>`).join('') || '<tr><td colspan="7" class="muted" style="padding:24px">No orders match those filters.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pager('orders', data)}
    </div>`;
}

/* ---------------------------------------------------------------- products */
async function productsView() {
  const s = state.products;
  const [data, { categories }] = await Promise.all([
    api.adminProducts({ page: s.page, q: s.q, status: s.status, category: s.category, limit: 15 }),
    api.adminCategories(),
  ]);
  return `
    <div class="card" style="padding:0;overflow:hidden">
      ${toolbar('products', 'Search products…', `
        <select class="select" id="product-status" style="height:44px;width:auto">
          ${[['all', 'All'], ['active', 'Active'], ['archived', 'Archived'], ['low', 'Low stock']]
            .map(([v, l]) => `<option value="${v}" ${s.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="select" id="product-category" style="height:44px;width:auto">
          <option value="">All categories</option>
          ${categories.map((c) => `<option value="${c.slug}" ${s.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" type="button" data-add-product>+ Add product</button>
        <button class="btn btn-secondary btn-sm" type="button" id="export-csv">Export CSV</button>
        <button class="btn btn-secondary btn-sm" type="button" id="save-stock" disabled>Save stock</button>`)}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th></th></tr></thead>
          <tbody>
            ${data.products.map((p) => `
              <tr data-product-row="${p.id}">
                <td style="width:56px">${p.image ? `<img src="${esc(p.image)}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover">` : '<div class="art" style="width:44px;height:44px;border-radius:8px"></div>'}</td>
                <td><strong>${esc(p.title)}</strong><div class="tiny">${esc(p.slug)}</div></td>
                <td class="muted">${esc(p.category.name)}</td>
                <td>${money(p.pricePaise)}</td>
                <td><input class="input" type="number" min="0" value="${p.stock}" data-stock="${p.id}" style="width:88px;height:38px"></td>
                <td>★ ${p.rating.toFixed(1)}</td>
                <td>
                  <div class="row" style="gap:6px;justify-content:flex-end">
                    <button class="btn btn-secondary btn-sm" data-edit-product="${p.id}">Edit</button>
                    <a class="btn btn-secondary btn-sm" href="${esc(storeUrl)}/product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">View</a>
                    ${p.isActive
                      ? `<button class="btn btn-secondary btn-sm" data-archive="${p.id}">Archive</button>`
                      : `<button class="btn btn-secondary btn-sm" data-restore="${p.id}">Restore</button>`}
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="7" class="muted" style="padding:24px">No products match those filters.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pager('products', data)}
    </div>`;
}

/* --------------------------------------------------------------- customers */
async function customersView() {
  const s = state.customers;
  const data = await api.adminCustomers({ page: s.page, q: s.q, limit: 15 });
  return `
    <div class="card" style="padding:0;overflow:hidden">
      ${toolbar('customers', 'Search name or email…')}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Customer</th><th>Joined</th><th>Orders</th><th>Lifetime spend</th><th></th></tr></thead>
          <tbody>
            ${data.customers.map((c) => `
              <tr>
                <td><strong>${esc(c.name)}</strong><div class="tiny">${esc(c.email)}</div></td>
                <td class="muted">${new Date(c.joinedAt).toLocaleDateString('en-IN')}</td>
                <td>${c.orderCount}</td>
                <td><strong>${money(c.spendPaise)}</strong></td>
                <td><button class="btn btn-secondary btn-sm" data-open-customer="${c.id}">Open</button></td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:24px">No customers yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pager('customers', data)}
    </div>`;
}

/* ----------------------------------------------------------------- coupons */
async function couponsView() {
  const { coupons } = await api.adminCoupons();
  return `
    <div class="card stack">
      <div class="row-between">
        <div><h2 class="h4">Coupons</h2><p class="tiny">Percent or flat discounts, with a minimum order</p></div>
        <button class="btn btn-primary btn-sm" type="button" data-new-coupon>+ New coupon</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min order</th><th>Cap</th><th>Active</th><th></th></tr></thead>
          <tbody>
            ${coupons.map((c) => `
              <tr>
                <td><strong>${esc(c.code)}</strong></td>
                <td class="muted">${esc(c.type)}</td>
                <td>${c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
                <td>${c.minSubtotal ? money(c.minSubtotal) : '—'}</td>
                <td>${c.maxDiscount ? money(c.maxDiscount) : '—'}</td>
                <td>${c.active ? '<span class="badge badge-success">On</span>' : '<span class="badge badge-danger">Off</span>'}</td>
                <td>
                  <div class="row" style="gap:6px;justify-content:flex-end">
                    <button class="btn btn-secondary btn-sm" data-toggle-coupon="${esc(c.code)}" data-active="${c.active}">${c.active ? 'Disable' : 'Enable'}</button>
                    <button class="btn btn-secondary btn-sm" data-delete-coupon="${esc(c.code)}">Delete</button>
                  </div>
                </td>
              </tr>`).join('') || '<tr><td colspan="7" class="muted" style="padding:24px">No coupons yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* -------------------------------------------------------------- categories */
async function categoriesView() {
  const { categories } = await api.adminCategories();
  return `
    <div class="card stack">
      <div class="row-between">
        <div><h2 class="h4">Categories</h2><p class="tiny">Rename or add a category; the slug follows the name</p></div>
        <button class="btn btn-primary btn-sm" type="button" data-new-category>+ New category</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th></th></tr></thead>
          <tbody>
            ${categories.map((c) => `
              <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td class="muted">${esc(c.slug)}</td>
                <td>${c.count}</td>
                <td><button class="btn btn-secondary btn-sm" data-rename-category="${c.id}" data-name="${esc(c.name)}">Rename</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- settings */
async function settingsView() {
  const [{ settings }, twofa] = await Promise.all([api.adminSettings(), api.admin2fa()]);
  return `
    <div class="admin-grid">
      <form class="card stack" id="settings-form">
        <h2 class="h4">Store settings</h2>
        <div class="form-grid">
          <div class="field"><label for="s-name">Store name</label><input class="input" id="s-name" name="storeName" value="${esc(settings.storeName)}" required></div>
          <div class="field"><label for="s-email">Support email</label><input class="input" id="s-email" name="supportEmail" type="email" value="${esc(settings.supportEmail)}"></div>
          <div class="field"><label for="s-tax">Tax (%)</label><input class="input" id="s-tax" name="taxPercent" type="number" min="0" max="50" step="0.5" value="${settings.taxPercent}"></div>
          <div class="field"><label for="s-currency">Currency</label><input class="input" id="s-currency" name="currency" maxlength="3" value="${esc(settings.currency)}"></div>
          <div class="field"><label for="s-free">Free delivery over (₹)</label><input class="input" id="s-free" name="freeDeliveryThreshold" type="number" min="0" value="${settings.freeDeliveryThreshold / 100}"></div>
          <div class="field"><label for="s-fee">Delivery fee (₹)</label><input class="input" id="s-fee" name="deliveryFee" type="number" min="0" value="${settings.deliveryFee / 100}"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Save settings</button></div>
      </form>

      <div class="card stack">
        <h2 class="h4">Two-factor authentication</h2>
        <p class="tiny">${twofa.enabled
          ? 'Two-factor is on for your account. You will be asked for a code at sign-in.'
          : 'Add a 6-digit code from your authenticator app at sign-in.'}</p>
        <div id="twofa-box"></div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------- staff */
async function staffView() {
  const { staff } = await api.adminStaff();
  return `
    <div class="card stack">
      <div class="row-between">
        <div><h2 class="h4">Staff accounts</h2><p class="tiny">Staff can run orders and products; owners can also change money, coupons and settings</p></div>
        <button class="btn btn-primary btn-sm" type="button" data-new-staff>+ Add staff</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>2FA</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${staff.map((u) => `
              <tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td class="muted">${esc(u.email)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-brand' : 'badge-success'}">${esc(u.role)}</span></td>
                <td>${u.totp_enabled ? '<span class="badge badge-success">On</span>' : '<span class="badge badge-warning">Off</span>'}</td>
                <td>${u.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>'}</td>
                <td>
                  <div class="row" style="gap:6px;justify-content:flex-end">
                    ${u.role === 'staff'
                      ? `<button class="btn btn-secondary btn-sm" data-promote="${u.id}">Make owner</button>`
                      : u.id !== store.user.id ? `<button class="btn btn-secondary btn-sm" data-demote="${u.id}">Make staff</button>` : ''}
                    ${u.id !== store.user.id ? `<button class="btn btn-secondary btn-sm" data-toggle-staff="${u.id}" data-active="${u.is_active}">${u.is_active ? 'Disable' : 'Enable'}</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------- audit */
async function auditView() {
  const s = state.audit;
  const data = await api.adminAudit({ page: s.page, q: s.q, limit: 30 });
  return `
    <div class="card" style="padding:0;overflow:hidden">
      ${toolbar('audit', 'Search action, actor or entity…')}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            ${data.entries.map((e) => `
              <tr>
                <td class="muted">${new Date(`${e.createdAt.replace(' ', 'T')}Z`).toLocaleString('en-IN')}</td>
                <td><strong>${esc(e.action)}</strong></td>
                <td class="muted">${esc(e.actorEmail || '—')}</td>
                <td class="muted">${esc(e.entity || '—')}${e.entityId ? ` #${esc(e.entityId)}` : ''}</td>
                <td class="tiny">${e.meta ? esc(JSON.stringify(e.meta).slice(0, 80)) : '—'}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:24px">Nothing logged yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${pager('audit', data)}
    </div>`;
}

/* --------------------------------------------------------------- rendering */
async function render() {
  if (view === 'overview') return shell(overviewView());

  shell('<div class="skeleton" style="height:320px;border-radius:16px"></div>');
  const views = {
    orders: ordersView, products: productsView, customers: customersView,
    coupons: couponsView, categories: categoriesView, settings: settingsView,
    staff: staffView, audit: auditView,
  };
  shell(await views[view]());
  wireView();
}

function wireView() {
  wirePager();

  if (view === 'orders') {
    wireSearch('orders', () => {
      qs('#order-status')?.addEventListener('change', (e) => {
        state.orders.status = e.target.value;
        state.orders.page = 1;
        render();
      });
    });
  }

  if (view === 'products') {
    wireSearch('products', () => {
      qs('#product-status')?.addEventListener('change', (e) => { state.products.status = e.target.value; state.products.page = 1; render(); });
      qs('#product-category')?.addEventListener('change', (e) => { state.products.category = e.target.value; state.products.page = 1; render(); });
      qs('#export-csv')?.addEventListener('click', () => { location.href = '/api/mukhiya/products/export.csv'; });
    });
    qs('[data-add-product]')?.addEventListener('click', () => openProductModal());
    qsa('[data-edit-product]').forEach((b) => b.addEventListener('click', () => openProductModal(Number(b.dataset.editProduct))));
    qsa('[data-archive]').forEach((b) => b.addEventListener('click', () => archiveProduct(Number(b.dataset.archive))));
    qsa('[data-restore]').forEach((b) => b.addEventListener('click', () => restoreProduct(Number(b.dataset.restore))));
    wireBulkStock();
  }

  if (view === 'customers') wireSearch('customers');
  if (view === 'audit') wireSearch('audit');

  if (view === 'coupons') {
    qs('[data-new-coupon]')?.addEventListener('click', openCouponModal);
    qsa('[data-toggle-coupon]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api.adminUpdateCoupon(b.dataset.toggleCoupon, { active: b.dataset.active !== 'true' });
        render();
      } catch (err) { handleError(err); }
    }));
    qsa('[data-delete-coupon]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Delete coupon ${b.dataset.deleteCoupon}?`)) return;
      try { await api.adminDeleteCoupon(b.dataset.deleteCoupon); toast('Coupon deleted'); render(); } catch (err) { handleError(err); }
    }));
  }

  if (view === 'categories') {
    qs('[data-new-category]')?.addEventListener('click', async () => {
      const name = prompt('New category name');
      if (!name) return;
      try { await api.adminCreateCategory({ name }); toast('Category added', 'success'); render(); } catch (err) { handleError(err); }
    });
    qsa('[data-rename-category]').forEach((b) => b.addEventListener('click', async () => {
      const name = prompt('Rename category', b.dataset.name);
      if (!name || name === b.dataset.name) return;
      try { await api.adminUpdateCategory(b.dataset.renameCategory, { name }); toast('Category renamed', 'success'); render(); } catch (err) { handleError(err); }
    }));
  }

  if (view === 'settings') {
    qs('#settings-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      try {
        await api.adminSaveSettings({
          storeName: f.get('storeName'),
          supportEmail: f.get('supportEmail'),
          currency: f.get('currency'),
          taxPercent: Number(f.get('taxPercent')),
          freeDeliveryThreshold: Math.round(Number(f.get('freeDeliveryThreshold')) * 100),
          deliveryFee: Math.round(Number(f.get('deliveryFee')) * 100),
        });
        toast('Settings saved', 'success');
        render();
      } catch (err) { handleError(err); }
    });
    renderTwoFactor();
  }

  if (view === 'staff') {
    qs('[data-new-staff]')?.addEventListener('click', openStaffModal);
    qsa('[data-promote]').forEach((b) => b.addEventListener('click', () => changeRole(b.dataset.promote, 'admin')));
    qsa('[data-demote]').forEach((b) => b.addEventListener('click', () => changeRole(b.dataset.demote, 'staff')));
    qsa('[data-toggle-staff]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api.adminUpdateStaff(Number(b.dataset.toggleStaff), { isActive: b.dataset.active !== 'true' });
        toast('Updated'); render();
      } catch (err) { handleError(err); }
    }));
  }

  qsa('[data-open-order]').forEach((el) => el.addEventListener('click', () => openOrderDrawer(el.dataset.openOrder)));
  qsa('[data-open-customer]').forEach((el) => el.addEventListener('click', () => openCustomerDrawer(el.dataset.openCustomer)));
}

/* ------------------------------------------------------------ drawers/modal */
function drawer(html) {
  const el = document.createElement('div');
  el.className = 'drawer-backdrop';
  el.innerHTML = `<aside class="drawer" role="dialog" aria-modal="true">${html}</aside>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const close = () => { el.remove(); document.body.style.overflow = ''; };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
  return { el, close };
}

async function openOrderDrawer(reference) {
  const { order } = await api.adminOrder(reference);
  const { el, close } = drawer(`
    <div class="drawer-head">
      <div><h2 class="h3">${esc(order.reference)}</h2><p class="tiny">${new Date(order.createdAt).toLocaleString('en-IN')}</p></div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="drawer-body">
      <div class="row" style="gap:8px">${statusBadge(order.status)}${statusBadge(order.paymentStatus)}</div>

      <div class="stack" style="gap:10px">
        <h3 class="h4">Items</h3>
        ${order.items.map((i) => `
          <div class="row-between" style="font-size:14px">
            <span>${esc(i.title)} <span class="tiny">${esc(i.size)} · ×${i.qty}</span></span>
            <strong>${money(i.lineTotalPaise)}</strong>
          </div>`).join('')}
      </div>

      <div class="stack" style="gap:6px">
        <h3 class="h4">Deliver to</h3>
        <div style="font-size:14px" class="muted">
          ${esc(order.address.fullName)} · ${esc(order.address.phone)}<br>
          ${esc(order.address.line1)}${order.address.line2 ? `, ${esc(order.address.line2)}` : ''}<br>
          ${esc(order.address.city)}, ${esc(order.address.state)} ${esc(order.address.pincode)}
          ${order.guestEmail ? `<br>Guest: ${esc(order.guestEmail)}` : ''}
        </div>
      </div>

      <div class="stack" style="gap:6px">
        <h3 class="h4">Payment</h3>
        <div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotalPaise)}</strong></div>
        ${order.discountPaise ? `<div class="summary-line"><span>Discount</span><strong>− ${money(order.discountPaise)}</strong></div>` : ''}
        <div class="summary-line"><span>Delivery</span><strong>${order.deliveryPaise ? money(order.deliveryPaise) : 'Free'}</strong></div>
        <div class="summary-line"><span>Tax</span><strong>${money(order.taxPaise)}</strong></div>
        <div class="summary-line"><span class="summary-total">Total</span><span class="summary-total">${money(order.totalPaise)}</span></div>
      </div>

      ${order.returns?.length ? `
      <div class="stack" style="gap:6px">
        <h3 class="h4">Returns</h3>
        ${order.returns.map((r) => `<div class="row-between" style="font-size:14px"><span>${esc(r.reason)}</span>${statusBadge(r.status === 'requested' ? 'pending' : 'success')}</div>`).join('')}
      </div>` : ''}

      ${order.history?.length ? `
      <div class="stack" style="gap:6px">
        <h3 class="h4">History</h3>
        ${order.history.map((h) => `<div class="tiny">${new Date(`${h.created_at.replace(' ', 'T')}Z`).toLocaleString('en-IN')} · ${esc(h.action)} ${h.meta ? esc(h.meta) : ''}</div>`).join('')}
      </div>` : ''}
    </div>
    <div class="drawer-foot">
      <select class="select" id="d-status" style="height:42px;width:auto">
        ${['placed', 'packed', 'shipped', 'delivered', 'cancelled'].map((s) => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" type="button" id="d-save">Update status</button>
      ${isOwner && order.paymentStatus === 'paid' ? '<button class="btn btn-secondary btn-sm" type="button" id="d-refund">Refund</button>' : ''}
    </div>`);

  qs('#d-save', el).addEventListener('click', async () => {
    try {
      await api.adminSetOrderStatus(order.reference, qs('#d-status', el).value);
      toast('Status updated', 'success');
      close();
      render();
    } catch (err) { handleError(err); }
  });

  qs('#d-refund', el)?.addEventListener('click', async () => {
    if (!confirm(`Refund ${money(order.totalPaise)} for ${order.reference}? Stock will be returned.`)) return;
    try {
      await api.adminRefund(order.reference, {});
      toast('Refund issued', 'success');
      close();
      render();
    } catch (err) { handleError(err); }
  });
}

async function openCustomerDrawer(id) {
  const { customer } = await api.adminCustomer(id);
  const spend = customer.orders.reduce((s, o) => s + (o.paymentStatus === 'paid' ? o.totalPaise : 0), 0);
  const { el } = drawer(`
    <div class="drawer-head">
      <div><h2 class="h3">${esc(customer.name)}</h2><p class="tiny">${esc(customer.email)}</p></div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="drawer-body">
      <div class="row" style="gap:16px;font-size:14px">
        <div><span class="tiny">Orders</span><div><strong>${customer.orders.length}</strong></div></div>
        <div><span class="tiny">Lifetime spend</span><div><strong>${money(spend)}</strong></div></div>
        <div><span class="tiny">Joined</span><div><strong>${new Date(customer.joinedAt).toLocaleDateString('en-IN')}</strong></div></div>
      </div>
      <div class="stack" style="gap:10px">
        <h3 class="h4">Orders</h3>
        ${customer.orders.map((o) => `
          <button class="row-between" style="font-size:14px;text-align:left" data-open-order="${esc(o.reference)}">
            <span><strong style="color:var(--brand)">${esc(o.reference)}</strong> <span class="tiny">${new Date(o.createdAt).toLocaleDateString('en-IN')}</span></span>
            <span class="row" style="gap:8px">${statusBadge(o.status)}<strong>${money(o.totalPaise)}</strong></span>
          </button>`).join('') || '<p class="muted">No orders yet.</p>'}
      </div>
      <div class="stack" style="gap:6px">
        <h3 class="h4">Addresses</h3>
        ${customer.addresses.map((a) => `<div class="tiny">${esc(a.label)} · ${esc(a.line1)}, ${esc(a.city)} ${esc(a.pincode)}</div>`).join('') || '<p class="muted">None saved.</p>'}
      </div>
    </div>`);
  qsa('[data-open-order]', el).forEach((b) => b.addEventListener('click', () => openOrderDrawer(b.dataset.openOrder)));
}

/* ----------------------------------------------------------- product modal */
const PALETTE = [
  ['#EDEBFF', '#D6CDFF'], ['#FFF1E8', '#FFD8C2'], ['#E8F5EF', '#C6E8D8'],
  ['#EAF0FF', '#CFDDFF'], ['#FDECF3', '#F8CEDF'], ['#EEF1F5', '#D8DFE8'],
];

async function openProductModal(productId = null) {
  const { categories } = await api.adminCategories();
  const existing = productId ? (await api.adminProducts({ q: '', limit: 100 })).products.find((p) => p.id === productId) : null;
  const images = productId ? (await api.adminProductImages(productId)).images : [];

  const { el, close } = drawer(`
    <div class="drawer-head">
      <div><h2 class="h3">${existing ? 'Edit product' : 'Add a product'}</h2><p class="tiny">Changes appear in the shop immediately.</p></div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <form class="drawer-body" id="product-form" novalidate>
      <div class="field"><label for="p-title">Product name</label>
        <input class="input" id="p-title" name="title" value="${esc(existing?.title || '')}" required></div>
      <div class="form-grid">
        <div class="field"><label for="p-subtitle">Short label</label>
          <input class="input" id="p-subtitle" name="subtitle" value="${esc(existing?.subtitle || '')}" placeholder="Apparel · Unisex"></div>
        <div class="field"><label for="p-category">Category</label>
          <select class="select" id="p-category" name="categoryId">
            ${categories.map((c) => `<option value="${c.id}" ${existing?.category.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label for="p-price">Selling price (₹)</label>
          <input class="input" id="p-price" name="price" type="number" min="1" value="${existing ? existing.pricePaise / 100 : ''}" required></div>
        <div class="field"><label for="p-mrp">MRP (₹)</label>
          <input class="input" id="p-mrp" name="mrp" type="number" min="1" value="${existing ? existing.mrpPaise / 100 : ''}" required></div>
        <div class="field"><label for="p-stock">Stock</label>
          <input class="input" id="p-stock" name="stock" type="number" min="0" value="${existing ? existing.stock : ''}" placeholder="25" required></div>
        <div class="field"><label for="p-badge">Badge</label>
          <select class="select" id="p-badge" name="badge">
            ${['', 'New', 'Bestseller'].map((b) => `<option value="${b}" ${existing?.badge === b ? 'selected' : ''}>${b || 'None'}</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label for="p-description">Description</label>
        <textarea class="textarea" id="p-description" name="description">${esc(existing?.description || '')}</textarea></div>
      <div class="field"><label>Card colour</label>
        <div class="swatches" id="p-swatches">
          ${PALETTE.map(([a, b], i) => `<button class="swatch" type="button" data-swatch="${i}" aria-pressed="${i === 0}" style="background:linear-gradient(135deg,${a},${b})" aria-label="Colour ${i + 1}"></button>`).join('')}
        </div>
      </div>
      <div class="alert alert-error hide" id="p-error"></div>
      <div class="row" style="justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit">${existing ? 'Save changes' : 'Save product'}</button>
      </div>
    </form>

    ${existing ? `
    <div class="drawer-body" style="border-top:1px solid var(--border)">
      <h3 class="h4">Photos</h3>
      <div class="row wrap" style="gap:10px" id="p-images">
        ${images.map((img) => `
          <div style="position:relative">
            <img src="${esc(img.url)}" alt="" style="width:88px;height:88px;border-radius:10px;object-fit:cover">
            <button type="button" data-del-image="${img.id}" aria-label="Delete image"
              style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--danger);color:#fff;font-size:12px">✕</button>
          </div>`).join('') || '<p class="muted tiny">No photos yet — upload one below.</p>'}
      </div>
      <label class="btn btn-secondary btn-sm" style="width:max-content;cursor:pointer">
        Upload photo
        <input type="file" id="p-upload" accept="image/*" hidden>
      </label>
      <p class="tiny">JPEG, PNG, WebP or GIF up to 6 MB.</p>
    </div>` : ''}`);

  let swatch = 0;
  qsa('[data-swatch]', el).forEach((b) => b.addEventListener('click', () => {
    swatch = Number(b.dataset.swatch);
    qsa('[data-swatch]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  qsa('#product-form input[type=number]', el).forEach((i) => i.addEventListener('focus', () => i.select()));

  qs('#p-upload', el)?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadProductImage(productId, file);
      toast('Photo uploaded', 'success');
      close();
      openProductModal(productId);
    } catch (err) { handleError(err); }
  });

  qsa('[data-del-image]', el).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.adminDeleteImage(productId, Number(b.dataset.delImage));
      close();
      openProductModal(productId);
    } catch (err) { handleError(err); }
  }));

  qs('#product-form', el).addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = qs('#p-error', el);
    errorBox.classList.add('hide');
    const f = new FormData(event.currentTarget);
    const price = Number(f.get('price'));
    const mrp = Number(f.get('mrp'));
    if (mrp < price) {
      errorBox.textContent = 'MRP cannot be lower than the selling price.';
      errorBox.classList.remove('hide');
      return;
    }
    const payload = {
      title: f.get('title').trim(),
      subtitle: f.get('subtitle').trim(),
      description: f.get('description').trim(),
      categoryId: Number(f.get('categoryId')),
      pricePaise: Math.round(price * 100),
      mrpPaise: Math.round(mrp * 100),
      stock: Number(f.get('stock')),
      badge: f.get('badge') || null,
    };
    if (!existing) Object.assign(payload, { gradientFrom: PALETTE[swatch][0], gradientTo: PALETTE[swatch][1] });

    try {
      if (existing) {
        await api.adminUpdateProduct(productId, payload);
        toast('Product updated', 'success');
      } else {
        await api.adminCreateProduct(payload);
        toast('Product is live in the shop', 'success');
      }
      close();
      render();
    } catch (err) {
      errorBox.textContent = err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message;
      errorBox.classList.remove('hide');
    }
  });
}

function wireBulkStock() {
  const dirty = new Map();
  const save = qs('#save-stock');
  qsa('[data-stock]').forEach((input) => input.addEventListener('change', () => {
    dirty.set(Number(input.dataset.stock), Number(input.value));
    save.disabled = false;
    save.textContent = `Save stock (${dirty.size})`;
  }));
  save?.addEventListener('click', async () => {
    if (!dirty.size) return;
    try {
      await api.adminBulkStock([...dirty.entries()].map(([id, stock]) => ({ id, stock })));
      toast(`Updated ${dirty.size} product${dirty.size === 1 ? '' : 's'}`, 'success');
      dirty.clear();
      render();
    } catch (err) { handleError(err); }
  });
}

async function archiveProduct(id) {
  if (!confirm('Archive this product? It disappears from the shop but keeps its order history.')) return;
  try { await api.adminArchiveProduct(id); toast('Product archived'); render(); } catch (err) { handleError(err); }
}

async function restoreProduct(id) {
  try { await api.adminRestoreProduct(id); toast('Product restored', 'success'); render(); } catch (err) { handleError(err); }
}

/* ------------------------------------------------------- coupons / staff */
function openCouponModal() {
  const { el, close } = drawer(`
    <div class="drawer-head">
      <div><h2 class="h3">New coupon</h2><p class="tiny">Percent or flat, with a minimum order</p></div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <form class="drawer-body" id="coupon-form">
      <div class="field"><label for="c-code">Code</label><input class="input" id="c-code" name="code" placeholder="WINTER20" required></div>
      <div class="form-grid">
        <div class="field"><label for="c-type">Type</label>
          <select class="select" id="c-type" name="type"><option value="percent">Percent</option><option value="flat">Flat ₹</option></select></div>
        <div class="field"><label for="c-value">Value</label><input class="input" id="c-value" name="value" type="number" min="1" required></div>
        <div class="field"><label for="c-min">Min order (₹)</label><input class="input" id="c-min" name="minSubtotal" type="number" min="0" value="0"></div>
        <div class="field"><label for="c-cap">Max discount (₹)</label><input class="input" id="c-cap" name="maxDiscount" type="number" min="0" placeholder="optional"></div>
      </div>
      <div class="row" style="justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit">Create coupon</button>
      </div>
    </form>`);

  qs('#coupon-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.adminCreateCoupon({
        code: f.get('code').trim().toUpperCase(),
        type: f.get('type'),
        value: Number(f.get('value')),
        minSubtotal: Math.round(Number(f.get('minSubtotal') || 0) * 100),
        maxDiscount: f.get('maxDiscount') ? Math.round(Number(f.get('maxDiscount')) * 100) : null,
      });
      toast('Coupon created', 'success');
      close();
      render();
    } catch (err) { handleError(err); }
  });
}

function openStaffModal() {
  const { el, close } = drawer(`
    <div class="drawer-head">
      <div><h2 class="h3">Add staff</h2><p class="tiny">They can sign in at the admin panel</p></div>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <form class="drawer-body" id="staff-form">
      <div class="field"><label for="s-name2">Name</label><input class="input" id="s-name2" name="name" required></div>
      <div class="field"><label for="s-email2">Email</label><input class="input" id="s-email2" name="email" type="email" required></div>
      <div class="field"><label for="s-pass">Temporary password</label><input class="input" id="s-pass" name="password" type="text" minlength="8" required></div>
      <div class="field"><label for="s-role">Role</label>
        <select class="select" id="s-role" name="role"><option value="staff">Staff</option><option value="admin">Owner (full access)</option></select></div>
      <div class="row" style="justify-content:flex-end;gap:10px">
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="submit">Create account</button>
      </div>
    </form>`);

  qs('#staff-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.adminCreateStaff(Object.fromEntries(f.entries()));
      toast('Staff account created', 'success');
      close();
      render();
    } catch (err) { handleError(err); }
  });
}

async function changeRole(id, role) {
  try { await api.adminUpdateStaff(Number(id), { role }); toast('Role updated', 'success'); render(); } catch (err) { handleError(err); }
}

/* --------------------------------------------------------------- 2FA panel */
async function renderTwoFactor() {
  const box = qs('#twofa-box');
  if (!box) return;
  const { enabled } = await api.admin2fa();

  if (enabled) {
    box.innerHTML = `
      <div class="alert alert-success">Two-factor is active.</div>
      <div class="field"><label for="tf-off">Enter a current code to turn it off</label>
        <input class="input" id="tf-off" inputmode="numeric" maxlength="6" placeholder="123456"></div>
      <button class="btn btn-secondary" type="button" id="tf-disable">Turn off</button>`;
    qs('#tf-disable').addEventListener('click', async () => {
      try { await api.admin2faDisable(qs('#tf-off').value.trim()); toast('Two-factor disabled'); render(); } catch (err) { handleError(err); }
    });
    return;
  }

  box.innerHTML = `<button class="btn btn-primary" type="button" id="tf-start">Set up two-factor</button>`;
  qs('#tf-start').addEventListener('click', async () => {
    const { secret, otpauth } = await api.admin2faSetup();
    box.innerHTML = `
      <div class="stack" style="gap:10px">
        <p class="tiny">Add this account to your authenticator app, then enter the 6-digit code it shows.</p>
        <div class="alert alert-info" style="word-break:break-all;font-family:monospace">${esc(secret)}</div>
        <div class="tiny" style="word-break:break-all">${esc(otpauth)}</div>
        <div class="field"><label for="tf-code">Code from the app</label>
          <input class="input" id="tf-code" inputmode="numeric" maxlength="6" placeholder="123456"></div>
        <button class="btn btn-primary" type="button" id="tf-enable">Enable two-factor</button>
      </div>`;
    qs('#tf-enable').addEventListener('click', async () => {
      try {
        await api.admin2faEnable(qs('#tf-code').value.trim());
        toast('Two-factor enabled', 'success');
        render();
      } catch (err) { handleError(err); }
    });
  });
}

/* -------------------------------------------------------------------- init */
async function init() {
  try {
    const me = await api.me();
    if (!me.user) throw new Error('no session');
    store.setUser(me.user);
  } catch {
    location.href = `/login.html?next=${encodeURIComponent('/mukhiya')}`;
    return;
  }

  if (!['admin', 'staff'].includes(store.user.role)) {
    root.classList.remove('admin-shell');
    root.innerHTML = `<div class="empty-state" style="min-height:100vh"><div class="icon" style="opacity:.35">${icon('lock', 44)}</div>
      <h1 class="h2">Admin access only</h1>
      <p class="muted">Sign in with an administrator account to open the dashboard.</p>
      <a class="btn btn-primary" href="/login.html">Sign in</a></div>`;
    return;
  }

  isOwner = store.user.role === 'admin';
  const config = await api.adminConfig();
  storeUrl = config.storeUrl;

  const viewFromHash = () => {
    const wanted = location.hash.slice(1);
    return NAV.some(([k, , scope]) => k === wanted && (scope === 'any' || isOwner)) ? wanted : null;
  };
  const initial = viewFromHash();
  if (initial) view = initial;

  // Deep links and browser back/forward should drive the view too.
  window.addEventListener('hashchange', () => {
    const next = viewFromHash();
    if (next && next !== view) {
      view = next;
      render();
    }
  });

  try {
    stats = await api.adminStats(state.days);
    render();
  } catch (err) {
    handleError(err);
  }
}

init();
