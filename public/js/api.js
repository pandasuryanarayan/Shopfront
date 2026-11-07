export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('You appear to be offline. Check your connection.', 0, 'NETWORK');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = data.error || {};
    throw new ApiError(error.message || 'Something went wrong', res.status, error.code, error.details);
  }
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') search.set(k, v);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  // auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // catalogue
  categories: () => request('/categories'),
  products: (params) => request(`/products${qs(params)}`),
  product: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  addReview: (slug, body) => request(`/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body }),

  // cart
  cart: (coupon) => request(`/cart${qs({ coupon })}`),
  addToCart: (body) => request('/cart', { method: 'POST', body }),
  updateCartItem: (id, qty) => request(`/cart/${id}`, { method: 'PATCH', body: { qty } }),
  removeCartItem: (id) => request(`/cart/${id}`, { method: 'DELETE' }),
  applyCoupon: (body) => request('/cart/coupon', { method: 'POST', body }),

  // orders
  createOrder: (body) => request('/orders', { method: 'POST', body }),
  orders: () => request('/orders'),
  order: (reference) => request(`/orders/${encodeURIComponent(reference)}`),
  cancelOrder: (reference) => request(`/orders/${encodeURIComponent(reference)}/cancel`, { method: 'POST' }),

  // admin
  adminStats: () => request('/admin/stats'),
  adminProducts: (q) => request(`/admin/products${qs({ q })}`),
  adminCreateProduct: (body) => request('/admin/products', { method: 'POST', body }),
  adminUpdateProduct: (id, body) => request(`/admin/products/${id}`, { method: 'PATCH', body }),
  adminArchiveProduct: (id) => request(`/admin/products/${id}`, { method: 'DELETE' }),
  adminOrders: (status) => request(`/admin/orders${qs({ status })}`),
  adminSetOrderStatus: (reference, status) => request(`/admin/orders/${encodeURIComponent(reference)}/status`, { method: 'PATCH', body: { status } }),
};
