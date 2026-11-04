import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, BUNDLE_PRESETS, quoteAcrylicOrder, quoteProductBundle, buildAcrylicDesignDraft } from '../../src/custom-order.js';

test('presets cover every combination with shipping waived for bricks or multiple items',()=>{
  const combinations=new Set();
  for(const preset of Object.values(BUNDLE_PRESETS)) {
    combinations.add([preset.quantity,preset.cardQuantity,preset.shikishiQuantity].map(value=>Number(value>0)).join(''));
    assert.equal(quoteProductBundle({...preset,variant:'premium'}).shippingFen,preset.quantity>0||preset.cardQuantity+preset.shikishiQuantity>=2?0:500);
  }
  assert.deepEqual([...combinations].sort(),['001','010','011','100','101','110','111']);
});

test('shipping is 5 for one card or paper, and free at exactly two items',()=>{
  const selection={variant:'premium',quantity:0};
  assert.equal(quoteProductBundle({...selection,cardQuantity:1}).shippingFen,500);
  assert.equal(quoteProductBundle({...selection,shikishiQuantity:1}).shippingFen,500);
  assert.equal(quoteProductBundle({...selection,cardQuantity:2}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,shikishiQuantity:2}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,cardQuantity:1,shikishiQuantity:1}).shippingFen,0);
  assert.equal(quoteProductBundle({...selection,quantity:1}).shippingFen,0);
});

test('shikishi has fixed retail and newcomer prices and one fixed shipping fee', () => {
  const selection={variant:'premium',quantity:0,shikishiQuantity:1};
  assert.equal(quoteProductBundle(selection).totalFen,2499);
  assert.equal(quoteProductBundle(selection).shippingPending,false);
  const newcomer=quoteProductBundle({...selection,shikishiQuantity:2,newCustomer:true});
  assert.equal(newcomer.totalFen,3398);
  assert.equal(newcomer.discountFen,600);
  for(const count of [-1,1.5,100,NaN])assert.throws(()=>quoteProductBundle({...selection,shikishiQuantity:count}),RangeError);
  const draft=buildAcrylicDesignDraft({...selection,state:{playerName:'色纸'},newCustomer:true});
  assert.equal(draft.product.type,'shikishi');
  assert.equal(draft.product.acrylicThicknessMm,undefined);
  assert.deepEqual(draft.items,[{type:'shikishi',quantity:1,totalFen:1699}]);
});

test('full collection preset combines existing offers without invented discounts', () => {
  const selection={...BUNDLE_PRESETS.complete,variant:'premium'};
  assert.equal(quoteProductBundle(selection).totalFen,8097);
  const quote=quoteProductBundle({...selection,newCustomer:true});
  assert.equal(quote.totalFen,7297);
  assert.equal(quote.comboDiscountFen,300);
  assert.equal(quote.discountFen,800);
  assert.equal(quote.shippingPending,false);
  assert.equal(quote.shippingFen,0);
});

test('three product variants and process requests', () => {
  assert.equal(ACRYLIC_PRODUCTS.basic.priceFen, 2999);
  assert.equal(ACRYLIC_PRODUCTS.light.priceFen, 3499);
  assert.equal(ACRYLIC_PRODUCTS.premium.priceFen, 4499);
  assert.deepEqual(ACRYLIC_PRODUCTS.light.effects, ['white-ink', 'white-outline-uv', 'background-glitter', 'colored-fine-powder', 'single-plane-print']);
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('double-sided-print'));
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('colored-fine-powder'));
  for (const [variant, expected] of [['basic', 2999], ['light', 3499], ['premium', 4499]]) {
    assert.equal(quoteAcrylicOrder({ variant, quantity: 1 }).totalFen, expected);
  }
});

test('newcomer has fixed per-tier prices and quantity does not trigger promotion', () => {
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 1, newCustomer: true }).totalFen, 2699);
  assert.equal(quoteAcrylicOrder({ variant: 'light', quantity: 1, newCustomer: true }).totalFen, 2999);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 1, newCustomer: true }).totalFen, 3999);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 5 }).totalFen, 22495);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 5, newCustomer: true }).totalFen, 19995);
});

test('invalid products or quantities are rejected', () => {
  for (const quantity of [0, -1, 1.5, 100, NaN, Infinity]) {
    assert.throws(() => quoteAcrylicOrder({ variant: 'basic', quantity }), RangeError);
  }
  assert.throws(() => quoteAcrylicOrder({ variant: 'special', quantity: 1 }), RangeError);
});

test('draft snapshot contains the tier manufacturing specification', () => {
  const state = { playerName: 'Example', files: { avatar: 'assets/avatar.png' } };
  const draft = buildAcrylicDesignDraft({ state, variant: 'premium', quantity: 2 });
  state.playerName = 'Changed';
  assert.equal(draft.design.playerName, 'Example');
  assert.equal(draft.status, 'not-for-production-or-payment');
  assert.equal(draft.rightsReview, 'required');
  assert.equal(draft.quote.totalFen, 8998);
  assert.ok(draft.product.effectRequests.includes('colored-fine-powder'));
  assert.equal(draft.product.acrylicThicknessMm, 15);
});

test('accessories and cards are not discounted', () => {
  const q = quoteProductBundle({
    variant: 'basic', quantity: 5, accessory: 'clearStand', cardQuantity: 2, newCustomer: true,
  });
  assert.equal(q.bodyFen, 13495);
  assert.equal(q.extrasFen, 4998);
  assert.equal(q.comboDiscountFen, 700);
  assert.equal(q.totalFen, 17793);
  assert.equal(q.discountFen, 1500);
  assert.equal(q.discountReason, 'new-customer');
});
test('accessory and count validation', () => {
  assert.throws(() => quoteProductBundle({ variant: 'premium', quantity: 1, accessory: 'ledBase' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'invalid' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: -1 }), RangeError);
});

test('fixed newcomer prices are not rounded percentage discounts', () => {
  for (const [variant, retail, newcomer] of [['basic',2999,2699],['light',3499,2999],['premium',4499,3999]]) {
    assert.equal(quoteAcrylicOrder({variant,quantity:1}).totalFen,retail);
    assert.equal(quoteAcrylicOrder({variant,quantity:1,newCustomer:true}).totalFen,newcomer);
    assert.equal(quoteProductBundle({variant,quantity:2,newCustomer:true}).bodyFen,newcomer*2);
  }
});

test('holographic card standalone costs 14.99 plus one shipping fee', () => {
  const one = quoteProductBundle({ variant: 'basic', quantity: 0, cardQuantity: 1 });
  assert.equal(one.totalFen, 1999);
  assert.equal(one.shippingFen, 500);
  assert.equal(one.comboDiscountFen, 0);
  const many = quoteProductBundle({ variant: 'basic', quantity: 0, cardQuantity: 3, newCustomer: true });
  assert.equal(many.totalFen, 4497);
  assert.equal(many.discountApplied, false);
  const draft = buildAcrylicDesignDraft({ state: { playerName: 'Player' }, variant: 'basic', quantity: 0, cardQuantity: 1 });
  assert.equal(draft.product.type, 'holographic-card');
  assert.equal(draft.product.acrylicThicknessMm, undefined);
});
test('bundle discounts are applied to eligible combinations only', () => {
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand' }).totalFen, 3299);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: 1 }).totalFen, 4298);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1 }).totalFen, 4598);
  assert.equal(quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1, newCustomer: true }).totalFen, 4298);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 0 }));
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 0, accessory: 'clearStand', cardQuantity: 1 }));
});
