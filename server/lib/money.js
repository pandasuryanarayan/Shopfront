/** All money is stored and transported as integer paise to avoid float drift. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

export const formatINR = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format((paise || 0) / 100);

export const percentOff = (mrpPaise, pricePaise) => {
  if (!mrpPaise || mrpPaise <= pricePaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
};
