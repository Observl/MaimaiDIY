// Commercial-order foundation. No checkout or manufacture is enabled for unlicensed assets.
export const ACRYLIC_PRODUCTS = Object.freeze({
  basic: Object.freeze({ label: '基础款', priceFen: 3000, effects: ['uv-color', 'white-ink'] }),
  special: Object.freeze({ label: '特殊款', priceFen: 4000, effects: ['uv-color', 'white-ink', 'spot-effect'] }),
});

export function quoteAcrylicOrder({ variant, quantity, newCustomer = false }) {
  if (!Object.hasOwn(ACRYLIC_PRODUCTS, variant)) throw new RangeError('未知商品款式');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new RangeError('数量必须为1至99之间的整数');
  }
  const unitFen = ACRYLIC_PRODUCTS[variant].priceFen;
  const discountApplied = Boolean(newCustomer) || quantity >= 5;
  const originalFen = unitFen * quantity;
  const totalFen = discountApplied ? originalFen * 8 / 10 : originalFen;
  return Object.freeze({
    variant, quantity, unitFen, originalFen, totalFen,
    discountApplied, discountReason: discountApplied ? (quantity >= 5 ? 'bulk' : 'new-customer') : null,
    currency: 'CNY',
  });
}

export function buildAcrylicDesignDraft({ state, variant, quantity, newCustomer = false }) {
  const quote = quoteAcrylicOrder({ variant, quantity, newCustomer });
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
        <option value="basic">基础款 · ¥30</option>
        <option value="special">特殊款 · ¥40</option>
      </select></label>
      <label>购买数量<input id="acrylic-quantity" type="number" inputmode="numeric" min="1" max="99" step="1" value="1"></label>
      <label class="custom-order-check"><input id="acrylic-newcomer" type="checkbox"> 模拟新人首单八折</label>
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
  const total = section.querySelector('#acrylic-total');
  const discount = section.querySelector('#acrylic-discount');
  function readQuote() {
    return quoteAcrylicOrder({
      variant: variant.value,
      quantity: Number(quantity.value),
      newCustomer: newcomer.checked,
    });
  }
  function refresh() {
    try {
      const quote = readQuote();
      total.textContent = `参考价 ¥${yuan(quote.totalFen)}`;
      discount.textContent = quote.discountApplied
        ? `原价 ¥${yuan(quote.originalFen)} · ${quote.discountReason === 'bulk' ? '满5件' : '新人'}八折（不叠加）`
        : '未使用折扣';
      section.querySelector('#acrylic-export').disabled = false;
    } catch {
      total.textContent = '请输入1～99的整数数量';
      discount.textContent = '';
      section.querySelector('#acrylic-export').disabled = true;
    }
  }
  [variant, quantity, newcomer].forEach((control) => {
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
