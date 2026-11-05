import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, BUNDLE_PRESETS, quoteAcrylicOrder, quoteProductBundle, buildAcrylicDesignDraft } from '../../src/custom-order.js';

test('presets cover every combination with shipping waived for bricks or multiple items',()=>{
  const combinations=new Set();
  for(const preset of Object.values(BUNDLE_PRESETS)) {
    combinations.add([preset.quantity,preset.cardQuantity,preset.shikishiQuantity].map(value=>Number(value>0)).join(''));
    assert.equal(quoteProductBundle({...preset,variant:'effect'}).shippingFen,preset.quantity>0||preset.cardQuantity+preset.shikishiQuantity>=2?0:500);
  }
  assert.deepEqual([...combinations].sort(),['001','010','011','100','101','110','111']);
});

test('shipping is 5 for one card or paper, and free at exactly two items',()=>{
  const selection={variant:'effect',quantity:0};
  assert.equal(quoteProductBundle({...selection,cardQuantity:1}).shippingFen,500);
  assert.equal(quoteProductBundle({...selection,shikishiQuantity:1}).shippingFen,500);
  assert.equal(quoteProductBundle({...selection,cardQuantity:2}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,shikishiQuantity:2}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,cardQuantity:1,shikishiQuantity:1}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,quantity:1}).shippingFen,0);
});

test('shikishi has fixed retail and newcomer prices and one fixed shipping fee', () => {
  const selection={variant:'effect',quantity:0,shikishiQuantity:1};
  assert.equal(quoteProductBundle(selection).totalFen,2490);
  assert.equal(quoteProductBundle(selection).shippingPending,false);
  const newcomer=quoteProductBundle({...selection,shikishiQuantity:2,newCustomer:true});
  assert.equal(newcomer.totalFen,3380);
  assert.equal(newcomer.discountFen,600);
  for(const count of [-1,1.5,100,NaN])assert.throws(()=>quoteProductBundle({...selection,shikishiQuantity:count}),RangeError);
  const draft=buildAcrylicDesignDraft({...selection,state:{playerName:'色纸'},newCustomer:true});
  assert.equal(draft.product.type,'shikishi');
  assert.equal(draft.product.acrylicThicknessMm,undefined);
  assert.deepEqual(draft.items,[{type:'shikishi',quantity:1,totalFen:1690}]);
});

test('full collection preset combines existing offers without invented discounts', () => {
  const selection={...BUNDLE_PRESETS.complete,variant:'effect'};
  assert.equal(quoteProductBundle(selection).totalFen,7570);
  const quote=quoteProductBundle({...selection,newCustomer:true});
  assert.equal(quote.totalFen,7270);
  assert.equal(quote.comboDiscountFen,300);
  assert.equal(quote.discountFen,300);
  assert.equal(quote.shippingPending,false);
  assert.equal(quote.shippingFen,0);
});

test('two product options with one fully enabled effect option',()=>{
  assert.deepEqual(Object.keys(ACRYLIC_PRODUCTS),['basic','effect']);
  assert.equal(ACRYLIC_PRODUCTS.basic.priceFen,2990);assert.equal(ACRYLIC_PRODUCTS.effect.priceFen,3990);
  for(const effect of ['white-outline-uv','background-glitter','colored-fine-powder','background-pearl','title-pearl','avatar-pearl','rank-pearl','battle-pearl'])assert.ok(ACRYLIC_PRODUCTS.effect.effects.includes(effect));
  for(const old of ['light','premium']){
    const quote=quoteAcrylicOrder({variant:old,quantity:1});assert.equal(quote.variant,'effect');assert.equal(quote.totalFen,3990);
    assert.equal(buildAcrylicDesignDraft({state:{playerName:'Legacy'},variant:old,quantity:1}).product.variant,'effect');
  }
});

