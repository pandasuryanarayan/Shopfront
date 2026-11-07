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
  twoFactor: (body) => request('/auth/2fa', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  // catalogue
  categories: () => request('/categories'),
  products: (params) => request(`/products${qs(params)}`),
  product: (slug) => request(`/products/${encodeURIComponent(slug)}`),
  searchSuggestions: (q) => request(`/search/suggestions${qs({ q })}`),
  addReview: (slug, body) => request(`/products/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body }),

  // cart
  cart: (coupon) => request(`/cart${qs({ coupon })}`),
  addToCart: (body) => request('/cart', { method: 'POST', body }),
  updateCartItem: (id, qty) => request(`/cart/${id}`, { method: 'PATCH', body: { qty } }),
  removeCartItem: (id) => request(`/cart/${id}`, { method: 'DELETE' }),
  applyCoupon: (body) => request('/cart/coupon', { method: 'POST', body }),

  // wishlist
  wishlist: () => request('/wishlist'),
  wishlistIds: () => request('/wishlist/ids'),
  addToWishlist: (productId) => request('/wishlist', { method: 'POST', body: { productId } }),
  removeFromWishlist: (productId) => request(`/wishlist/${productId}`, { method: 'DELETE' }),

  // addresses
  addresses: () => request('/addresses'),
  createAddress: (body) => request('/addresses', { method: 'POST', body }),
  updateAddress: (id, body) => request(`/addresses/${id}`, { method: 'PATCH', body }),
  deleteAddress: (id) => request(`/addresses/${id}`, { method: 'DELETE' }),

  // orders
  createOrder: (body) => request('/orders', { method: 'POST', body }),
  orders: () => request('/orders'),
  order: (reference) => request(`/orders/${encodeURIComponent(reference)}`),
  cancelOrder: (reference) => request(`/orders/${encodeURIComponent(reference)}/cancel`, { method: 'POST' }),
  requestReturn: (reference, body) => request(`/orders/${encodeURIComponent(reference)}/returns`, { method: 'POST', body }),

  // admin (served under /mukhiya)
  adminStats: (days) => request(`/mukhiya/stats${qs({ days })}`),
  adminConfig: () => request('/mukhiya/config'),
  adminCategories: () => request('/mukhiya/categories'),
  adminCreateCategory: (body) => request('/mukhiya/categories', { method: 'POST', body }),
  adminUpdateCategory: (id, body) => request(`/mukhiya/categories/${id}`, { method: 'PATCH', body }),

  adminProducts: (params) => request(`/mukhiya/products${qs(params)}`),
  adminCreateProduct: (body) => request('/mukhiya/products', { method: 'POST', body }),
  adminUpdateProduct: (id, body) => request(`/mukhiya/products/${id}`, { method: 'PATCH', body }),
  adminArchiveProduct: (id) => request(`/mukhiya/products/${id}`, { method: 'DELETE' }),
  adminRestoreProduct: (id) => request(`/mukhiya/products/${id}/restore`, { method: 'POST' }),
  adminBulkStock: (updates) => request('/mukhiya/products', { method: 'PATCH', body: { updates } }),
  adminProductImages: (id) => request(`/mukhiya/products/${id}/images`),
  adminDeleteImage: (id, imageId) => request(`/mukhiya/products/${id}/images/${imageId}`, { method: 'DELETE' }),

  adminOrders: (params) => request(`/mukhiya/orders${qs(params)}`),
  adminOrder: (ref) => request(`/mukhiya/orders/${encodeURIComponent(ref)}`),
  adminSetOrderStatus: (reference, status) => request(`/mukhiya/orders/${encodeURIComponent(reference)}/status`, { method: 'PATCH', body: { status } }),
  adminRefund: (ref, body) => request(`/mukhiya/orders/${encodeURIComponent(ref)}/refund`, { method: 'POST', body }),

  adminCustomers: (params) => request(`/mukhiya/customers${qs(params)}`),
  adminCustomer: (id) => request(`/mukhiya/customers/${id}`),

  adminCoupons: () => request('/mukhiya/coupons'),
  adminCreateCoupon: (body) => request('/mukhiya/coupons', { method: 'POST', body }),
  adminUpdateCoupon: (code, body) => request(`/mukhiya/coupons/${encodeURIComponent(code)}`, { method: 'PATCH', body }),
  adminDeleteCoupon: (code) => request(`/mukhiya/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  adminSettings: () => request('/mukhiya/settings'),
  adminSaveSettings: (body) => request('/mukhiya/settings', { method: 'PATCH', body }),
  adminAudit: (params) => request(`/mukhiya/audit${qs(params)}`),

  adminStaff: () => request('/mukhiya/staff'),
  adminCreateStaff: (body) => request('/mukhiya/staff', { method: 'POST', body }),
  adminUpdateStaff: (id, body) => request(`/mukhiya/staff/${id}`, { method: 'PATCH', body }),

  admin2fa: () => request('/mukhiya/2fa'),
  admin2faSetup: () => request('/mukhiya/2fa/setup', { method: 'POST' }),
  admin2faEnable: (code) => request('/mukhiya/2fa/enable', { method: 'POST', body: { code } }),
  admin2faDisable: (code) => request('/mukhiya/2fa/disable', { method: 'POST', body: { code } }),
};

/** Image upload is multipart, so it bypasses the JSON request helper. */
export async function uploadProductImage(productId, file) {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`/api/mukhiya/products/${productId}/images`, {
    method: 'POST', body: form, credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error?.message || 'Upload failed', res.status, data?.error?.code);
  return data;
}
