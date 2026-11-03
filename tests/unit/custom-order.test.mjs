import test from 'node:test';
import assert from 'node:assert/strict';
import { ACRYLIC_PRODUCTS, quoteAcrylicOrder, buildAcrylicDesignDraft } from '../../src/custom-order.js';

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
