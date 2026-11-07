const listeners = new Set();

export const store = {
  user: null,
  cartCount: 0,
  coupon: typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sf_coupon') || '' : '',

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit() {
    listeners.forEach((fn) => fn(this));
  },

  setUser(user) {
    this.user = user;
    this.emit();
  },

  setCartCount(count) {
    this.cartCount = count;
    this.emit();
  },

  setCoupon(code) {
    this.coupon = code || '';
    if (this.coupon) sessionStorage.setItem('sf_coupon', this.coupon);
    else sessionStorage.removeItem('sf_coupon');
  },
};
