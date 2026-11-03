// Commercial-order foundation. No checkout or manufacture is enabled for unlicensed assets.
export const ACRYLIC_PRODUCTS = Object.freeze({
  basic: Object.freeze({ label: '基础款', priceFen: 2999, newcomerPriceFen: 2699, effects: ['uv-color', 'white-ink'] }),
  light: Object.freeze({ label: '轻量特效款', priceFen: 3499, newcomerPriceFen: 2999, effects: ['uv-color', 'white-ink', 'ai-spot-uv'] }),
  premium: Object.freeze({ label: '高配特效款', priceFen: 4499, newcomerPriceFen: 3999, effects: ['uv-color', 'white-ink', 'double-sided-print', 'ai-spot-uv', 'ai-glitter'] }),
});

export const ACCESSORIES = Object.freeze({
  none: Object.freeze({ label: '不加配件', priceFen: 0 }),
  clearStand: Object.freeze({ label: '透明托架', priceFen: 400 }),
  ledBase: Object.freeze({ label: '发光底座', priceFen: 2000 }),
});
export const COLLECTIBLE_CARD = Object.freeze({ label: '镭射收藏卡', priceFen: 1500 });
// Configurable sales prices; these are test prices, not manufacturer quotations.
export function quoteProductBundle({ variant, quantity, accessory = 'none', cardQuantity = 0, newCustomer = false }) {
  if (!Object.hasOwn(ACRYLIC_PRODUCTS, variant)) throw new RangeError('未知主体款式');
  if (!Object.hasOwn(ACCESSORIES, accessory)) throw new RangeError('未知配件');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new RangeError('主体数量须为1～99');
  if (!Number.isSafeInteger(cardQuantity) || cardQuantity < 0 || cardQuantity > 99) throw new RangeError('收藏卡数量须为0～99');
  const bodyOriginalFen = ACRYLIC_PRODUCTS[variant].priceFen * quantity;
  const discounted = Boolean(newCustomer);
  const bodyFen = (discounted ? ACRYLIC_PRODUCTS[variant].newcomerPriceFen : ACRYLIC_PRODUCTS[variant].priceFen) * quantity;
  // Discounts apply only to the acrylic bodies, never to add-ons.
  const extrasFen = ACCESSORIES[accessory].priceFen * quantity + COLLECTIBLE_CARD.priceFen * cardQuantity;
  return Object.freeze({
    variant, quantity, accessory, cardQuantity, newCustomer: Boolean(newCustomer),
    bodyOriginalFen, bodyFen, extrasFen, totalFen: bodyFen + extrasFen,
    discountApplied: discounted, discountFen: bodyOriginalFen - bodyFen,
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

export function buildAcrylicDesignDraft({ state, variant, quantity, newCustomer = false, accessory = 'none', cardQuantity = 0 }) {
  const quote = quoteProductBundle({ variant, quantity, newCustomer, accessory, cardQuantity });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('无效的设计状态');
  }
  // A structured-clone snapshot, not a live reference to the editor.
  return {
    format: 'MaimaiDIY-acrylic-order-draft',
    version: 1,
    status: 'not-for-production-or-payment',
    product: {
      variant,
      quantity,
      accessory,
      cardQuantity,
      widthMm: 120,
      heightMm: 50,
      acrylicThicknessMm: 3,
      effectRequests: [...ACRYLIC_PRODUCTS[variant].effects],
    },
    quote,
    design: JSON.parse(JSON.stringify(state)),
    rightsReview: 'required',
  };
}

function yuan(fen) {
  return (fen / 100).toFixed(2);
}

export function initializeCustomOrder({ snapshotState, renderCanvas }) {
  const anchor = document.querySelector('.preview-card');
  if (!anchor) return;
  const section = document.createElement('section');
  section.className = 'card custom-order-card';
  section.innerHTML = `
    <div class="section-head"><div><h2>亚克力实体定制 · 方案预览</h2>
    <p>当前仅可计算报价并导出方案；未开放购买和商业生产。</p></div></div>
    <div class="custom-order-grid">
      <label>工艺款式<select id="acrylic-variant">
        <option value="basic">基础款 · ¥29.99</option>
        <option value="light">轻量特效款 · ¥34.99（AI局部UV）</option>
        <option value="premium">高配特效款 · ¥44.99（双面印刷＋局部UV＋闪粉）</option>
      </select></label>
      <label>购买数量<input id="acrylic-quantity" type="number" inputmode="numeric" min="1" max="99" step="1" value="1"></label>
      <label>展示配件<select id="acrylic-accessory">
        <option value="none">不加配件</option>
        <option value="clearStand">透明托架 · +¥4/件</option>
        <option value="ledBase">发光底座 · +¥20/件</option>
      </select></label>
      <label>镭射收藏卡数量<input id="acrylic-cards" type="number" min="0" max="99" step="1" value="0"></label>
      <label class="custom-order-check"><input id="acrylic-newcomer" type="checkbox"> 模拟新人专属价</label>
    </div>
    <div class="custom-order-summary" aria-live="polite">
      <span id="acrylic-discount"></span>
      <strong id="acrylic-total"></strong>
    </div>
    <div class="custom-order-actions">
      <button id="acrylic-export" class="button secondary" type="button">导出定制方案草稿</button>
      <button class="button primary" type="button" disabled title="商业授权、订单后端及支付尚未接入">在线下单（尚未开放）</button>
    </div>
    <p class="custom-order-warning">现有舞萌素材为非商业用途。导出方案不代表获得版权许可，不可用于商业印刷、销售或直接推送工厂。</p>
  `;
  anchor.insertAdjacentElement('afterend', section);
  const variant = section.querySelector('#acrylic-variant');
  const quantity = section.querySelector('#acrylic-quantity');
  const newcomer = section.querySelector('#acrylic-newcomer');
  const accessory = section.querySelector('#acrylic-accessory');
  const cards = section.querySelector('#acrylic-cards');
  const total = section.querySelector('#acrylic-total');
  const discount = section.querySelector('#acrylic-discount');
  function readQuote() {
    return quoteProductBundle({
      variant: variant.value, quantity: Number(quantity.value),
      accessory: accessory.value, cardQuantity: Number(cards.value),
      newCustomer: newcomer.checked,
    });
  }
  function refresh() {
    try {
      const quote = readQuote();
      total.textContent = `参考价 ¥${yuan(quote.totalFen)}`;
      discount.textContent = quote.discountApplied
        ? `主体优惠 -¥${yuan(quote.discountFen)} · 新人专属固定价格；配件及卡片不打折`
        : '无主体优惠；配件及卡片单独计价';
      section.querySelector('#acrylic-export').disabled = false;
    } catch {
      total.textContent = '请输入1～99的整数数量';
      discount.textContent = '';
      section.querySelector('#acrylic-export').disabled = true;
    }
  }
  [variant, quantity, accessory, cards, newcomer].forEach((control) => {
    control.addEventListener('input', refresh);
    control.addEventListener('change', refresh);
  });
  section.querySelector('#acrylic-export').addEventListener('click', () => {
    try {
      const draft = buildAcrylicDesignDraft({
        state: snapshotState(),
        variant: variant.value,
        quantity: Number(quantity.value),
        newCustomer: newcomer.checked,
        accessory: accessory.value,
        cardQuantity: Number(cards.value),
      });
      // The current renderer preview is not a manufacturing-ready print/white-ink/cut file.
      // It is intentionally not packaged as one.
      const previewAvailable = Boolean(renderCanvas);
      draft.previewAvailableInEditor = previewAvailable;
      const file = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'maimaidiy-acrylic-draft.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      alert(error.message || '无法导出定制方案');
    }
  });
  refresh();
}
