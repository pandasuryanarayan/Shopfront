import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, productArt, statusBadge, toast, handleError, icon } from '../ui.js';
import { store } from '../store.js';

mountChrome();
const currentUser = await boot();

const root = qs('#orders-root');
const highlight = new URLSearchParams(location.search).get('ref');

function orderCard(order) {
  const cancellable = ['placed', 'packed'].includes(order.status);
  return `
    <article class="order-card">
      <div class="order-head">
        <div><a href="/order.html?ref=${encodeURIComponent(order.reference)}"><strong style="color:var(--brand)">${esc(order.reference)}</strong></a> <span class="muted">· ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        <div class="row" style="gap:10px">
          ${statusBadge(order.status)}
          ${statusBadge(order.paymentStatus)}
          <strong>${money(order.totalPaise)}</strong>
        </div>
      </div>
      <div class="order-body">
        ${order.items.map((i) => `
          <div class="order-item">
            ${i.image ? `<img class="art" src="${esc(i.image)}" alt="${esc(i.title)}" style="object-fit:cover">` : productArt({ id: i.productId, title: i.title, gradient: ['#EDEBFF', '#D6CDFF'] }, { className: 'art' })}
            <div class="grow">
              <strong style="font-size:14px">${esc(i.title)}</strong>
              <div class="tiny">${esc(i.size)} · Qty ${i.qty}</div>
            </div>
            <span style="font-size:14px;font-weight:600">${money(i.lineTotalPaise)}</span>
          </div>`).join('')}
        <hr class="divider">
        <div class="row-between" style="font-size:13px">
          <span class="muted">Delivering to ${esc(order.address.fullName)}, ${esc(order.address.city)} ${esc(order.address.pincode)} · ${esc(order.paymentMethod.toUpperCase())}</span>
          <div class="row" style="gap:10px">
            <a class="btn btn-secondary btn-sm" href="/order.html?ref=${encodeURIComponent(order.reference)}">View details</a>
            ${cancellable ? `<button class="btn btn-secondary btn-sm" type="button" data-cancel="${esc(order.reference)}">Cancel order</button>` : ''}
          </div>
        </div>
      </div>
    </article>`;
}

async function load() {
  try {
    const { orders } = await api.orders();

    if (highlight) {
      const match = orders.find((o) => o.reference === highlight);
      if (match) {
        root.insertAdjacentHTML('afterbegin', `
          <div class="success-hero">
            <div class="tick">✓</div>
            <h1 class="h1">Thank you — your order is placed</h1>
            <p class="lead">Order <strong>${esc(match.reference)}</strong> for ${money(match.totalPaise)} is confirmed.
            ${match.paymentMethod === 'cod' ? 'Pay cash when it arrives.' : 'A payment receipt has been emailed to you.'}</p>
            <div class="row" style="gap:12px">
              <a class="btn btn-primary" href="/products.html">Continue shopping</a>
              <a class="btn btn-secondary" href="/orders.html">All orders</a>
            </div>
          </div>`);
        history.replaceState({}, '', '/orders.html');
      }
    }

    root.insertAdjacentHTML('beforeend', `
      <div class="row-between" style="margin:32px 0 20px">
        <h2 class="h2">Your orders</h2>
        <span class="tiny">${orders.length} order${orders.length === 1 ? '' : 's'}</span>
      </div>
      <div class="stack" style="gap:16px">
        ${orders.length ? orders.map(orderCard).join('') : `
          <div class="empty-state">
            <div class="icon" style="opacity:.35">${icon('box', 44)}</div>
            <h2 class="h3">No orders yet</h2>
            <p class="muted">When you place an order it will appear here.</p>
            <a class="btn btn-primary" href="/products.html">Start shopping</a>
          </div>`}
      </div>`);

    qsa('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Cancel this order?')) return;
      btn.disabled = true;
      try {
        await api.cancelOrder(btn.dataset.cancel);
        toast('Order cancelled', 'success');
        location.reload();
      } catch (err) {
        handleError(err);
        btn.disabled = false;
      }
    }));
  } catch (err) {
    if (err.status === 401) {
      location.href = `/login.html?next=${encodeURIComponent('/orders.html')}`;
      return;
    }
    handleError(err);
  }
}

// Guests have a session cookie too, so try the list before bouncing to login.
load();
