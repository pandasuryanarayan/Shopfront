import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, esc, money, productArt, toast, handleError } from '../ui.js';
import { store } from '../store.js';

mountChrome();
const currentUser = await boot();

const root = qs('#checkout-root');
let cart = null;
let paymentMethod = 'upi';
let savedAddresses = [];
let selectedAddressId = null;

const FIELDS = [
  ['fullName', 'Full name', 'text', 'span-2', 'Suryanarayan Panda'],
  ['phone', 'Phone number', 'tel', '', '+91 98765 43210'],
  ['line1', 'Address', 'text', 'span-2', '42, 3rd Cross, Indiranagar'],
  ['line2', 'Apartment, landmark (optional)', 'text', 'span-2', ''],
  ['city', 'City', 'text', '', 'Bengaluru'],
  ['state', 'State', 'text', '', 'Karnataka'],
  ['pincode', 'Pincode', 'text', '', '560038'],
];

function render() {
  const { items, summary, coupon } = cart;

  root.innerHTML = `
    <div class="checkout-steps">
      <div class="step is-active"><span class="dot">1</span>Address</div>
      <span class="step-line"></span>
      <div class="step is-active"><span class="dot">2</span>Payment</div>
      <span class="step-line"></span>
      <div class="step"><span class="dot">3</span>Review</div>
    </div>

    <div class="checkout-layout">
      <div class="stack" style="gap:20px">
        <div class="card stack" id="address-book">
          <div class="row-between"><h2 class="h4">Delivery address</h2><span class="tiny">Step 1 of 2</span></div>
          ${savedAddresses.length ? `
            <div class="stack" style="gap:10px" id="address-list">
              ${savedAddresses.map((a) => `
                <label class="address-option ${a.id === selectedAddressId ? 'is-selected' : ''}" data-address="${a.id}">
                  <input type="radio" name="savedAddress" value="${a.id}" ${a.id === selectedAddressId ? 'checked' : ''}>
                  <div class="grow">
                    <strong>${esc(a.fullName)} ${a.isDefault ? '<span class="address-tag">Default</span>' : ''}</strong>
                    <span class="tiny">${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ''}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</span>
                    <span class="tiny">${esc(a.label)} · ${esc(a.phone)}</span>
                  </div>
                </label>`).join('')}
              <label class="address-option ${selectedAddressId === null ? 'is-selected' : ''}" data-address="new">
                <input type="radio" name="savedAddress" value="new" ${selectedAddressId === null ? 'checked' : ''}>
                <div class="grow"><strong>Use a new address</strong><span class="tiny">Type it in below</span></div>
              </label>
            </div>` : ''}
        </div>

        <form class="card stack ${savedAddresses.length && selectedAddressId ? 'hide' : ''}" id="address-form" novalidate>
          <div class="row-between"><h2 class="h4">${savedAddresses.length ? 'New address' : 'Where should we deliver?'}</h2></div>
          <div class="form-grid">
            ${FIELDS.map(([name, label, type, span, placeholder]) => `
              <div class="field ${span}">
                <label for="f-${name}">${label}</label>
                <input class="input" id="f-${name}" name="${name}" type="${type}" placeholder="${placeholder}" autocomplete="street-address">
                <span class="field-error" data-error="${name}"></span>
              </div>`).join('')}
          </div>
          ${!savedAddresses.length && !cart.isGuest ? `
          <label class="check"><input type="checkbox" id="save-address" checked> Save this address for next time</label>` : ''}
        </form>

        <div class="card stack">
          <h2 class="h4">Delivery method</h2>
          <div class="pay-option is-selected">
            <div class="radio-row">
              <input type="radio" checked disabled>
              <div class="grow">
                <strong style="font-size:14px">Standard delivery</strong>
                <div class="tiny">Arrives in 2–4 days · ${summary.deliveryPaise ? money(summary.deliveryPaise) : 'Free'}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card stack">
          <div class="row-between"><h2 class="h4">Payment method</h2><span class="tiny" style="color:var(--success)">100% secure</span></div>
          <div id="pay-options" class="stack" style="gap:12px"></div>
        </div>
      </div>

      <div class="card summary-card">
        <h2 class="h3">Order summary</h2>
        <div class="stack" style="gap:12px">
          ${items.map((i) => `
            <div class="mini-item">
              ${i.image ? `<img class="art" src="${esc(i.image)}" alt="${esc(i.title)}" style="object-fit:cover">` : productArt({ ...i, gradient: i.gradient }, { className: 'art' })}
              <div class="grow">
                <strong style="font-size:14px">${esc(i.title)}</strong>
                <div class="tiny">${esc(i.size)} · Qty ${i.qty}</div>
              </div>
              <span style="font-size:14px;font-weight:600">${money(i.lineTotalPaise)}</span>
            </div>`).join('')}
        </div>
        <hr class="divider">
        <div class="stack" style="gap:10px">
          <div class="summary-line"><span>Subtotal</span><strong>${money(summary.subtotalPaise)}</strong></div>
          ${summary.discountPaise ? `<div class="summary-line"><span>Discount ${coupon ? `(${esc(coupon.code)})` : ''}</span><strong style="color:var(--success)">− ${money(summary.discountPaise)}</strong></div>` : ''}
          <div class="summary-line"><span>Delivery</span><strong>${summary.deliveryPaise ? money(summary.deliveryPaise) : 'Free'}</strong></div>
          <div class="summary-line"><span>Tax (GST)</span><strong>${money(summary.taxPaise || 0)}</strong></div>
          <hr class="divider">
          <div class="summary-line"><span class="summary-total">Total payable</span><span class="summary-total">${money(summary.totalPaise)}</span></div>
        </div>
        ${cart.isGuest ? `
        <div class="field">
          <label for="guest-email">Email for your receipt</label>
          <input class="input" id="guest-email" type="email" placeholder="you@example.com" required>
          <span class="hint">You can check out as a guest — no account needed.</span>
        </div>` : ''}
        <button class="btn btn-primary btn-lg btn-block" type="button" id="place-order">Place order · ${money(summary.totalPaise)}</button>
        <p class="tiny">By placing this order you agree to our Terms of Service and Refund Policy.</p>
      </div>
    </div>`;

  renderPayments();

  qsa('[data-address]').forEach((label) => label.addEventListener('click', () => {
    const value = label.dataset.address;
    selectedAddressId = value === 'new' ? null : Number(value);
    qsa('[data-address]').forEach((l) => l.classList.toggle('is-selected', l === label));
    qs('#address-form').classList.toggle('hide', selectedAddressId !== null);
  }));

  qs('#place-order').addEventListener('click', placeOrder);
}

