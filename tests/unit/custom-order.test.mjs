import test from 'node:test';
import assert from 'node:assert/strict';
import {ACRYLIC_PRODUCTS,SHIKISHI_PRODUCT,ACCESSORIES,COLLECTIBLE_CARD,BUNDLE_PRESETS,quoteAcrylicOrder,quoteProductBundle,buildAcrylicDesignDraft} from '../../src/custom-order.js';

test('catalog matches saved unified-price workbook',()=>{
 assert.equal(ACRYLIC_PRODUCTS.basic.priceFen,3990);assert.equal(ACRYLIC_PRODUCTS.effect.priceFen,4990);assert.equal(SHIKISHI_PRODUCT.priceFen,2490);assert.equal(COLLECTIBLE_CARD.priceFen,1490);assert.equal(ACCESSORIES.clearStand.priceFen,400);
 for(const p of [...Object.values(ACRYLIC_PRODUCTS),SHIKISHI_PRODUCT])assert.equal(p.newcomerPriceFen,undefined);
 for(const effect of ['white-outline-uv','background-glitter','colored-fine-powder','background-pearl','title-pearl','avatar-pearl','rank-pearl','battle-pearl'])assert.ok(ACRYLIC_PRODUCTS.effect.effects.includes(effect));
});
test('all fixed configurations quote current prices and legacy newcomer flags cannot discount',()=>{
 const expected={acrylic:[3990,4990],card:[1990,1990],shikishi:[2990,2990],duo:[5280,6280],acrylicPaper:[6480,7480],cardPaper:[3980,3980],complete:[8070,9070]};
 assert.equal(BUNDLE_PRESETS.display,undefined);
 for(const [id,p]of Object.entries(BUNDLE_PRESETS))for(const [i,variant]of ['basic','effect'].entries()){
  const q=quoteProductBundle({...p,variant});assert.equal(q.totalFen,expected[id][i]);assert.deepEqual(quoteProductBundle({...p,variant,newCustomer:true}),q);assert.equal(q.discountFen,0);assert.equal(q.discountApplied,false);
  const n=2,two=quoteProductBundle({...p,variant,quantity:p.quantity*n,cardQuantity:p.cardQuantity*n,shikishiQuantity:p.shikishiQuantity*n});
  assert.equal(two.totalFen,(q.totalFen-q.shippingFen)*n);assert.equal(two.comboDiscountFen,q.comboDiscountFen*n);
 }
});
test('shipping is independent, 5 for single card or paper and free for bricks or two items',()=>{
 for(const input of [{quantity:0,cardQuantity:1},{quantity:0,shikishiQuantity:1}])assert.equal(quoteProductBundle({variant:'effect',...input}).shippingFen,500);
 for(const input of [{quantity:1},{quantity:0,cardQuantity:2},{quantity:0,shikishiQuantity:2},{quantity:0,cardQuantity:1,shikishiQuantity:1}])assert.equal(quoteProductBundle({variant:'effect',...input}).shippingFen,0);
});
test('draft snapshots preserve quantity, single-plane specification and item totals',()=>{
 const state={playerName:'测试'};const draft=buildAcrylicDesignDraft({state,variant:'effect',quantity:2,accessory:'clearStand',cardQuantity:2,shikishiQuantity:2,newCustomer:true});state.playerName='修改';
 assert.equal(draft.design.playerName,'测试');assert.equal(draft.quote.totalFen,18140);assert.equal(draft.product.widthMm,120);assert.equal(draft.product.acrylicThicknessMm,15);assert.ok(draft.product.effectRequests.includes('single-plane-print'));assert.deepEqual(draft.items.map(i=>i.quantity),[2,2,2,2]);
 const paper=buildAcrylicDesignDraft({state,variant:'effect',quantity:0,shikishiQuantity:1});assert.equal(paper.product.type,'shikishi');assert.equal(paper.product.acrylicThicknessMm,undefined);assert.equal(paper.quote.totalFen,2990);
 const card=buildAcrylicDesignDraft({state,variant:'effect',quantity:0,cardQuantity:1});assert.equal(card.product.type,'holographic-card');
 assert.throws(()=>buildAcrylicDesignDraft({state:null,variant:'effect',quantity:1}),TypeError);
});
test('legacy finish aliases retain current prices without newcomer reductions',()=>{
 for(const variant of ['light','premium'])assert.equal(quoteAcrylicOrder({variant,quantity:1,newCustomer:true}).totalFen,4990);
 assert.equal(quoteAcrylicOrder({variant:'basic',quantity:1,newCustomer:true}).totalFen,3990);
});
test('invalid quantities, product options and empty orders are rejected',()=>{
 for(const n of [-1,0,1.5,100,NaN,Infinity])assert.throws(()=>quoteAcrylicOrder({variant:'basic',quantity:n}),RangeError);
 for(const key of ['quantity','cardQuantity','shikishiQuantity'])for(const n of [-1,1.5,100,NaN])assert.throws(()=>quoteProductBundle({variant:'effect',quantity:1,[key]:n}),RangeError);
 for(const input of [{quantity:0},{quantity:0,cardQuantity:1,accessory:'clearStand'},{quantity:1,accessory:'invalid'},{quantity:1,variant:'invalid'}])assert.throws(()=>quoteProductBundle({variant:'effect',...input}),RangeError);
});
