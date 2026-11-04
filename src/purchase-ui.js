export function initializePurchaseUI({snapshotState,renderCanvas}, catalog) {
  const {ACRYLIC_PRODUCTS,ACCESSORIES,COLLECTIBLE_CARD,SHIKISHI_PRODUCT,BUNDLE_PRESETS,quoteProductBundle,buildAcrylicDesignDraft,formatYuan:yuan}=catalog;
  const anchor=document.querySelector('#acrylic-preview-card')||document.querySelector('.preview-card');
  if(!anchor)return;
  const section=document.createElement('section');section.className='card custom-order-card';section.id='custom-order';
  section.innerHTML=`
    <header class="purchase-intro"><div><p class="purchase-eyebrow">MAIMAI DIY · 定制周边</p><h2>你的设计。<br><span>你的专属收藏。</span></h2></div><div class="purchase-perks"><span>沿用你的最新设计</span><span>每单运费 ¥5</span></div></header>
    <div class="purchase-section-title"><h3>选个组合。<span>轻松配齐。</span></h3><label class="newcomer-choice"><input id="acrylic-newcomer" type="checkbox"><span>使用新人价</span><span class="newcomer-switch" aria-hidden="true"></span></label></div>
    <div id="bundle-presets" class="bundle-presets" role="group" aria-label="快捷套餐"></div>
    <div class="purchase-layout"><div class="purchase-products"><h3 class="purchase-custom-title">按你喜欢的方式搭配。</h3>
      <article class="purchase-product" data-product="acrylic">
        <div class="purchase-product-head"><div class="purchase-art acrylic-art" aria-hidden="true"><canvas width="320" height="134"></canvas></div><label class="purchase-toggle"><input id="buy-acrylic" type="checkbox" checked><span><strong>亚克力砖</strong><span class="purchase-product-caption">通透厚实，让设计立体呈现。</span><span id="acrylic-product-price" class="purchase-unit-price"></span></span></label><label class="purchase-quantity">数量<input id="acrylic-quantity" type="number" min="1" max="99" step="1" value="1" inputmode="numeric"></label></div>
        <div class="purchase-options"><div><p class="finish-label">选择你的工艺。</p><select id="acrylic-variant" aria-label="亚克力砖工艺" hidden><option value="basic">基础款</option><option value="light">轻量特效款</option><option value="premium" selected>高配特效款</option></select><div class="finish-options" role="group" aria-label="亚克力砖工艺"></div></div><label class="accessory-choice">搭配配件<select id="acrylic-accessory"><option value="none">不加配件</option><option value="clearStand">透明托架 · +¥4/件</option></select></label></div>
      </article>
      <article class="purchase-product" data-product="card">
        <div class="purchase-product-head"><div class="purchase-art laser-art" aria-hidden="true"><canvas width="320" height="134"></canvas></div><label class="purchase-toggle"><input id="buy-card" type="checkbox"><span><strong>镭射票</strong><span class="purchase-product-caption">轻薄随行，换个角度看光彩。</span><span id="card-product-price" class="purchase-unit-price"></span></span></label><label class="purchase-quantity">数量<input id="acrylic-cards" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" disabled></label></div>
      </article>
      <article class="purchase-product" data-product="shikishi">
        <div class="purchase-product-head"><div class="purchase-art paper-art" aria-hidden="true"><canvas width="320" height="134"></canvas></div><label class="purchase-toggle"><input id="buy-shikishi" type="checkbox"><span><strong>色纸</strong><span class="purchase-product-caption">细腻纸感，收藏每一份热爱。</span><span id="shikishi-product-price" class="purchase-unit-price">¥19.99 / 张 · 新人 ¥16.99</span></span></label><label class="purchase-quantity">数量<input id="shikishi-quantity" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" disabled></label></div>
      </article>
    </div><aside class="purchase-receipt" aria-label="费用明细">
      <p class="receipt-eyebrow">为你搭配好了</p><h3>你的定制方案</h3><p id="purchase-item-count" class="purchase-item-count"></p><div id="purchase-lines"></div>
      <p id="acrylic-discount" class="purchase-savings"></p>
      <div class="purchase-total"><span id="purchase-total-label">参考合计</span><strong id="acrylic-total" aria-live="polite"></strong></div>
      <p id="purchase-message" class="purchase-message" role="status"></p>
      <div class="custom-order-actions"><button id="acrylic-export" class="button primary" type="button">保存定制方案</button><button class="button secondary" type="button" disabled>在线下单尚未开放</button></div>
    </aside></div>`;
  anchor.insertAdjacentElement('afterend',section);
  const get=id=>section.querySelector('#'+id);
  const variant=get('acrylic-variant'),accessory=get('acrylic-accessory'),newcomer=get('acrylic-newcomer');
  const products=[{key:'acrylic',check:get('buy-acrylic'),input:get('acrylic-quantity')},{key:'card',check:get('buy-card'),input:get('acrylic-cards')},{key:'shikishi',check:get('buy-shikishi'),input:get('shikishi-quantity')}];
  const presetButtons=new Map();
  const finishDescriptions={basic:'清晰彩印',light:'局部 UV · 背景闪粉',premium:'双面印刷 · 加密闪粉'};
  for(const [id,product] of Object.entries(ACRYLIC_PRODUCTS)) {
    const button=document.createElement('button');button.type='button';button.dataset.finish=id;button.setAttribute('aria-pressed',String(id===variant.value));
    button.innerHTML=`<strong>${product.label}</strong><span>${finishDescriptions[id]}</span><span class="finish-price"></span>`;
    button.addEventListener('click',()=>{variant.value=id;variant.dispatchEvent(new window.Event('change',{bubbles:true}));});
    section.querySelector('.finish-options').append(button);
  }
  function updateArtwork() {
    for(const canvas of section.querySelectorAll('.purchase-art canvas')) {
      canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
      if(renderCanvas)canvas.getContext('2d').drawImage(renderCanvas,0,0,canvas.width,canvas.height);
    }
  }
  document.addEventListener('order-design-ready',updateArtwork);
  updateArtwork();
  let lastPreviewProduct;
  for(const [id,preset] of Object.entries(BUNDLE_PRESETS)) {
    const button=document.createElement('button');button.type='button';button.dataset.bundle=id;button.setAttribute('aria-pressed','false');
    const title=document.createElement('strong');title.textContent=preset.label;
    const description=document.createElement('span');description.textContent=preset.description;
    const price=document.createElement('span');price.className='bundle-price';
    button.append(title,description,price);get('bundle-presets').append(button);presetButtons.set(id,button);
    button.addEventListener('click',()=>{
      const counts=[preset.quantity,preset.cardQuantity,preset.shikishiQuantity];
      products.forEach((product,i)=>{product.check.checked=counts[i]>0;product.input.value=String(counts[i]||1);});
      accessory.value=preset.accessory;
      refresh();section.dispatchEvent(new window.Event('change',{bubbles:true}));
    });
  }
  function selection() {
    return {variant:variant.value,quantity:products[0].check.checked?Number(products[0].input.value):0,
      accessory:products[0].check.checked?accessory.value:'none',
      cardQuantity:products[1].check.checked?Number(products[1].input.value):0,
      shikishiQuantity:products[2].check.checked?Number(products[2].input.value):0,newCustomer:newcomer.checked};
  }
  function addLine(label,fen,discount=false) {
    const row=document.createElement('div');row.className='purchase-line'+(discount?' is-discount':'');
    const name=document.createElement('span');name.textContent=label;const value=document.createElement('span');value.textContent=(fen<0?'-':'')+'¥'+yuan(Math.abs(fen));
    row.append(name,value);get('purchase-lines').append(row);
  }
  function refresh() {
    products.forEach(product=>{product.input.disabled=!product.check.checked;section.querySelector(`[data-product="${product.key}"]`).classList.toggle('is-selected',product.check.checked);});
    variant.disabled=accessory.disabled=!products[0].check.checked;
    section.querySelector('.purchase-options').hidden=variant.disabled;
    for(const button of section.querySelectorAll('[data-finish]')) {
      const product=ACRYLIC_PRODUCTS[button.dataset.finish];button.disabled=variant.disabled;
      button.setAttribute('aria-pressed',String(button.dataset.finish===variant.value));
      button.querySelector('.finish-price').textContent='¥'+yuan(newcomer.checked?product.newcomerPriceFen:product.priceFen);
    }
    get('acrylic-product-price').textContent=`¥${yuan(newcomer.checked?ACRYLIC_PRODUCTS[variant.value].newcomerPriceFen:ACRYLIC_PRODUCTS[variant.value].priceFen)} / 块`;
    get('card-product-price').textContent=`¥${yuan(COLLECTIBLE_CARD.priceFen)} / 张 · 镭射覆膜`;
    get('shikishi-product-price').textContent=newcomer.checked?`新人 ¥${yuan(SHIKISHI_PRODUCT.newcomerPriceFen)} / 张 · 原价 ¥${yuan(SHIKISHI_PRODUCT.priceFen)}`:`¥${yuan(SHIKISHI_PRODUCT.priceFen)} / 张 · 新人 ¥${yuan(SHIKISHI_PRODUCT.newcomerPriceFen)}`;
    const selected=selection();
    const selectedPreview=selected.quantity>0?'acrylic':selected.cardQuantity>0?'card':selected.shikishiQuantity>0?'shikishi':null;
    if(selectedPreview&&selectedPreview!==lastPreviewProduct) {
      lastPreviewProduct=selectedPreview;
      section.dispatchEvent(new window.CustomEvent('order-selection',{bubbles:true,detail:{product:selectedPreview}}));
    }
    for(const [id,button] of presetButtons) {
      const preset=BUNDLE_PRESETS[id];
      const matches=['quantity','cardQuantity','shikishiQuantity','accessory'].every(key=>selected[key]===preset[key]);
      button.setAttribute('aria-pressed',String(matches));
      const quote=quoteProductBundle({...preset,variant:variant.value,newCustomer:newcomer.checked});
      button.querySelector('.bundle-price').textContent=`¥${yuan(quote.totalFen)}${quote.shippingPending?'＋待定运费':''}`;
    }
    get('purchase-lines').replaceChildren();
    try {
      const quote=quoteProductBundle(selected);
      get('purchase-item-count').textContent=`${quote.quantity+quote.cardQuantity+quote.shikishiQuantity} 件定制周边`;
      if(quote.quantity)addLine(`${ACRYLIC_PRODUCTS[quote.variant].label}亚克力砖 × ${quote.quantity}`,quote.bodyFen);
      if(quote.quantity&&quote.accessory!=='none')addLine(`透明托架 × ${quote.quantity}`,ACCESSORIES[quote.accessory].priceFen*quote.quantity);
      if(quote.cardQuantity)addLine(`镭射票 × ${quote.cardQuantity}`,COLLECTIBLE_CARD.priceFen*quote.cardQuantity);
      if(quote.shikishiQuantity)addLine(`色纸 × ${quote.shikishiQuantity}`,quote.shikishiFen);
      if(quote.comboDiscountFen)addLine('组合优惠',-quote.comboDiscountFen,true);
      if(quote.shippingFen)addLine('运费',quote.shippingFen);
      else if(!quote.shippingPending)addLine('运费',0);
      get('acrylic-total').textContent='¥'+yuan(quote.totalFen);
      get('purchase-total-label').textContent=quote.shippingPending?'商品金额':'参考合计';
      get('acrylic-discount').textContent=quote.discountFen?`新人已省 ¥${yuan(quote.discountFen)}`:'';
      get('purchase-message').textContent=quote.shippingPending?'色纸单独寄送的运费待确认，以上为商品金额。':'';
      get('acrylic-export').disabled=false;
    } catch(error) {
      get('purchase-item-count').textContent='尚未选择商品';get('acrylic-total').textContent='—';get('acrylic-discount').textContent='';get('purchase-message').textContent=error.message;
      get('acrylic-export').disabled=true;
    }
  }
  for(const control of section.querySelectorAll('input,select')) {control.addEventListener('input',refresh);control.addEventListener('change',refresh);}
  get('acrylic-export').addEventListener('click',()=>{
    try {
      const draft=buildAcrylicDesignDraft({state:snapshotState(),...selection()});
      draft.previewAvailableInEditor=Boolean(renderCanvas);
      const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='maimaidiy-custom-draft.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){get('purchase-message').textContent=error.message||'无法保存定制方案';}
  });
  refresh();
}
