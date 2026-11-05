export function initializePurchaseUI({snapshotState,renderCanvas}, catalog) {
  const {ACRYLIC_PRODUCTS,ACCESSORIES,COLLECTIBLE_CARD,SHIKISHI_PRODUCT,BUNDLE_PRESETS,quoteProductBundle,buildAcrylicDesignDraft,formatYuan:yuan}=catalog;
  const anchor=document.querySelector('#acrylic-preview-card')||document.querySelector('.preview-card');
  if(!anchor)return;
  const section=document.createElement('section');section.className='card custom-order-card';section.id='custom-order';
  section.innerHTML=`
    <header class="purchase-intro"><h2>选购定制周边</h2><label class="newcomer-choice"><input id="acrylic-newcomer" type="checkbox"><span>使用新人价</span><span class="newcomer-switch" aria-hidden="true"></span></label></header>
    <div class="purchase-layout"><div class="purchase-products">
      <article class="purchase-product" data-product="acrylic">
        <div class="purchase-product-head"><label class="purchase-toggle"><input id="buy-acrylic" type="checkbox" checked><span><strong>亚克力砖</strong><span id="acrylic-product-price" class="purchase-unit-price"></span></span></label><label class="purchase-quantity">数量<input id="acrylic-quantity" type="number" min="1" max="99" step="1" value="1" inputmode="numeric"></label></div>
        <div class="purchase-options"><div><p class="finish-label">选择你的工艺。</p><select id="acrylic-variant" aria-label="亚克力砖工艺" hidden><option value="basic">基础款</option><option value="effect" selected>特效档</option></select><div class="finish-options" role="group" aria-label="亚克力砖工艺"></div></div><label class="accessory-choice">搭配配件<select id="acrylic-accessory"><option value="none">不加配件</option><option value="clearStand">透明托架 · +¥4/件</option></select></label></div>
      </article>
      <article class="purchase-product" data-product="card">
        <div class="purchase-product-head"><label class="purchase-toggle"><input id="buy-card" type="checkbox"><span><strong>镭射票</strong><span id="card-product-price" class="purchase-unit-price"></span></span></label><label class="purchase-quantity">数量<input id="acrylic-cards" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" disabled></label></div>
      </article>
      <article class="purchase-product" data-product="shikishi">
        <div class="purchase-product-head"><label class="purchase-toggle"><input id="buy-shikishi" type="checkbox"><span><strong>色纸</strong><span id="shikishi-product-price" class="purchase-unit-price">¥19.90 / 张 · 新人 ¥16.90</span></span></label><label class="purchase-quantity">数量<input id="shikishi-quantity" type="number" min="1" max="99" step="1" value="1" inputmode="numeric" disabled></label></div>
      </article>
    </div><aside class="purchase-receipt" aria-label="费用明细">
      <h3>你的定制方案</h3><p id="purchase-item-count" class="purchase-item-count"></p><div id="purchase-lines"></div>
      <p id="acrylic-discount" class="purchase-savings"></p>
      <div class="purchase-total"><span id="purchase-total-label">参考合计</span><strong id="acrylic-total" aria-live="polite"></strong></div>
      <p id="purchase-message" class="purchase-message" role="status"></p>
      <div class="custom-order-actions"><button id="acrylic-export" class="button primary" type="button">保存定制方案</button><button class="button secondary" type="button" disabled>在线下单尚未开放</button></div>
    </aside></div>`;
  anchor.insertAdjacentElement('afterend',section);
  const get=id=>section.querySelector('#'+id);
  const variant=get('acrylic-variant'),accessory=get('acrylic-accessory'),newcomer=get('acrylic-newcomer');
  const products=[{key:'acrylic',check:get('buy-acrylic'),input:get('acrylic-quantity')},{key:'card',check:get('buy-card'),input:get('acrylic-cards')},{key:'shikishi',check:get('buy-shikishi'),input:get('shikishi-quantity')}];
  const configHeaders=new Map(),configPanels=new Map(),configSelections=new Map();
  let activeId='acrylic';
  const editor=section.querySelector('.purchase-products');
  const bundleControl=document.createElement('label');bundleControl.className='bundle-quantity';bundleControl.innerHTML='套餐份数<input id="bundle-quantity" aria-label="套餐份数" type="number" min="1" max="99" step="1" value="1" inputmode="numeric">';editor.prepend(bundleControl);
  const bundleInput=bundleControl.querySelector('input');
  const isBundle=id=>{const p=BUNDLE_PRESETS[id];return p.quantity+p.cardQuantity+p.shikishiQuantity>1||p.accessory!=='none';};
  for(const product of products){product.count=document.createElement('span');product.count.className='bundle-item-count';product.input.closest('.purchase-product-head').append(product.count);}
  function showPrice(target,current,original,{shipping=null,unit='',offer=false,fromBasic=false}={}) {
    target.replaceChildren();const amount=document.createElement('span');amount.className='price-amount';
    const currentPrice=document.createElement('span');currentPrice.className='price-current';currentPrice.textContent='¥'+yuan(current)+unit;amount.append(currentPrice);
    if(original>current){const old=document.createElement('del');old.className='price-original';old.setAttribute('aria-label','原价 ¥'+yuan(original));old.textContent='¥'+yuan(original);amount.append(old);}
    target.classList.toggle('is-offer',offer||original>current);target.append(amount);
    if(shipping!==null){const delivery=document.createElement('span');delivery.className='price-shipping';delivery.textContent=(fromBasic?'基础款 · ':'')+(shipping?'运费 ¥'+yuan(shipping):'免运费');target.append(delivery);}
  }
  const merchandiseOriginal=quote=>quote.bodyOriginalFen+quote.extrasFen+quote.shikishiOriginalFen;
  const configList=document.createElement('div');configList.className='configuration-list';
  editor.replaceWith(configList);
  const configHeading=document.createElement('h3');configHeading.textContent='选择配置';configList.append(configHeading);
  for(const [id,product] of Object.entries(ACRYLIC_PRODUCTS)) {
    const button=document.createElement('button');button.type='button';button.dataset.finish=id;button.setAttribute('aria-pressed',String(id===variant.value));
    button.innerHTML=`<strong>${product.label}</strong><span class="finish-price"></span>`;
    button.addEventListener('click',()=>{variant.value=id;variant.dispatchEvent(new window.Event('change',{bubbles:true}));});
    editor.querySelector('.finish-options').append(button);
  }
  let imageRenderer, imageGeneration=0, sourceGeneration=0;
  function requestImages() {
    if(!imageRenderer)return;
    const generation=++imageGeneration;
    void (async()=>{
      for(const [id,preset] of Object.entries(BUNDLE_PRESETS)) {
        if(generation!==imageGeneration)return;
        const saved=configSelections.get(id);
        const config={...preset,variant:saved?.variant||variant.value,accessory:saved?.accessory??preset.accessory};
        const source=imageRenderer.render(config);
        for(const image of section.querySelectorAll(`[data-config-image="${id}"]`)) {
          if(image.src!==source)image.src=source;image.hidden=false;
          image.dataset.products=[config.quantity>0?'acrylic':'',config.cardQuantity>0?'card':'',config.shikishiQuantity>0?'shikishi':''].filter(Boolean).join(',');
        }
        await new Promise(resolve=>window.requestAnimationFrame(resolve));
      }
    })().catch(error=>console.warn('商品图片渲染失败',error));
  }
  document.addEventListener('order-render-ready',async event=>{
    const generation=++sourceGeneration;
    try {
      const {createConfigurationImages}=await import('./configuration-images.js');
      if(generation!==sourceGeneration)return;
      imageGeneration++;imageRenderer?.dispose();
      imageRenderer=createConfigurationImages(event.detail.source,event.detail.finishMaps);requestImages();
    }catch(error){console.warn('商品图片暂时不可用',error);}
  });
  let lastPreviewProduct;
  for(const [id,preset] of Object.entries(BUNDLE_PRESETS)) {
    const row=document.createElement('article');row.className='configuration-row';
    const header=document.createElement('button');header.type='button';header.className='configuration-choice';header.dataset.config=id;
    header.id='config-choice-'+id;header.setAttribute('aria-expanded','false');header.setAttribute('aria-controls','config-panel-'+id);
    header.innerHTML=`<img class="configuration-image" data-config-image="${id}" alt="${preset.label}商品渲染图" width="560" height="340" hidden><strong>${preset.label}</strong><span class="config-price"></span><span class="config-expander" aria-hidden="true">＋</span>`;
    const panel=document.createElement('div');panel.className='configuration-panel';panel.id='config-panel-'+id;panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby',header.id);
    row.append(header,panel);configList.append(row);configHeaders.set(id,header);configPanels.set(id,panel);
    header.addEventListener('click',()=>activate(id,true));
  }
  function activate(id,toggle=false) {
    const same=activeId===id;
    const open=!(same&&toggle&&!configPanels.get(id).hidden);
    activeId=id;
    const saved=configSelections.get(id)||{...BUNDLE_PRESETS[id],variant:variant.value};
    const counts=[saved.quantity,saved.cardQuantity,saved.shikishiQuantity];
    const preset=BUNDLE_PRESETS[id],included=[preset.quantity,preset.cardQuantity,preset.shikishiQuantity];
    products.forEach((product,i)=>{product.check.checked=included[i]>0;product.input.value=String(included[i]>0?counts[i]:1);});
    variant.value=saved.variant;accessory.value=saved.accessory;
    bundleInput.value=String(saved.bundleQuantity??1);
    for(const [key,panel] of configPanels) {
      panel.hidden=key!==id||!open;
      configHeaders.get(key).setAttribute('aria-expanded',String(key===id&&open));
      configHeaders.get(key).querySelector('.config-expander').textContent=key===id&&open?'−':'＋';
      configHeaders.get(key).closest('.configuration-row').classList.toggle('is-active',key===id);
    }
    configPanels.get(id).append(editor);
    refresh();section.dispatchEvent(new window.Event('change',{bubbles:true}));
  }
  function selection() {
    return {variant:variant.value,quantity:products[0].check.checked?Number(products[0].input.value):0,
      accessory:products[0].check.checked?accessory.value:'none',
      cardQuantity:products[1].check.checked?Number(products[1].input.value):0,
      shikishiQuantity:products[2].check.checked?Number(products[2].input.value):0,newCustomer:newcomer.checked};
  }
  function addLine(label,fen,discount=false,valueText=null,original=fen) {
    const row=document.createElement('div');row.className='purchase-line'+(discount?' is-discount':'');
    const name=document.createElement('span');name.textContent=label;const value=document.createElement('span');
    if(original>fen&&fen>=0)showPrice(value,fen,original);else value.textContent=valueText||((fen<0?'-':'')+'¥'+yuan(Math.abs(fen)));
    row.append(name,value);get('purchase-lines').append(row);
  }
  function refresh() {
    const bundled=isBundle(activeId),preset=BUNDLE_PRESETS[activeId],sets=Number(bundleInput.value);
    bundleControl.hidden=!bundled;
    if(bundled){[preset.quantity,preset.cardQuantity,preset.shikishiQuantity].forEach((count,i)=>{products[i].input.value=String(count*sets);});accessory.value=preset.accessory;}
    products.forEach(product=>{product.input.disabled=bundled||!product.check.checked;product.input.closest('.purchase-quantity').hidden=bundled;product.count.hidden=!bundled;product.count.textContent='× '+product.input.value;const article=editor.querySelector(`[data-product="${product.key}"]`);article.hidden=!product.check.checked;article.classList.toggle('is-selected',product.check.checked);});
    variant.disabled=accessory.disabled=!products[0].check.checked;
    if(bundled)accessory.disabled=true;
    section.querySelector('.purchase-options').hidden=variant.disabled;
    for(const button of section.querySelectorAll('[data-finish]')) {
      const product=ACRYLIC_PRODUCTS[button.dataset.finish];button.disabled=variant.disabled;
      button.setAttribute('aria-pressed',String(button.dataset.finish===variant.value));
      showPrice(button.querySelector('.finish-price'),newcomer.checked?product.newcomerPriceFen:product.priceFen,product.priceFen);
    }
    showPrice(get('acrylic-product-price'),newcomer.checked?ACRYLIC_PRODUCTS[variant.value].newcomerPriceFen:ACRYLIC_PRODUCTS[variant.value].priceFen,ACRYLIC_PRODUCTS[variant.value].priceFen,{unit:' / 块'});
    get('card-product-price').textContent=`¥${yuan(COLLECTIBLE_CARD.priceFen)} / 张`;
    showPrice(get('shikishi-product-price'),newcomer.checked?SHIKISHI_PRODUCT.newcomerPriceFen:SHIKISHI_PRODUCT.priceFen,SHIKISHI_PRODUCT.priceFen,{unit:' / 张'});
    const selected=selection();
    configSelections.set(activeId,{...selected,bundleQuantity:sets});
    const selectedPreview=selected.quantity>0?'acrylic':selected.cardQuantity>0?'card':selected.shikishiQuantity>0?'shikishi':null;
    if(selectedPreview&&selectedPreview!==lastPreviewProduct) {
      lastPreviewProduct=selectedPreview;
      section.dispatchEvent(new window.CustomEvent('order-selection',{bubbles:true,detail:{product:selectedPreview}}));
    }
    for(const [id,header] of configHeaders) {
      const price=header.querySelector('.config-price');
      try {
        const bundled=isBundle(id);
        const config=bundled?{...BUNDLE_PRESETS[id],variant:'basic'}:{...BUNDLE_PRESETS[id],variant:variant.value,...configSelections.get(id)};
        const quote=quoteProductBundle({...config,newCustomer:newcomer.checked});
        showPrice(price,quote.totalFen-quote.shippingFen,merchandiseOriginal(quote),{shipping:quote.shippingFen,offer:quote.comboDiscountFen>0,unit:bundled?' 起 / 份':'',fromBasic:bundled&&quote.quantity>0});
      } catch {price.textContent='—';}
    }
    get('purchase-lines').replaceChildren();
    try {
      const quote=quoteProductBundle(selected);
      get('purchase-item-count').textContent=(bundled?`${sets} 份套餐 · `:'')+`${quote.quantity+quote.cardQuantity+quote.shikishiQuantity} 件定制周边`;
      if(quote.quantity)addLine(`${ACRYLIC_PRODUCTS[quote.variant].label}亚克力砖 × ${quote.quantity}`,quote.bodyFen,false,null,quote.bodyOriginalFen);
      if(quote.quantity&&quote.accessory!=='none')addLine(`透明托架 × ${quote.quantity}`,ACCESSORIES[quote.accessory].priceFen*quote.quantity);
      if(quote.cardQuantity)addLine(`镭射票 × ${quote.cardQuantity}`,COLLECTIBLE_CARD.priceFen*quote.cardQuantity);
      if(quote.shikishiQuantity)addLine(`色纸 × ${quote.shikishiQuantity}`,quote.shikishiFen,false,null,quote.shikishiOriginalFen);
      if(quote.comboDiscountFen)addLine('组合优惠',-quote.comboDiscountFen,true);
      addLine('商品金额',quote.totalFen-quote.shippingFen,false,null,merchandiseOriginal(quote));
      if(quote.shippingFen)addLine('运费',quote.shippingFen);
      else addLine('运费',0,false,'免运费');
      showPrice(get('acrylic-total'),quote.totalFen,merchandiseOriginal(quote)+quote.shippingFen,{offer:quote.comboDiscountFen>0});
      get('purchase-total-label').textContent='合计（含运费）';
      get('acrylic-discount').textContent=quote.discountFen?`新人已省 ¥${yuan(quote.discountFen)}`:'';
      get('purchase-message').textContent=quote.shippingPending?'色纸单独寄送的运费待确认，以上为商品金额。':'';
      get('acrylic-export').disabled=false;
    } catch(error) {
      get('purchase-item-count').textContent='尚未选择商品';get('acrylic-total').textContent='—';get('acrylic-discount').textContent='';get('purchase-message').textContent=error.message;
      get('acrylic-export').disabled=true;
    }
    requestImages();
  }
  for(const control of new Set([...section.querySelectorAll('input,select'),...editor.querySelectorAll('input,select')])) {control.addEventListener('input',refresh);control.addEventListener('change',refresh);}
  get('acrylic-export').addEventListener('click',()=>{
    try {
      const draft=buildAcrylicDesignDraft({state:snapshotState(),...selection()});
      draft.previewAvailableInEditor=Boolean(renderCanvas);
      const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='maimaidiy-custom-draft.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){get('purchase-message').textContent=error.message||'无法保存定制方案';}
  });
  activate('acrylic');
}

