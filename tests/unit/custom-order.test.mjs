import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, quoteAcrylicOrder, quoteProductBundle, buildAcrylicDesignDraft } from '../../src/custom-order.js';

test('fixed unit prices are 30 and 40 yuan', () => {
  assert.equal(ACRYLIC_PRODUCTS.basic.priceFen, 3000);
  assert.equal(ACRYLIC_PRODUCTS.special.priceFen, 4000);
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 1 }).totalFen, 3000);
  assert.equal(quoteAcrylicOrder({ variant: 'special', quantity: 1 }).totalFen, 4000);
});

test('new customer or five items receives exactly one 20% discount', () => {
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 1, newCustomer: true }).totalFen, 2400);
  assert.equal(quoteAcrylicOrder({ variant: 'special', quantity: 5 }).totalFen, 16000);
  assert.equal(quoteAcrylicOrder({ variant: 'special', quantity: 5, newCustomer: true }).totalFen, 16000);
  assert.equal(quoteAcrylicOrder({ variant: 'basic', quantity: 4 }).totalFen, 12000);
});

test('rejects unknown products and invalid quantities', () => {
  for (const quantity of [0, -1, 1.5, 100, NaN, Infinity]) {
    assert.throws(() => quoteAcrylicOrder({ variant: 'basic', quantity }), RangeError);
  }
  assert.throws(() => quoteAcrylicOrder({ variant: 'unknown', quantity: 1 }), RangeError);
});

test('exported draft freezes design snapshot and is not a payable order', () => {
  const state = { playerName: 'Example', files: { avatar: 'assets/avatar.png' } };
  const draft = buildAcrylicDesignDraft({ state, variant: 'special', quantity: 2 });
  state.playerName = 'Changed';
  assert.equal(draft.design.playerName, 'Example');
  assert.equal(draft.status, 'not-for-production-or-payment');
  assert.equal(draft.rightsReview, 'required');
  assert.equal(draft.quote.totalFen, 8000);
});

test('accessories and foil cards are priced separately from 20% body discount', () => {
  const q = quoteProductBundle({
    variant: 'basic', quantity: 5, accessory: 'clearStand', cardQuantity: 2, newCustomer: true,
  });
  assert.equal(q.bodyFen, 12000);
  assert.equal(q.extrasFen, 5000);
  assert.equal(q.totalFen, 17000);
  assert.equal(q.discountFen, 3000);
  assert.equal(q.discountReason, 'bulk');
});
test('LED bundle is selectable and quantities are validated', () => {
  assert.equal(quoteProductBundle({ variant: 'special', quantity: 1, accessory: 'ledBase' }).totalFen, 6000);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, accessory: 'invalid' }), RangeError);
  assert.throws(() => quoteProductBundle({ variant: 'basic', quantity: 1, cardQuantity: -1 }), RangeError);
});
