import { api } from '../api.js';
import { mountChrome, boot, productCard, skeletonCards, qs, qsa, esc, money, handleError, icon, setPageTitle } from '../ui.js';

mountChrome({ active: '' });
boot();

const SIZES = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'S', 'M', 'L', 'XL', 'One size'];
const PRICE_BANDS = [
  ['Under ₹1,000', 0, 100000],
  ['₹1,000 – ₹2,500', 100000, 250000],
  ['₹2,500 – ₹4,000', 250000, 400000],
  ['Above ₹4,000', 400000, null],
];

const state = {
  q: '', category: '', sort: 'popular', page: 1, size: '', minPrice: '', maxPrice: '',
};

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.category = p.get('category') || '';
  state.sort = p.get('sort') || 'popular';
  state.page = Number(p.get('page') || 1);
  state.size = p.get('size') || '';
  state.minPrice = p.get('minPrice') || '';
  state.maxPrice = p.get('maxPrice') || '';
}

function writeUrl(push = true) {
  const p = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => { if (v && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'popular')) p.set(k, v); });
  const url = `${location.pathname}${p.toString() ? `?${p}` : ''}`;
  if (push) history.pushState(state, '', url);
}

async function loadCategories() {
  const { categories } = await api.categories();
  return categories;
}

function renderFilters(categories) {
  qs('#filters').innerHTML = `
    <div class="row-between" style="margin-bottom:16px">
      <strong style="font-size:15px">Filters</strong>
      <button class="btn-ghost" style="font-size:13px;font-weight:600;color:var(--brand)" id="clear-filters">Clear all</button>
    </div>
    <div class="filter-group">
      <h3>Category</h3>
      ${categories.map((c) => `
        <label class="check">
          <input type="checkbox" name="category" value="${esc(c.slug)}" ${state.category === c.slug ? 'checked' : ''}>
          <span>${esc(c.name)}</span>
          <span class="muted" style="margin-left:auto;font-size:12px">${c.count}</span>
        </label>`).join('')}
    </div>
    <hr class="divider">
    <div class="filter-group">
      <h3>Price</h3>
      ${PRICE_BANDS.map(([label, min, max]) => `
        <label class="check">
          <input type="radio" name="price" value="${min}-${max ?? ''}" ${String(state.minPrice) === String(min) && String(state.maxPrice) === String(max ?? '') ? 'checked' : ''}>
          <span>${label}</span>
        </label>`).join('')}
    </div>
    <hr class="divider">
    <div class="filter-group">
      <h3>Size</h3>
      <div class="size-options">
        ${SIZES.map((s) => `<button class="size-option" type="button" data-size="${esc(s)}" aria-pressed="${state.size === s}">${esc(s)}</button>`).join('')}
      </div>
    </div>
    <div class="sheet-footer">
      <button class="btn btn-secondary" type="button" id="sheet-clear">Clear all</button>
      <button class="btn btn-primary" type="button" id="sheet-apply">Show results</button>
    </div>`;

  qsa('input[name=category]').forEach((el) => el.addEventListener('change', () => {
    state.category = el.checked ? el.value : '';
    state.page = 1;
    update();
  }));

  qsa('input[name=price]').forEach((el) => el.addEventListener('change', () => {
    const [min, max] = el.value.split('-');
    state.minPrice = min; state.maxPrice = max; state.page = 1;
    update();
  }));

  qsa('[data-size]').forEach((el) => el.addEventListener('click', () => {
    state.size = state.size === el.dataset.size ? '' : el.dataset.size;
    state.page = 1;
    update();
  }));

  const clearAll = () => {
    Object.assign(state, { category: '', size: '', minPrice: '', maxPrice: '', page: 1 });
    update();
  };
  qs('#clear-filters').addEventListener('click', clearAll);
  qs('#sheet-clear')?.addEventListener('click', clearAll);
  qs('#sheet-apply')?.addEventListener('click', closeSheet);
}

