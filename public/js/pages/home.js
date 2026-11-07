import { api } from '../api.js';
import { mountChrome, boot, productCard, skeletonCards, qs, money, productArt, esc } from '../ui.js';

mountChrome();
boot();

const TRUST = [
  ['✓', 'Free delivery', 'On orders over ₹499'],
  ['↺', '7-day returns', 'No questions asked'],
  ['₹', 'Secure payments', 'UPI, cards, netbanking'],
  ['☎', '24×7 support', 'Chat with a human'],
];

qs('#trust').innerHTML = TRUST.map(([icon, title, sub]) => `
  <div class="trust-item">
    <div class="trust-icon">${icon}</div>
    <div><strong>${title}</strong><span>${sub}</span></div>
  </div>`).join('');

qs('#deal-art').innerHTML = ['#5B3DF5|#8B5CF6', '#FF6B35|#FF9A6B'].map((g) => {
  const [g1, g2] = g.split('|');
  return `<div class="art" style="--g1:${g1};--g2:${g2}"></div>`;
}).join('');

// countdown to midnight
const tick = () => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const diff = Math.max(0, end - now);
  const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  qs('#countdown').innerHTML = [[h, 'hrs'], [m, 'min'], [s, 'sec']]
    .map(([v, l]) => `<span><b>${v}</b><small>${l}</small></span>`).join('');
};
tick();
setInterval(tick, 1000);

qs('#trending').innerHTML = skeletonCards(4);
qs('#new-arrivals').innerHTML = skeletonCards(4);

async function load() {
  const [categories, trending, fresh] = await Promise.all([
    api.categories(),
    api.products({ limit: 4, sort: 'popular' }),
    api.products({ limit: 4, sort: 'newest' }),
  ]);

  qs('#categories').innerHTML = categories.categories.map((c, i) => {
    const gradients = [['#EDEBFF', '#D6CDFF'], ['#EAF0FF', '#CFDDFF'], ['#FFF1E8', '#FFD8C2'], ['#E8F5EF', '#C6E8D8'], ['#FDECF3', '#F8CEDF'], ['#EEF1F5', '#D8DFE8']];
    const [g1, g2] = gradients[i % gradients.length];
    return `<a class="category-tile" href="/products.html?category=${esc(c.slug)}">
      <div class="art" style="--g1:${g1};--g2:${g2}"></div>
      <div class="label"><span>${esc(c.name)}</span><span class="count">${c.count}</span></div>
    </a>`;
  }).join('');

  qs('#trending').innerHTML = trending.items.map(productCard).join('');
  qs('#new-arrivals').innerHTML = fresh.items.map(productCard).join('');

  const heroProduct = trending.items[0];
  if (heroProduct) {
    qs('#hero-card').innerHTML = `
      <a href="/product.html?slug=${encodeURIComponent(heroProduct.slug)}">
        ${heroProduct.image
          ? `<img class="art" src="${esc(heroProduct.image)}" alt="${esc(heroProduct.title)}" style="object-fit:cover">`
          : productArt(heroProduct)}
        <div class="hero-card-body">
          <strong style="font-size:15px">${esc(heroProduct.title)}</strong>
          <span class="muted" style="font-size:13px">${money(heroProduct.pricePaise)} · ★ ${heroProduct.rating.toFixed(1)}</span>
        </div>
      </a>`;
  }
}

/* ---------- personalised rail from recently viewed ---------- */
async function renderForYou() {
  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem('sf_recent') || '[]');
  } catch {
    return;
  }
  const categories = [...new Set(recent.map((p) => p.categorySlug).filter(Boolean))].slice(0, 2);
  if (!categories.length) return;

  const seen = new Set(recent.map((p) => p.slug));
  const batches = await Promise.all(categories.map((c) => api.products({ category: c, limit: 8, sort: 'rating' })));
  const picks = batches.flatMap((b) => b.items).filter((p) => !seen.has(p.slug)).slice(0, 4);
  if (picks.length < 2) return;

  qs('#for-you-title').textContent = 'Picked for you';
  qs('#for-you-sub').textContent = `More from ${categories.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' and ')}.`;
  qs('#for-you').innerHTML = picks.map(productCard).join('');
  qs('#for-you-section').classList.remove('hide');
}

load().catch((err) => {
  console.error(err);
  qs('#trending').innerHTML = '<p class="muted">Could not load products right now.</p>';
  qs('#new-arrivals').innerHTML = '';
});

renderForYou().catch(() => {});
