import { initializePurchaseUI } from './purchase-ui.js';
import { ACRYLIC_PRODUCTS, ACCESSORIES, COLLECTIBLE_CARD, SHIKISHI_PRODUCT, BUNDLE_PRESETS, quoteProductBundle, buildAcrylicDesignDraft } from './product-catalog.js';
export * from './product-catalog.js';
function yuan(fen) { return (fen / 100).toFixed(2); }
export function initializeCustomOrder(options) {
  return initializePurchaseUI(options, { ACRYLIC_PRODUCTS, ACCESSORIES, COLLECTIBLE_CARD, SHIKISHI_PRODUCT, BUNDLE_PRESETS, quoteProductBundle, buildAcrylicDesignDraft, formatYuan: yuan });
}