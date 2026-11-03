import { createHash, randomUUID } from 'node:crypto';

export const PRICE_TABLE = Object.freeze({
  basic: 2999, light: 3499, premium: 4499, none: 0, clearStand: 400,
  ledBase: 2000, holographicCard: 1500,
});

function positiveCount(value, min, max, field) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw Object.assign(new Error(`${field} must be between ${min} and ${max}`), { status: 400 });
  }
  return value;
}

export const NEWCOMER_PRICE_TABLE = Object.freeze({ basic: 2699, light: 2999, premium: 3999 });

export function calculateQuote({ variant, quantity, accessory = 'none', cardQuantity = 0, eligibleNewCustomer = false }) {
  if (!['basic', 'light', 'premium'].includes(variant) || !['none', 'clearStand', 'ledBase'].includes(accessory)) {
    throw Object.assign(new Error('Unknown product'), { status: 400 });
  }
  positiveCount(quantity, 1, 99, 'quantity');
  positiveCount(cardQuantity, 0, 99, 'cardQuantity');
  const subtotalFen = PRICE_TABLE[variant] * quantity;
  const hasDiscount = Boolean(eligibleNewCustomer);
  const discountFen = hasDiscount ? (PRICE_TABLE[variant] - NEWCOMER_PRICE_TABLE[variant]) * quantity : 0;
  const addonsFen = PRICE_TABLE[accessory] * quantity + PRICE_TABLE.holographicCard * cardQuantity;
  return {
    variant, quantity, accessory, cardQuantity,
    subtotalFen, discountFen, addonsFen, totalFen: subtotalFen - discountFen + addonsFen,
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
