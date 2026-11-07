import { percentOff } from './money.js';

export function productDto(row, sizes = [], images = [], variants = []) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    discountPercent: percentOff(row.mrp_paise, row.price_paise),
    stock: row.stock,
    inStock: row.stock > 0,
    rating: row.rating,
    ratingCount: row.rating_count,
    gradient: [row.gradient_from, row.gradient_to],
    badge: row.badge,
    sizes: sizes.map((s) => ({ label: s.label, stock: s.stock, inStock: s.stock > 0 })),
    images: images.map((i) => ({ url: i.url, alt: i.alt })),
    image: images[0]?.url || null,
    colours: variants.map((v) => ({ name: v.colour, hex: v.colour_hex, stock: v.stock, inStock: v.stock > 0 })),
  };
}

export function userDto(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function orderDto(row, items = []) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotalPaise: row.subtotal_paise,
    discountPaise: row.discount_paise,
    deliveryPaise: row.delivery_paise,
    totalPaise: row.total_paise,
    couponCode: row.coupon_code,
    guestEmail: row.guest_email || null,
    address: JSON.parse(row.address_json),
    createdAt: row.created_at,
    items,
  };
}

export function orderItemDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    size: row.size,
    unitPricePaise: row.unit_price_paise,
    qty: row.qty,
    lineTotalPaise: row.unit_price_paise * row.qty,
  };
}
