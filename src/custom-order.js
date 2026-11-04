import { initializePurchaseUI } from './purchase-ui.js';
// Commercial-order foundation. No checkout or manufacture is enabled for unlicensed assets.
export const ACRYLIC_PRODUCTS = Object.freeze({
  basic: Object.freeze({ label: '基础款', priceFen: 2999, newcomerPriceFen: 2699, effects: ['uv-color', 'white-ink'] }),
  light: Object.freeze({ label: '轻量特效款', priceFen: 3499, newcomerPriceFen: 2999, effects: ['uv-color', 'white-ink', 'ai-spot-uv', 'global-glitter', 'layered-print'] }),
  premium: Object.freeze({ label: '高配特效款', priceFen: 4499, newcomerPriceFen: 3999, effects: ['uv-color', 'white-ink', 'double-sided-print', 'ai-spot-uv', 'ai-glitter', 'global-glitter', 'layered-print'] }),
});

export const ACCESSORIES = Object.freeze({
  none: Object.freeze({ label: '不加配件', priceFen: 0 }),
  clearStand: Object.freeze({ label: '透明托架', priceFen: 400 }),
});
export const COLLECTIBLE_CARD = Object.freeze({ label: '镭射收藏卡', priceFen: 1499 });
export const SHIKISHI_PRODUCT = Object.freeze({ label: '色纸', priceFen: 1999, newcomerPriceFen: 1699 });
export const SHIKISHI_SHIPPING_POLICY = 'shared';
export const BUNDLE_PRESETS = Object.freeze({
  shikishi: Object.freeze({ label:'色纸单品', description:'1 张色纸', quantity:0, cardQuantity:0, shikishiQuantity:1, accessory:'none' }),
  card: Object.freeze({ label:'镭射票单品', description:'1 张镭射票', quantity:0, cardQuantity:1, shikishiQuantity:0, accessory:'none' }),
  display: Object.freeze({ label:'桌面展示', description:'亚克力砖＋透明托架', quantity:1, cardQuantity:0, shikishiQuantity:0, accessory:'clearStand' }),
  duo: Object.freeze({ label:'双品收藏', description:'亚克力砖＋镭射票', quantity:1, cardQuantity:1, shikishiQuantity:0, accessory:'none' }),
  complete: Object.freeze({ label:'全收藏套餐', description:'砖＋托架＋镭射票＋色纸', quantity:1, cardQuantity:1, shikishiQuantity:1, accessory:'clearStand' }),
});
// Configurable sales prices; these are test prices, not manufacturer quotations.
export const CARD_ONLY_SHIPPING_FEN = 500;
export const COMBO_DISCOUNTS = Object.freeze({ standFen: 100, cardFen: 200 });

export function quoteProductBundle({ variant, quantity, accessory = 'none', cardQuantity = 0, shikishiQuantity = 0, newCustomer = false }) {
  if (!Object.hasOwn(ACRYLIC_PRODUCTS, variant)) throw new RangeError('未知主体款式');
  if (!Object.hasOwn(ACCESSORIES, accessory)) throw new RangeError('未知配件');
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99) throw new RangeError('主体数量须为0～99');
  if (!Number.isSafeInteger(cardQuantity) || cardQuantity < 0 || cardQuantity > 99) throw new RangeError('收藏卡数量须为0～99');
  if (!Number.isSafeInteger(shikishiQuantity) || shikishiQuantity < 0 || shikishiQuantity > 99) throw new RangeError('色纸数量须为0～99');
  if (quantity === 0 && cardQuantity === 0 && shikishiQuantity === 0) throw new RangeError('请至少选择一件商品');
  if (quantity === 0 && accessory !== 'none') throw new RangeError('托架或底座不可单独购买');
  const bodyOriginalFen = ACRYLIC_PRODUCTS[variant].priceFen * quantity;
  const discounted = Boolean(newCustomer) && (quantity > 0 || shikishiQuantity > 0);
  const bodyFen = (discounted ? ACRYLIC_PRODUCTS[variant].newcomerPriceFen : ACRYLIC_PRODUCTS[variant].priceFen) * quantity;
  // Newcomer prices apply to acrylic and shikishi; cards and accessories keep their prices.
  const extrasFen = ACCESSORIES[accessory].priceFen * quantity + COLLECTIBLE_CARD.priceFen * cardQuantity;
  const shikishiOriginalFen=SHIKISHI_PRODUCT.priceFen*shikishiQuantity;
  const shikishiFen=(newCustomer ? SHIKISHI_PRODUCT.newcomerPriceFen : SHIKISHI_PRODUCT.priceFen)*shikishiQuantity;
  const comboDiscountFen = quantity > 0
    ? (accessory === 'clearStand' ? COMBO_DISCOUNTS.standFen * quantity : 0) + (cardQuantity > 0 ? COMBO_DISCOUNTS.cardFen : 0)
    : 0;
  const shippingPending=false;
  const shippingFen = CARD_ONLY_SHIPPING_FEN; // One fee per order, including mixed bundles.
  return Object.freeze({
    variant, quantity, accessory, cardQuantity, shikishiQuantity, newCustomer: Boolean(newCustomer),
    bodyOriginalFen, bodyFen, extrasFen, shikishiOriginalFen, shikishiFen, comboDiscountFen, shippingFen, shippingPending,
    totalFen: bodyFen + extrasFen + shikishiFen - comboDiscountFen + shippingFen,
    discountApplied: discounted, discountFen: bodyOriginalFen - bodyFen + shikishiOriginalFen - shikishiFen,
    discountReason: discounted ? 'new-customer' : null,
    currency: 'CNY',
  });
}

