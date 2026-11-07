import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, productArt, toast, handleError, icon } from '../ui.js';
import { store } from '../store.js';

mountChrome();
await boot();

const root = qs('#cart-root');
let current = null;

function summaryCard(summary, coupon) {
  return `
    <div class="card summary-card">
      <h2 class="h3">Order summary</h2>
      <div class="stack" style="gap:10px">
        <div class="summary-line"><span>Subtotal (${summary.itemCount} item${summary.itemCount === 1 ? '' : 's'})</span><strong>${money(summary.subtotalPaise)}</strong></div>
        ${summary.discountPaise ? `<div class="summary-line"><span>Discount ${coupon ? `(${esc(coupon)})` : ''}</span><strong style="color:var(--success)">− ${money(summary.discountPaise)}</strong></div>` : ''}
        <div class="summary-line"><span>Delivery</span><strong>${summary.deliveryPaise ? money(summary.deliveryPaise) : 'Free'}</strong></div>
        <div class="summary-line"><span>Tax (GST)</span><strong>${money(summary.taxPaise || 0)}</strong></div>
        <hr class="divider">
        <div class="summary-line"><span class="summary-total">Total payable</span><span class="summary-total">${money(summary.totalPaise)}</span></div>
      </div>
      <div class="coupon-row">
        <input class="input" id="coupon" placeholder="Coupon code" value="${esc(coupon || '')}" aria-label="Coupon code">
        <button class="btn btn-secondary" type="button" id="apply-coupon">Apply</button>
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="button" id="checkout-btn">Proceed to checkout →</button>
      <p class="tiny">Secure payments · UPI, Visa, Mastercard, RuPay, COD</p>
    </div>`;
}

function render(data) {
  current = data;
  const { items, summary, coupon } = data;

  if (!items.length) {
    root.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="opacity:.35">${icon('bag', 44)}</div>
        <h1 class="h2">Your cart is empty</h1>
        <p class="lead">Add a few essentials and they will show up here.</p>
        <a class="btn btn-primary btn-lg" href="/products.html">Start shopping</a>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="row-between" style="margin-bottom:24px">
      <div>
        <h1 class="h1">Your cart</h1>
        <p class="lead">${summary.itemCount} item${summary.itemCount === 1 ? '' : 's'} · Delivery in 2–4 days</p>
      </div>
      <a class="link-arrow" href="/products.html">Continue shopping →</a>
    </div>
    <div class="cart-layout">
      <div>
        ${items.map((item) => `
          <div class="cart-row" data-id="${item.id}">
            <a href="/product.html?slug=${encodeURIComponent(item.slug)}">${item.image
              ? `<img class="cart-thumb" src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" style="object-fit:cover">`
              : productArt({ ...item, gradient: item.gradient }, { className: 'art cart-thumb' })}</a>
            <div class="grow">
              <a class="product-title" href="/product.html?slug=${encodeURIComponent(item.slug)}">${esc(item.title)}</a>
              <div class="product-meta">${esc(item.size)}</div>
              <div class="tiny" style="color:var(--success)">In stock · free delivery</div>
              <div class="cart-actions">
                <button type="button" data-remove="${item.id}">Remove</button>
              </div>
            </div>
            <div style="display:grid;gap:10px;justify-items:end">
              <div class="qty">
                <button type="button" data-step="-1" data-id="${item.id}" aria-label="Decrease">−</button>
                <span>${item.qty}</span>
                <button type="button" data-step="1" data-id="${item.id}" aria-label="Increase">+</button>
              </div>
              <div class="price-row" style="justify-content:flex-end">
                <span class="price">${money(item.lineTotalPaise)}</span>
                ${item.mrpPaise > item.pricePaise ? `<span class="price-strike">${money(item.mrpPaise * item.qty)}</span>` : ''}
              </div>
            </div>
          </div>`).join('')}
        ${summary.deliveryPaise === 0 ? `<div class="alert alert-info" style="margin-top:16px">Free delivery unlocked — you saved ${money(4900)} on shipping.</div>` : ''}
      </div>
      ${summaryCard(summary, coupon?.code)}
    </div>`;

  wire();
}

function wire() {
  qsa('[data-step]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = Number(btn.dataset.id);
    const item = current.items.find((i) => i.id === id);
    const next = item.qty + Number(btn.dataset.step);
    btn.disabled = true;
    try {
      const data = await api.updateCartItem(id, Math.max(0, next));
      store.setCartCount(data.summary.itemCount);
      render(data);
    } catch (err) {
      handleError(err);
      btn.disabled = false;
    }
  }));

  qsa('[data-remove]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      const data = await api.removeCartItem(Number(btn.dataset.remove));
      store.setCartCount(data.summary.itemCount);
      toast('Item removed');
      render(data);
    } catch (err) {
      handleError(err);
    }
  }));

  qs('#apply-coupon')?.addEventListener('click', async () => {
    const code = qs('#coupon').value.trim();
    if (!code) { store.setCoupon(''); render(current); return; }
    try {
      const res = await api.applyCoupon({ code, subtotalPaise: current.summary.subtotalPaise });
      store.setCoupon(res.coupon.code);
      toast(`${res.coupon.code} applied — you saved ${money(res.discountPaise)}`, 'success');
      load();
    } catch (err) {
      handleError(err);
    }
  });

  qs('#checkout-btn')?.addEventListener('click', () => { location.href = '/checkout.html'; });
}

async function load() {
  root.innerHTML = '<div class="skeleton" style="height:280px;border-radius:20px"></div>';
  try {
    const data = await api.cart(store.coupon || undefined);
    if (data.coupon?.code) store.setCoupon(data.coupon.code);
    store.setCartCount(data.summary.itemCount);
    render(data);
  } catch (err) {
    handleError(err);
  }
}

load();
