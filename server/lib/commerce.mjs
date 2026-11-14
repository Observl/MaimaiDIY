import { createHash, randomUUID } from 'node:crypto';

export const PRICE_TABLE = Object.freeze({
  basic: 2999, light: 3499, premium: 4499, none: 0, clearStand: 400,
  holographicCard: 1499,
});

function positiveCount(value, min, max, field) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw Object.assign(new Error(`${field} must be between ${min} and ${max}`), { status: 400 });
  }
  return value;
}

export const NEWCOMER_PRICE_TABLE = Object.freeze({ basic: 2699, light: 2999, premium: 3999 });

export function calculateQuote({ variant, quantity, accessory = 'none', cardQuantity = 0, eligibleNewCustomer = false }) {
  if (!['basic', 'light', 'premium'].includes(variant) || !['none', 'clearStand'].includes(accessory)) {
    throw Object.assign(new Error('Unknown product'), { status: 400 });
  }
  positiveCount(quantity, 0, 99, 'quantity');
  positiveCount(cardQuantity, 0, 99, 'cardQuantity');
  if (quantity === 0 && cardQuantity === 0) throw Object.assign(new Error('Empty order'), { status: 400 });
  if (quantity === 0 && accessory !== 'none') throw Object.assign(new Error('Accessory requires acrylic block'), { status: 400 });
  const subtotalFen = PRICE_TABLE[variant] * quantity;
  const hasDiscount = Boolean(eligibleNewCustomer) && quantity > 0;
  const discountFen = hasDiscount ? (PRICE_TABLE[variant] - NEWCOMER_PRICE_TABLE[variant]) * quantity : 0;
  const addonsFen = PRICE_TABLE[accessory] * quantity + PRICE_TABLE.holographicCard * cardQuantity;
  const comboDiscountFen = quantity > 0 ? (accessory === 'clearStand' ? 100 * quantity : 0) + (cardQuantity > 0 ? 200 : 0) : 0;
  const shippingFen = quantity === 0 ? 400 : 0;
  return {
    variant, quantity, accessory, cardQuantity,
    subtotalFen, discountFen, addonsFen, comboDiscountFen, shippingFen, totalFen: subtotalFen - discountFen + addonsFen - comboDiscountFen + shippingFen,
    currency: 'CNY', discountType: hasDiscount ? 'newcomer' : null,
  };
}

export function validateDesign(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Invalid design'), { status: 400 });
  }
  const serialized = JSON.stringify(value);
  if (!serialized || Buffer.byteLength(serialized) > 1024 * 1024) {
    throw Object.assign(new Error('Design too large'), { status: 413 });
  }
  // Submitted materials remain unapproved until independently reviewed.
  return JSON.parse(serialized);
}

export function createDesignRecord(design, userId) {
  const payload = validateDesign(design);
  const designId = randomUUID();
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { id: designId, ownerId: userId, payload, digest, rightsStatus: 'pending' };
}
