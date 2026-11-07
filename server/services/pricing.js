import { config } from '../config.js';

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

export function deliveryFee(subtotalPaise) {
  return subtotalPaise >= config.freeDeliveryThresholdPaise ? 0 : config.deliveryFeePaise;
}

export function computeTotals({ subtotalPaise, coupon }) {
  const discount = couponDiscount(coupon, subtotalPaise);
  const taxable = subtotalPaise - discount;
  const delivery = deliveryFee(taxable);
  return {
    subtotalPaise,
    discountPaise: discount,
    deliveryPaise: delivery,
    totalPaise: Math.max(0, taxable + delivery),
  };
}
