import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, productArt, toast, handleError, icon, toggleWishlist } from '../ui.js';

mountChrome();
const user = await boot();

const root = qs('#wishlist-root');

async function load() {
  if (!user) {
    location.href = `/login.html?next=${encodeURIComponent('/wishlist.html')}`;
    return;
  }
  root.innerHTML = '<div class="skeleton" style="height:280px;border-radius:20px"></div>';
  try {
    const { items } = await api.wishlist();
    render(items);
  } catch (err) {
    handleError(err);
  }
}

function render(items) {
  if (!items.length) {
    root.innerHTML = `
      <div class="empty-state">
        <div class="icon" style="opacity:.35">${icon('heart', 44)}</div>
        <h1 class="h2">Nothing saved yet</h1>
        <p class="lead">Tap the ♡ on any product and it will wait for you here.</p>
        <a class="btn btn-primary btn-lg" href="/products.html">Browse products</a>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="row-between" style="margin-bottom:24px">
      <div>
        <h1 class="h1">Your wishlist</h1>
        <p class="lead">${items.length} saved item${items.length === 1 ? '' : 's'}</p>
      </div>
      <a class="link-arrow" href="/products.html">Continue shopping →</a>
    </div>
    <div class="product-grid">
      ${items.map((p) => `
        <article class="product-card" data-product="${p.id}">
          <a class="product-media" href="/product.html?slug=${encodeURIComponent(p.slug)}" aria-label="${esc(p.title)}">
            ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">` : productArt(p)}
            <button class="wish-btn is-saved" type="button" aria-pressed="true" data-wish-id="${p.id}" aria-label="Remove ${esc(p.title)}">♥</button>
          </a>
          <div class="product-body">
            <a class="product-title" href="/product.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>
            <span class="product-meta">${esc(p.subtitle)}</span>
            <div class="price-row">
              <span class="price">${money(p.pricePaise)}</span>
              ${p.mrpPaise > p.pricePaise ? `<span class="price-strike">${money(p.mrpPaise)}</span>` : ''}
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-move="${p.id}">Move to cart</button>
          </div>
        </article>`).join('')}
    </div>`;

  qsa('[data-move]').forEach((btn) => btn.addEventListener('click', async () => {
    const product = items.find((i) => String(i.id) === btn.dataset.move);
    const size = product.sizes?.find((s) => s.inStock)?.label || 'One size';
    btn.disabled = true;
    try {
      await api.addToCart({ productId: product.id, size, qty: 1 });
      await toggleWishlist(product.id);
      toast(`${product.title} moved to your cart`, 'success');
      load();
    } catch (err) {
      handleError(err);
      btn.disabled = false;
    }
  }));
}

// removing via the heart should refresh the list
document.addEventListener('wishlist:change', () => {
  if (!root.querySelector('.product-card')) return;
  setTimeout(load, 250);
});

load();