test('newcomer has fixed per-tier prices and quantity does not trigger promotion', () => {
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 1, newCustomer: true }).totalFen, 2690);
  assert.equal(quoteAcrylicOrder({ variant: 'effect', quantity: 1, newCustomer: true }).totalFen, 3990);
  assert.equal(quoteAcrylicOrder({ variant: 'effect', quantity: 5 }).totalFen, 19950);
  assert.equal(quoteAcrylicOrder({ variant: 'effect', quantity: 5, newCustomer: true }).totalFen, 19950);
});

test('invalid products or quantities are rejected', () => {
  for (const quantity of [0, -1, 1.5, 100, NaN, Infinity]) {
    assert.throws(() => quoteAcrylicOrder({ variant: 'basic', quantity }), RangeError);
  }
  assert.throws(() => quoteAcrylicOrder({ variant: 'special', quantity: 1 }), RangeError);
});

test('draft snapshot contains the tier manufacturing specification', () => {
  const state = { playerName: 'Example', files: { avatar: 'assets/avatar.png' } };
  const draft = buildAcrylicDesignDraft({ state, variant: 'effect', quantity: 2 });
  state.playerName = 'Changed';
  assert.equal(draft.design.playerName, 'Example');
  assert.equal(draft.status, 'not-for-production-or-payment');
  assert.equal(draft.rightsReview, 'required');
  assert.equal(draft.quote.totalFen, 7980);
  assert.ok(draft.product.effectRequests.includes('colored-fine-powder'));
  assert.equal(draft.product.acrylicThicknessMm, 15);
});

test('accessories and cards are not discounted', () => {
  const q = quoteProductBundle({
    variant: 'basic', quantity: 5, accessory: 'clearStand', cardQuantity: 2, newCustomer: true,
  });
  assert.equal(q.bodyFen, 13450);
  assert.equal(q.extrasFen, 4980);
  assert.equal(q.comboDiscountFen, 700);
  assert.equal(q.totalFen, 17730);
  assert.equal(q.discountFen, 1500);
  assert.equal(q.discountReason, 'new-customer');
});
test('accessory and count validation', () => {
  assert.throws(() => quoteProductBundle({ variant: 'effect', quantity: 1, accessory: 'ledBase' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'invalid' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: -1 }), RangeError);
});

test('fixed newcomer prices are not rounded percentage discounts', () => {
  for (const [variant, retail, newcomer] of [['basic',2990,2690],['effect',3990,3990]]) {
    assert.equal(quoteAcrylicOrder({variant,quantity:1}).totalFen,retail);
    assert.equal(quoteAcrylicOrder({variant,quantity:1,newCustomer:true}).totalFen,newcomer);
    assert.equal(quoteProductBundle({variant,quantity:2,newCustomer:true}).bodyFen,newcomer*2);
  }
});

test('holographic card standalone costs 14.90 plus one shipping fee', () => {
  const one = quoteProductBundle({ variant: 'basic', quantity: 0, cardQuantity: 1 });
  assert.equal(one.totalFen, 1990);
  assert.equal(one.shippingFen, 500);
  assert.equal(one.comboDiscountFen, 0);
  const many = quoteProductBundle({ variant: 'basic', quantity: 0, cardQuantity: 3, newCustomer: true });
  assert.equal(many.totalFen, 4470);
  assert.equal(many.discountApplied, false);
  const draft = buildAcrylicDesignDraft({ state: { playerName: 'Player' }, variant: 'basic', quantity: 0, cardQuantity: 1 });
  assert.equal(draft.product.type, 'holographic-card');
  assert.equal(draft.product.acrylicThicknessMm, undefined);
});
test('bundle discounts are applied to eligible combinations only', () => {
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand' }).totalFen, 3290);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: 1 }).totalFen, 4280);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1 }).totalFen, 4580);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1, newCustomer: true }).totalFen, 4280);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 0 }));
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 0, accessory: 'clearStand', cardQuantity: 1 }));
});

