/**
 * Payment gateway adapter.
 *
 * The store ships with a deterministic mock gateway so the whole checkout flow
 * works end to end without live keys. Swap `charge()` for Razorpay/Stripe when
 * you go live — the rest of the code only depends on the returned shape.
 */
const FAILURE_PREFIX = 'fail_';

export const SUPPORTED_METHODS = ['upi', 'card', 'cod'];

export async function charge({ method, amountPaise, reference, vpa }) {
  if (!SUPPORTED_METHODS.includes(method)) {
    return { ok: false, status: 'failed', reason: 'Unsupported payment method' };
  }

  if (method === 'cod') {
    return { ok: true, status: 'pending', gatewayRef: `cod_${reference}` };
  }

  if (method === 'upi' && vpa && String(vpa).startsWith(FAILURE_PREFIX)) {
    return { ok: false, status: 'failed', reason: 'UPI collect request was declined' };
  }

  if (amountPaise <= 0) {
    return { ok: false, status: 'failed', reason: 'Invalid amount' };
  }

  return { ok: true, status: 'paid', gatewayRef: `pay_${reference}`, method };
}

export async function refund({ reference, amountPaise }) {
  return { ok: true, status: 'refunded', gatewayRef: `rfnd_${reference}`, amountPaise };
}
