import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, quoteAcrylicOrder, quoteProductBundle, buildAcrylicDesignDraft } from '../../src/custom-order.js';

test('three product variants and process requests', () => {
  assert.equal(ACRYLIC_PRODUCTS.basic.priceFen, 3000);
  assert.equal(ACRYLIC_PRODUCTS.light.priceFen, 3500);
  assert.equal(ACRYLIC_PRODUCTS.premium.priceFen, 4500);
  assert.deepEqual(ACRYLIC_PRODUCTS.light.effects, ['uv-color', 'white-ink', 'ai-spot-uv']);
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('double-sided-print'));
  assert.ok(ACRYLIC_PRODUCTS.premium.effects.includes('ai-glitter'));
  for (const [variant, expected] of [['basic', 3000], ['light', 3500], ['premium', 4500]]) {
    assert.equal(quoteAcrylicOrder({ variant, quantity: 1 }).totalFen, expected);
  }
});

test('newcomer discount is 10 percent and quantity does not trigger promotion', () => {
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 1, newCustomer: true }).totalFen, 2700);
  assert.equal(quoteAcrylicOrder({ variant: 'light', quantity: 1, newCustomer: true }).totalFen, 3150);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 1, newCustomer: true }).totalFen, 4050);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 5 }).totalFen, 22500);
  assert.equal(quoteAcrylicOrder({ variant: 'premium', quantity: 5, newCustomer: true }).totalFen, 20250);
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
  assert.equal(draft.quote.totalFen, 9000);
  assert.ok(draft.product.effectRequests.includes('ai-glitter'));
});

test('accessories and cards are not discounted', () => {
  const q = quoteProductBundle({
    variant: 'basic', quantity: 5, accessory: 'clearStand', cardQuantity: 2, newCustomer: true,
  });
  assert.equal(q.bodyFen, 13500);
  assert.equal(q.extrasFen, 5000);
  assert.equal(q.totalFen, 18500);
  assert.equal(q.discountFen, 1500);
  assert.equal(q.discountReason, 'new-customer');
});
test('LED accessory and count validation', () => {
  assert.equal(quoteProductBundle({ variant: 'premium', quantity: 1, accessory: 'ledBase' }).totalFen, 6500);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'invalid' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: -1 }), RangeError);
});
