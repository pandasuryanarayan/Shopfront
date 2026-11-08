import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, productArt, productCard, toast, handleError, isSaved, setPageTitle } from '../ui.js';
import { store } from '../store.js';

mountChrome();
// Wait for the session: the review form is only rendered for signed-in users.
const currentUser = await boot();

const root = qs('#pdp');
const slug = new URLSearchParams(location.search).get('slug');

const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

function gallery(product) {
  const photos = product.images?.length
    ? product.images.map((i) => i.url)
    : null;
  const fallback = [
    product.gradient,
    [product.gradient[1], product.gradient[0]],
    ['#FFFFFF', product.gradient[1]],
    [product.gradient[0], '#FFFFFF'],
  ];

  const slides = photos
    ? photos.map((url, i) => `<img src="${esc(url)}" alt="${esc(product.title)} photo ${i + 1}" ${i ? 'loading="lazy"' : ''}>`)
    : fallback.map((g) => productArt({ ...product, gradient: g }));

  return `
    <div class="gallery">
      <div class="gallery-main" id="gallery-main">
        ${slides[0]}
        <button class="wish-btn${isSaved(product.id) ? ' is-saved' : ''}" type="button"
                data-wish-id="${product.id}" aria-pressed="${isSaved(product.id)}"
                aria-label="Save ${esc(product.title)}">${isSaved(product.id) ? '♥' : '♡'}</button>
      </div>
      <div class="gallery-thumbs" role="tablist" aria-label="Product images">
        ${slides.map((html, i) => `
          <button type="button" role="tab" aria-selected="${i === 0}" data-thumb="${i}">${html}</button>`).join('')}
      </div>
    </div>`;
}

