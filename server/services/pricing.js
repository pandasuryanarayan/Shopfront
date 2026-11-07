import { getSettings } from './settings.js';

/**
 * Applies a coupon to a subtotal. Returns the discount in paise.
 * Discount is always capped so an order can never go negative.
 */
export function couponDiscount(coupon, subtotalPaise) {
  if (!coupon) return 0;
  if (subtotalPaise < coupon.min_subtotal) return 0;
  let discount = coupon.type === 'percent'
    ? Math.round((subtotalPaise * coupon.value) / 100)
    : coupon.value;
  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount);
  return Math.max(0, Math.min(discount, subtotalPaise));
}

export function deliveryFee(subtotalPaise, settings = getSettings()) {
  return subtotalPaise >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFee;
}

export function computeTotals({ subtotalPaise, coupon, settings = getSettings() }) {
  const discount = couponDiscount(coupon, subtotalPaise);
  const taxable = subtotalPaise - discount;
  const delivery = deliveryFee(taxable, settings);
  const tax = Math.round((taxable * settings.taxPercent) / 100);
  return {
    subtotalPaise,
    discountPaise: discount,
    deliveryPaise: delivery,
    taxPaise: tax,
    totalPaise: Math.max(0, taxable + delivery + tax),
  };
}