/* ---------- mobile filter sheet ---------- */
function openSheet() {
  const panel = qs('.filters');
  panel.classList.add('is-open');
  qs('#filter-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  qs('.filters')?.classList.remove('is-open');
  const backdrop = qs('#filter-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.body.style.overflow = '';
}

const activeFilterCount = () =>
  [state.category, state.size, state.q, state.minPrice || state.maxPrice].filter(Boolean).length;

function renderActiveFilters(categories) {
  const chips = [];
  if (state.category) {
    const name = categories.find((c) => c.slug === state.category)?.name || state.category;
    chips.push(`<button class="chip chip-clear" data-clear="category">${esc(name)} ✕</button>`);
  }
  if (state.size) chips.push(`<button class="chip chip-clear" data-clear="size">${esc(state.size)} ✕</button>`);
  if (state.minPrice || state.maxPrice) {
    const label = `${state.minPrice ? money(Number(state.minPrice)) : '₹0'} – ${state.maxPrice ? money(Number(state.maxPrice)) : 'any'}`;
    chips.push(`<button class="chip chip-clear" data-clear="price">${label} ✕</button>`);
  }
  if (state.q) chips.push(`<button class="chip chip-clear" data-clear="q">“${esc(state.q)}” ✕</button>`);

  qs('#active-filters').innerHTML = chips.join('');
  qsa('[data-clear]').forEach((el) => el.addEventListener('click', () => {
    const key = el.dataset.clear;
    if (key === 'price') { state.minPrice = ''; state.maxPrice = ''; }
    else state[key] = '';
    state.page = 1;
    update();
  }));
}

function renderPagination(totalPages) {
  if (totalPages <= 1) { qs('#pagination').innerHTML = ''; return; }
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  qs('#pagination').innerHTML = `
    <button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>
    ${pages.map((p) => p === '…'
      ? '<button type="button" disabled>…</button>'
      : `<button type="button" data-page="${p}" ${p === state.page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}
    <button type="button" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>›</button>`;

  qsa('[data-page]').forEach((el) => el.addEventListener('click', () => {
    state.page = Number(el.dataset.page);
    update();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

let categories = [];

async function update() {
  writeUrl();
  renderActiveFilters(categories);

  const count = activeFilterCount();
  const badge = qs('#filter-count');
  if (badge) {
    badge.textContent = String(count);
    badge.classList.toggle('hide', count === 0);
  }
  qs('#sort') && (qs('#sort').value = state.sort);
  qs('#sort-mobile') && (qs('#sort-mobile').value = state.sort);
  qsa('[data-size]').forEach((el) => el.setAttribute('aria-pressed', String(state.size === el.dataset.size)));
  qsa('input[name=category]').forEach((el) => { el.checked = el.value === state.category; });

  qs('#grid').innerHTML = skeletonCards(6);
  try {
    const data = await api.products({ ...state, limit: 12 });
    const title = state.q ? `Results for “${state.q}”` : state.category
      ? (categories.find((c) => c.slug === state.category)?.name || 'Products')
      : 'All products';

    qs('#page-title').textContent = title;
    qs('#crumb-current').textContent = title;
    qs('#page-sub').textContent = `${data.total} product${data.total === 1 ? '' : 's'}  ·  Free delivery over ₹499`;
    const apply = qs('#sheet-apply');
    if (apply) apply.textContent = `Show ${data.total} product${data.total === 1 ? '' : 's'}`;
    setPageTitle(title);

    qs('#grid').innerHTML = data.items.length
      ? data.items.map(productCard).join('')
      : `<div class="empty-state" style="grid-column:1/-1">
           <div class="icon" style="opacity:.35">${icon('search', 40)}</div>
           <h2 class="h3">No products match those filters</h2>
           <p class="muted">Try removing a filter or searching for something else.</p>
         </div>`;

    renderPagination(data.totalPages);
  } catch (err) {
    handleError(err);
    qs('#grid').innerHTML = '<p class="muted">Could not load products.</p>';
  }
}

async function init() {
  readUrl();
  qs('#sort').value = state.sort;
  const onSort = (e) => { state.sort = e.target.value; state.page = 1; update(); };
  qs('#sort').addEventListener('change', onSort);
  qs('#sort-mobile')?.addEventListener('change', onSort);

  qs('#open-filters')?.addEventListener('click', openSheet);
  qs('#filter-backdrop')?.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  categories = await loadCategories();
  renderFilters(categories);
  update();
}

init().catch(handleError);
window.addEventListener('popstate', () => { readUrl(); init(); });