function renderPayments() {
  const options = [
    ['upi', 'UPI', 'Google Pay, PhonePe, Paytm, BHIM', true],
    ['card', 'Credit / debit card', 'Visa, Mastercard, RuPay', false],
    ['cod', 'Cash on delivery', 'Pay when your order arrives', false],
  ];
  qs('#pay-options').innerHTML = options.map(([value, title, sub, hasField]) => `
    <label class="pay-option ${paymentMethod === value ? 'is-selected' : ''}" data-pay="${value}">
      <div class="radio-row">
        <input type="radio" name="payment" value="${value}" ${paymentMethod === value ? 'checked' : ''}>
        <div class="grow">
          <strong style="font-size:14px">${title}</strong>
          <div class="tiny">${sub}</div>
        </div>
      </div>
      ${hasField && paymentMethod === value ? `<input class="input" id="vpa" placeholder="yourname@upi" aria-label="UPI ID">` : ''}
    </label>`).join('');

  qsa('[data-pay] input').forEach((el) => el.addEventListener('change', () => {
    paymentMethod = el.value;
    renderPayments();
  }));
}

function collectAddress() {
  if (selectedAddressId) {
    const a = savedAddresses.find((x) => x.id === selectedAddressId);
    if (a) return { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state, pincode: a.pincode };
  }
  const data = {};
  let ok = true;
  for (const [name] of FIELDS) {
    const input = qs(`#f-${name}`);
    const value = input.value.trim();
    data[name] = value;
    const errorEl = qs(`[data-error="${name}"]`);
    errorEl.textContent = '';

    if (['fullName', 'phone', 'line1', 'city', 'state', 'pincode'].includes(name) && !value) {
      errorEl.textContent = 'This field is required';
      ok = false;
    } else if (name === 'pincode' && !/^[1-9][0-9]{5}$/.test(value)) {
      errorEl.textContent = 'Enter a valid 6-digit pincode';
      ok = false;
    } else if (name === 'phone' && !/^[+0-9][0-9\s-]{7,16}$/.test(value)) {
      errorEl.textContent = 'Enter a valid phone number';
      ok = false;
    }
  }
  if (!ok) {
    qs('#address-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return null;
  }
  return data;
}

async function placeOrder(event) {
  const address = collectAddress();
  if (!address) { toast('Please check the delivery address', 'error'); return; }

  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  try {
    const body = { address, paymentMethod, couponCode: cart.coupon?.code };
    if (paymentMethod === 'upi') body.vpa = qs('#vpa')?.value.trim() || '';
    if (cart.isGuest) body.guestEmail = qs('#guest-email')?.value.trim() || '';
    if (qs('#save-address')?.checked) body.saveAddress = true;
    const { order } = await api.createOrder(body);
    store.setCoupon('');
    store.setCartCount(0);
    location.href = `/order.html?ref=${encodeURIComponent(order.reference)}`;
  } catch (err) {
    handleError(err);
    btn.disabled = false;
    btn.textContent = `Place order · ${money(cart.summary.totalPaise)}`;
  }
}

async function init() {
  try {
    cart = await api.cart(store.coupon || undefined);
    if (!cart.items.length) { location.href = '/cart.html'; return; }

    // Guests check out too; they just have to give an email for the receipt.
    cart.isGuest = !currentUser;
    if (currentUser) {
      const { addresses } = await api.addresses();
      savedAddresses = addresses;
      selectedAddressId = addresses.find((a) => a.isDefault)?.id ?? null;
    }
    render();
  } catch (err) {
    handleError(err);
  }
}

init();
