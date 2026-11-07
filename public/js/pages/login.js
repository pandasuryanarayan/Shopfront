import { api } from '../api.js';
import { mountChrome, boot, qs, qsa, toast, icon } from '../ui.js';
import { store } from '../store.js';

// Resolve the surface first: the header must know whether its shop links stay
// on this origin or cross to the storefront.
const health = await fetch('/healthz').then((r) => r.json()).catch(() => ({ surface: 'store' }));
const isAdminSurface = health.surface === 'admin';

mountChrome({ storeUrl: isAdminSurface ? health.storeUrl || '' : '' });
boot();

const panel = qs('#auth-panel');
const next = new URLSearchParams(location.search).get('next') || '/';
let mode = 'login';

if (isAdminSurface) {
  const heading = qs('.auth-wrap h1.display');
  const blurb = qs('.auth-wrap .lead');
  if (heading) heading.innerHTML = 'Store operations,<br>one place.';
  if (blurb) blurb.textContent = 'Sign in with your administrator account to manage orders, stock and pricing. This panel has its own session — you can stay signed in here and as a customer in the shop at the same time.';
}

const BENEFITS = isAdminSurface
  ? [
      ['box', 'Orders in one queue', 'Move any order through packing to delivery.'],
      ['spark', 'Live numbers', 'Revenue, AOV and conversion at a glance.'],
      ['refresh', 'Catalogue control', 'Stock, pricing and archiving without a deploy.'],
    ]
  : [
      ['box', 'Track every order', 'Live status from packing to delivery.'],
      ['spark', 'One-tap checkout', 'Saved addresses, no re-typing.'],
      ['refresh', 'Easy returns', '7-day returns with free pickup.'],
    ];

qs('#benefits').innerHTML = BENEFITS.map(([name, title, sub]) => `
  <div class="row" style="gap:12px">
    <div class="trust-icon">${icon(name, 18)}</div>
    <div><strong style="font-size:14px">${title}</strong><div class="tiny">${sub}</div></div>
  </div>`).join('');

function render() {
  panel.innerHTML = `
    ${isAdminSurface ? '' : `
    <div class="auth-tabs" role="tablist">
      <button type="button" role="tab" class="${mode === 'login' ? 'is-active' : ''}" data-mode="login">Sign in</button>
      <button type="button" role="tab" class="${mode === 'register' ? 'is-active' : ''}" data-mode="register">Create account</button>
    </div>`}
    <div>
      <h2 class="h2">${isAdminSurface ? 'Admin sign in' : mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p class="tiny">${isAdminSurface
        ? 'Administrator accounts only.'
        : mode === 'login' ? 'Sign in to see your cart and orders.' : 'It takes about 20 seconds.'}</p>
    </div>
    <form class="stack" id="auth-form" novalidate>
      ${mode === 'register' ? `
        <div class="field">
          <label for="name">Full name</label>
          <input class="input" id="name" name="name" autocomplete="name" placeholder="Your name" required>
        </div>` : ''}
      <div class="field">
        <label for="email">Email</label>
        <input class="input" id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input class="input" id="password" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'register' ? 'At least 8 characters' : 'Your password'}" required>
      </div>
      <div class="alert alert-error hide" id="auth-error"></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit" id="auth-submit">
        ${mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
    </form>
    <div class="demo-note">
      <strong>Demo accounts</strong><br>
      ${isAdminSurface
        ? 'Admin: admin@shopfront.in / Admin@1234'
        : 'Customer: demo@shopfront.in / Demo@1234<br>Admin (separate panel): admin@shopfront.in / Admin@1234'}
    </div>`;

  qsa('[data-mode]').forEach((btn) => btn.addEventListener('click', () => { mode = btn.dataset.mode; render(); }));
  qs('#auth-form').addEventListener('submit', submit);
  if (mode === 'login') {
    qs('#email').value = isAdminSurface ? 'admin@shopfront.in' : 'demo@shopfront.in';
    qs('#password').value = isAdminSurface ? 'Admin@1234' : 'Demo@1234';
  }
}

async function submit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = qs('#auth-error');
  const submitBtn = qs('#auth-submit');
  errorBox.classList.add('hide');

  const data = Object.fromEntries(new FormData(form).entries());
  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    const res = mode === 'login' ? await api.login(data) : await api.register(data);
    store.setUser(res.user);
    toast(`Welcome, ${res.user.name.split(' ')[0]}`, 'success');
    if (next !== '/') location.href = next;
    else location.href = res.user.role === 'admin' ? '/mukhiya' : '/';
  } catch (err) {
    errorBox.textContent = err.message || 'Could not sign you in';
    errorBox.classList.remove('hide');
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
    if (err.details?.length) errorBox.textContent = err.details.map((d) => d.message).join(' · ');
  }
}

render();