export function quoteAcrylicOrder({ variant, quantity, newCustomer = false }) {
  if (!Object.hasOwn(ACRYLIC_PRODUCTS, variant)) throw new RangeError('未知商品款式');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new RangeError('数量必须为1至99之间的整数');
  }
  const unitFen = ACRYLIC_PRODUCTS[variant].priceFen;
  const discountApplied = Boolean(newCustomer);
  const originalFen = unitFen * quantity;
  const totalFen = (discountApplied ? ACRYLIC_PRODUCTS[variant].newcomerPriceFen : unitFen) * quantity;
  return Object.freeze({
    variant, quantity, unitFen, originalFen, totalFen,
    discountApplied, discountReason: discountApplied ? 'new-customer' : null,
    currency: 'CNY',
  });
}

export function buildAcrylicDesignDraft({ state, variant, quantity, newCustomer = false, accessory = 'none', cardQuantity = 0, shikishiQuantity = 0 }) {
  const quote = quoteProductBundle({ variant, quantity, newCustomer, accessory, cardQuantity, shikishiQuantity });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('无效的设计状态');
  }
  // A structured-clone snapshot, not a live reference to the editor.
  return {
    format: 'MaimaiDIY-acrylic-order-draft',
    version: 1,
    status: 'not-for-production-or-payment',
    product: {
      type: quantity === 0 ? (cardQuantity>0 ? 'holographic-card' : 'shikishi') : 'acrylic-brick',
      variant: quantity === 0 ? null : variant,
      quantity,
      accessory,
      cardQuantity,
      shikishiQuantity,
      ...(quantity > 0 ? {
        widthMm: 120,
        heightMm: 50,
        acrylicThicknessMm: 15,
        effectRequests: [...ACRYLIC_PRODUCTS[variant].effects],
      } : {}),
    },
    quote,
    items: [
      ...(quantity>0 ? [{type:'acrylic-brick',variant,quantity,totalFen:quote.bodyFen}] : []),
      ...(quantity>0 && accessory!=='none' ? [{type:'clear-stand',quantity,totalFen:ACCESSORIES[accessory].priceFen*quantity}] : []),
      ...(cardQuantity>0 ? [{type:'holographic-card',quantity:cardQuantity,totalFen:COLLECTIBLE_CARD.priceFen*cardQuantity}] : []),
      ...(shikishiQuantity>0 ? [{type:'shikishi',quantity:shikishiQuantity,totalFen:quote.shikishiFen}] : []),
    ],
    design: JSON.parse(JSON.stringify(state)),
    rightsReview: 'required',
  };
}

function yuan(fen) {
  return (fen / 100).toFixed(2);
}

export function initializeCustomOrder(options) {
  return initializePurchaseUI(options,{ACRYLIC_PRODUCTS,ACCESSORIES,COLLECTIBLE_CARD,SHIKISHI_PRODUCT,BUNDLE_PRESETS,quoteProductBundle,buildAcrylicDesignDraft,formatYuan:yuan});
}