function render(data) {
  const { product, reviews, related } = data;
  const firstAvailable = product.sizes.find((s) => s.inStock)?.label || product.sizes[0]?.label || 'One size';

  setPageTitle(product.title);

  root.innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a><span>/</span>
      <a href="/products.html?category=${esc(product.category.slug)}">${esc(product.category.name)}</a><span>/</span>
      <span class="current">${esc(product.title)}</span>
    </nav>

    <div class="pdp">
      ${gallery(product)}
      <div class="pdp-info">
        <span class="tiny" style="text-transform:uppercase;letter-spacing:.08em">${esc(product.subtitle)}</span>
        <h1 class="h1">${esc(product.title)}</h1>
        <div class="row" style="gap:10px;font-size:14px">
          <span class="badge badge-success">★ ${product.rating.toFixed(1)}</span>
          <span class="muted">${product.ratingCount} reviews</span>
          <span class="muted">·</span>
          <span class="muted">${product.inStock ? 'In stock' : 'Out of stock'}</span>
        </div>

        <div class="pdp-price">
          <span class="now">${money(product.pricePaise)}</span>
          ${product.mrpPaise > product.pricePaise ? `<span class="was">${money(product.mrpPaise)}</span><span class="badge badge-accent">${product.discountPercent}% off</span>` : ''}
        </div>
        <p class="tiny">Inclusive of all taxes · EMI from ${money(Math.round(product.pricePaise / 3))}/mo</p>

        <hr class="divider">

        ${product.colours?.length ? `
        <div class="stack" style="gap:10px">
          <strong style="font-size:14px">Colour — <span class="muted" id="colour-name">${esc(product.colours[0].name)}</span></strong>
          <div class="swatch-row" id="colours">
            ${product.colours.map((c, i) => `
              <button class="colour-swatch${i === 0 ? ' is-active' : ''}" type="button" data-colour="${esc(c.name)}"
                      aria-pressed="${i === 0}" title="${esc(c.name)}${c.inStock ? '' : ' (sold out)'}"
                      style="--swatch:${esc(c.hex)}" ${c.inStock ? '' : 'data-sold-out="1"'}>
                <span class="sr-only">${esc(c.name)}</span>
              </button>`).join('')}
          </div>
        </div>` : ''}

        <div class="stack" style="gap:10px">
          <div class="row-between"><strong style="font-size:14px">Size</strong><button class="btn-ghost" type="button" style="font-size:13px;color:var(--brand);font-weight:600">Size guide</button></div>
          <div class="size-options" id="sizes">
            ${product.sizes.map((s) => `
              <button class="size-option" type="button" data-size="${esc(s.label)}" aria-pressed="${s.label === firstAvailable}" ${s.inStock ? '' : 'disabled'}>
                ${esc(s.label)}
              </button>`).join('')}
          </div>
        </div>

        <div class="row" style="gap:16px">
          <strong style="font-size:14px">Quantity</strong>
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="Decrease quantity">−</button>
            <span id="qty-value">1</span>
            <button type="button" data-qty="1" aria-label="Increase quantity">+</button>
          </div>
          <span class="tiny">Ships in 24 hours</span>
        </div>

        <div class="buy-actions">
          <button class="btn btn-primary btn-lg" type="button" id="add-to-cart" ${product.inStock ? '' : 'disabled'}>
            ${product.inStock ? `Add to cart · ${money(product.pricePaise)}` : 'Out of stock'}
          </button>
          <button class="btn btn-secondary btn-lg" type="button" id="save-btn">♡ Save</button>
        </div>

        <div class="delivery-box">
          <strong style="font-size:14px">Delivering to 560001 · Bengaluru</strong>
          <span class="tiny">Free delivery by ${new Date(Date.now() + 3 * 864e5).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · Cash on delivery available</span>
        </div>

        <details class="accordion" open>
          <summary>Description</summary>
          <p>${esc(product.description)}</p>
        </details>
        <details class="accordion">
          <summary>Specifications</summary>
          <p>Material: premium blend · Care: gentle wash, do not bleach · Country of origin: India</p>
        </details>
        <details class="accordion">
          <summary>Shipping &amp; returns</summary>
          <p>Free delivery on orders above ₹499. 7-day returns with free pickup. Refunds reach your account within 3–5 working days.</p>
        </details>
      </div>
    </div>

    <section class="section" style="margin-top:56px">
      <div class="section-head"><div><h2 class="h2">Reviews</h2><p class="lead">${product.ratingCount} ratings · ${reviews.length} written review${reviews.length === 1 ? '' : 's'}</p></div></div>
      ${currentUser ? `
      <form class="card stack" id="review-form" style="margin-bottom:16px">
        <h3 class="h4">Write a review</h3>
        <div class="star-picker" id="star-picker" role="radiogroup" aria-label="Your rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}
        </div>
        <textarea class="textarea" id="review-body" maxlength="1000" placeholder="How is it in real life? Fit, quality, anything useful for the next person."></textarea>
        <div class="row" style="justify-content:flex-end">
          <button class="btn btn-primary" type="submit" id="review-submit">Post review</button>
        </div>
      </form>` : `
      <div class="alert alert-info" style="margin-bottom:16px">
        <a href="/login.html?next=${encodeURIComponent(location.pathname + location.search)}" style="font-weight:600;text-decoration:underline">Sign in</a> to write a review.
      </div>`}
      <div class="card" id="reviews">
        ${reviews.length ? reviews.map((r) => `
          <div class="review">
            <div class="review-head"><strong>${esc(r.author)}</strong><span class="stars">${stars(r.rating)}</span><span class="muted tiny">${new Date(r.createdAt).toLocaleDateString('en-IN')}</span></div>
            <p class="muted" style="font-size:14px">${esc(r.body)}</p>
          </div>`).join('') : '<p class="muted">No reviews yet. Be the first to review this product.</p>'}
      </div>
    </section>

    <section class="section" style="margin-top:56px" id="recently-viewed"></section>

    ${related.length ? `
    <section class="section" style="margin-top:56px">
      <div class="section-head">
        <div><h2 class="h2">Complete the look</h2><p class="lead">More from ${esc(product.category.name)}</p></div>
        <a class="link-arrow" href="/products.html?category=${esc(product.category.slug)}">View all →</a>
      </div>
      <div class="product-grid">${related.map(productCard).join('')}</div>
    </section>` : ''}
  `;

  wire(product, firstAvailable);
  remember(product);
  renderRecentlyViewed(product.id);
}

/* ---------- recently viewed ---------- */
const RECENT_KEY = 'sf_recent';
const RECENT_LIMIT = 8;

function remember(product) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      .filter((p) => p.slug !== product.slug);
    list.unshift({
      slug: product.slug,
      id: product.id,
      title: product.title,
      pricePaise: product.pricePaise,
      image: product.image,
      gradient: product.gradient,
      subtitle: product.subtitle,
      categorySlug: product.category?.slug,
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)));
  } catch {
    /* storage is optional */
  }
}

export function recentProducts(excludeId) {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((p) => p.id !== excludeId).slice(0, 4);
  } catch {
    return [];
  }
}

function renderRecentlyViewed(currentId) {
  const host = qs('#recently-viewed');
  const items = recentProducts(currentId);
  if (!host || !items.length) return;
  host.innerHTML = `
    <div class="section-head"><div><h2 class="h2">Recently viewed</h2><p class="lead">Pick up where you left off</p></div></div>
    <div class="product-grid">${items.map(productCard).join('')}</div>`;
}

function wire(product, firstAvailable) {
  let size = firstAvailable;
  let qty = 1;

  let colour = product.colours?.[0]?.name || 'Default';

  qsa('#colours [data-colour]').forEach((el) => el.addEventListener('click', () => {
    colour = el.dataset.colour;
    qs('#colour-name').textContent = colour;
    qsa('#colours [data-colour]').forEach((b) => {
      b.classList.toggle('is-active', b === el);
      b.setAttribute('aria-pressed', String(b === el));
    });
  }));

  qsa('#sizes [data-size]').forEach((el) => el.addEventListener('click', () => {
    size = el.dataset.size;
    qsa('#sizes [data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === size)));
  }));

  qsa('[data-qty]').forEach((el) => el.addEventListener('click', () => {
    qty = Math.min(10, Math.max(1, qty + Number(el.dataset.qty)));
    qs('#qty-value').textContent = String(qty);
  }));

  qsa('[data-thumb]').forEach((el) => el.addEventListener('click', () => {
    const slide = el.querySelector('img, .art');
    if (!slide) return;
    qsa('[data-thumb]').forEach((b) => b.setAttribute('aria-selected', String(b === el)));
    qs('#gallery-main').replaceChild(slide.cloneNode(true), qs('#gallery-main').firstElementChild);
  }));

  // ---- write a review ----
  const picker = qs('#star-picker');
  if (picker) {
    let rating = 0;
    const paint = () => qsa('[data-star]', picker).forEach((b) => {
      const on = Number(b.dataset.star) <= rating;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(Number(b.dataset.star) === rating));
    });
    qsa('[data-star]', picker).forEach((b) => b.addEventListener('click', () => { rating = Number(b.dataset.star); paint(); }));

    qs('#review-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!rating) { toast('Pick a star rating first', 'error'); return; }
      const btn = qs('#review-submit');
      btn.disabled = true;
      try {
        await api.addReview(product.slug, { rating, body: qs('#review-body').value.trim() });
        toast('Thanks — your review is live', 'success');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        handleError(err);
        btn.disabled = false;
      }
    });
  }

  qs('#add-to-cart').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      const cart = await api.addToCart({ productId: product.id, size, colour, qty });
      store.setCartCount(cart.summary.itemCount);
      toast(`${product.title} added to cart`, 'success');
    } catch (err) {
      handleError(err);
    } finally {
      btn.disabled = false;
    }
  });

  qs('#save-btn').addEventListener('click', () => toast('Saved for later'));
  qs('.gallery-main .wish-btn').addEventListener('click', () => toast('Saved for later'));
}

async function init() {
  if (!slug) { location.href = '/products.html'; return; }
  root.innerHTML = '<div class="skeleton" style="height:520px;border-radius:20px"></div>';
  try {
    render(await api.product(slug));
  } catch (err) {
    if (err.status === 404) {
      root.innerHTML = `<div class="empty-state"><div class="icon" style="opacity:.35">${icon('search', 40)}</div><h1 class="h2">Product not found</h1><p class="muted">It may have been removed.</p><a class="btn btn-primary" href="/products.html">Browse products</a></div>`;
      return;
    }
    handleError(err);
  }
}

init();
