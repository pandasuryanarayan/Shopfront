import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, statusBadge, toast, handleError, icon, setPageTitle } from '../ui.js';

mountChrome();
const user = await boot();

const root = qs('#order-root');
const reference = new URLSearchParams(location.search).get('ref');
const STEPS = ['placed', 'packed', 'shipped', 'delivered'];
const REASONS = [
  ['size', 'Wrong size or fit'],
  ['damaged', 'Arrived damaged'],
  ['not-as-described', 'Not as described'],
  ['changed-mind', 'Changed my mind'],
  ['other', 'Something else'],
];

let order = null;

function timeline(current) {
  if (current === 'cancelled') {
    return `<div class="alert alert-error">This order was cancelled.</div>`;
  }
  const index = STEPS.indexOf(current);
  const labels = { placed: 'Order placed', packed: 'Packed', shipped: 'Out for delivery', delivered: 'Delivered' };
  return `<div class="timeline">
    ${STEPS.map((step, i) => `
      <div class="timeline-step ${i <= index ? 'is-done' : ''} ${i === index ? 'is-current' : ''}">
        <div class="timeline-rail">
          <span class="timeline-dot"></span>
          ${i < STEPS.length - 1 ? '<span class="timeline-line"></span>' : ''}
        </div>
        <div class="timeline-body">
          <strong>${labels[step]}</strong>
          <span class="tiny">${i <= index ? 'Done' : 'Pending'}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

function render() {
  const cancellable = ['placed', 'packed'].includes(order.status);
  const canReturn = order.status === 'delivered';
  const daysOld = (Date.now() - new Date(`${order.createdAt.replace(' ', 'T')}Z`).getTime()) / 86400000;
  const withinWindow = daysOld <= 7;

  setPageTitle(order.reference);

  root.innerHTML = `
    <nav class="breadcrumb"><a href="/orders.html">Your orders</a><span>/</span><span class="current">${esc(order.reference)}</span></nav>

    <div class="row-between" style="margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <h1 class="h1">${esc(order.reference)}</h1>
        <p class="lead">Placed ${new Date(`${order.createdAt.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div class="row" style="gap:10px">${statusBadge(order.status)}${statusBadge(order.paymentStatus)}</div>
    </div>

    <div class="cart-layout">
      <div class="stack" style="gap:20px">
        <div class="card stack">
          <h2 class="h4">Items</h2>
          ${order.items.map((item) => {
            const existing = order.returns.find((r) => r.orderItemId === item.id);
            return `
            <div class="order-item" style="align-items:flex-start">
              ${item.image
                ? `<img src="${esc(item.image)}" alt="${esc(item.title)}" style="width:56px;height:56px;border-radius:8px;object-fit:cover">`
                : '<div class="art" style="width:56px;height:56px;border-radius:8px"></div>'}
              <div class="grow">
                <strong style="font-size:14px">${esc(item.title)}</strong>
                <div class="tiny">${esc(item.size)}${item.colour && item.colour !== 'Default' ? ` · ${esc(item.colour)}` : ''} · Qty ${item.qty}</div>
                ${existing
                  ? `<div class="tiny" style="color:var(--warning)">Return ${existing.status} · ${esc(existing.reason)}</div>`
                  : canReturn && withinWindow
                    ? `<details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px;color:var(--brand);font-weight:600">Return or exchange</summary>
                        <form class="stack" style="gap:8px;margin-top:10px;max-width:420px" data-return="${item.id}">
                          <select class="select" name="reason" style="height:42px">
                            ${REASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
                          </select>
                          <textarea class="textarea" name="note" maxlength="500" placeholder="Anything we should know? (optional)" style="min-height:64px"></textarea>
                          <button class="btn btn-secondary btn-sm" type="submit">Submit request</button>
                        </form>
                      </details>`
                    : canReturn && !withinWindow
                      ? '<div class="tiny">Return window closed (7 days)</div>'
                      : ''}
              </div>
              <span style="font-size:14px;font-weight:600">${money(item.lineTotalPaise)}</span>
            </div>`;
          }).join('')}
        </div>

        <div class="card stack">
          <h2 class="h4">Progress</h2>
          ${timeline(order.status)}
        </div>

        ${order.returns.length ? `
        <div class="card stack">
          <h2 class="h4">Returns</h2>
          ${order.returns.map((r) => `
            <div class="row-between" style="font-size:14px">
              <span>${esc(REASONS.find(([v]) => v === r.reason)?.[1] || r.reason)}</span>
              ${statusBadge(r.status === 'requested' ? 'pending' : 'success')}
            </div>`).join('')}
        </div>` : ''}
      </div>

      <div class="stack" style="gap:16px">
        <div class="card stack">
          <h2 class="h4">Delivering to</h2>
          <div style="font-size:14px">
            <strong>${esc(order.address.fullName)}</strong>
            <div class="muted">${esc(order.address.line1)}${order.address.line2 ? `, ${esc(order.address.line2)}` : ''}</div>
            <div class="muted">${esc(order.address.city)}, ${esc(order.address.state)} ${esc(order.address.pincode)}</div>
            <div class="muted">${esc(order.address.phone)}</div>
            ${order.guestEmail ? `<div class="muted">${esc(order.guestEmail)}</div>` : ''}
          </div>
        </div>

        <div class="card stack">
          <h2 class="h4">Payment</h2>
          <div class="summary-line"><span>Method</span><strong>${esc(order.paymentMethod.toUpperCase())}</strong></div>
          <div class="summary-line"><span>Status</span><strong>${esc(order.paymentStatus)}</strong></div>
          <hr class="divider">
          <div class="summary-line"><span>Subtotal</span><strong>${money(order.subtotalPaise)}</strong></div>
          ${order.discountPaise ? `<div class="summary-line"><span>Discount</span><strong>− ${money(order.discountPaise)}</strong></div>` : ''}
          <div class="summary-line"><span>Delivery</span><strong>${order.deliveryPaise ? money(order.deliveryPaise) : 'Free'}</strong></div>
          <div class="summary-line"><span>Tax</span><strong>${money(order.taxPaise || 0)}</strong></div>
          <hr class="divider">
          <div class="summary-line"><span class="summary-total">Total</span><span class="summary-total">${money(order.totalPaise)}</span></div>
        </div>

        ${cancellable ? `<button class="btn btn-secondary btn-block" type="button" id="cancel-order">Cancel order</button>` : ''}
        <a class="btn btn-secondary btn-block" href="/orders.html">All orders</a>
      </div>
    </div>`;

  qs('#cancel-order')?.addEventListener('click', async (event) => {
    if (!confirm('Cancel this order?')) return;
    event.currentTarget.disabled = true;
    try {
      await api.cancelOrder(order.reference);
      toast('Order cancelled', 'success');
      await load();
    } catch (err) {
      handleError(err);
    }
  });

  qsa('[data-return]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const res = await api.requestReturn(order.reference, {
        orderItemId: Number(form.dataset.return),
        reason: data.get('reason'),
        note: (data.get('note') || '').toString(),
      });
      order = res.order;
      toast('Return requested — we will email you within 24 hours', 'success');
      render();
    } catch (err) {
      handleError(err);
    }
  }));
}

async function load() {
  try {
    const res = await api.order(reference);
    order = res.order;
    render();
  } catch (err) {
    if (err.status === 404) {
      root.innerHTML = `<div class="empty-state"><div class="icon" style="opacity:.35">${icon('box', 44)}</div>
        <h1 class="h2">Order not found</h1><p class="muted">Check the link, or open your order history.</p>
        <a class="btn btn-primary" href="/orders.html">Your orders</a></div>`;
      return;
    }
    handleError(err);
  }
}

if (!reference) location.href = '/orders.html';
else load();
