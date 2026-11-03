import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, quoteAcrylicOrder, quoteProductBundle, buildAcrylicDesignDraft } from '../../src/custom-order.js';

test('three product variants and process requests', () => {
  assert.equal(ACRYLIC_PRODUCTS.basic.priceFen, 2999);
  assert.equal(ACRYLIC_PRODUCTS.light.priceFen, 3499);
  assert.equal(ACRYLIC_PRODUCTS.premium.priceFen, 4499);
  assert.deepEqual(ACRYLIC_PRODUCTS.light.effects, ['uv-color', 'white-ink', 'ai-spot-uv']);
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('double-sided-print'));
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('ai-glitter'));
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
  assert.ok(draft.product.effectRequests.includes('ai-glitter'));
});

test('accessories and cards are not discounted', () => {
  const q = quoteProductBundle({
    variant: 'basic', quantity: 5, accessory: 'clearStand', cardQuantity: 2, newCustomer: true,
  });
  assert.equal(q.bodyFen, 13495);
  assert.equal(q.extrasFen, 5000);
  assert.equal(q.totalFen, 18495);
  assert.equal(q.discountFen, 1500);
  assert.equal(q.discountReason, 'new-customer');
});
test('LED accessory and count validation', () => {
  assert.equal(quoteProductBundle({ variant: 'premium', quantity: 1, accessory: 'ledBase' }).totalFen, 6499);
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
