import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, createDesignRecord, validateDesign } from '../lib/commerce.mjs';

test('newcomer-only discount', () => {
  const q = calculateQuote({ variant: 'premium', quantity: 5, accessory: 'ledBase', cardQuantity: 2, eligibleNewCustomer: true });
  assert.equal(q.subtotalFen, 22495);
  assert.equal(q.discountFen, 2500);
  assert.equal(q.addonsFen, 12998);
  assert.equal(q.comboDiscountFen, 200);
  assert.equal(q.totalFen, 32793);
  assert.equal(q.discountType, 'newcomer');
});
test('single unit and optional accessories', () => {
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1 }).totalFen, 2999);
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1 }).totalFen, 4598);
});
test('invalid counts and inputs rejected', () => {
  for (const count of [-1, 0, 1.2, 100]) assert.throws(() => calculateQuote({ variant: 'basic', quantity: count }));
  assert.throws(() => calculateQuote({ variant: 'bad', quantity: 1 }));
  assert.throws(() => calculateQuote({ variant: 'basic', quantity: 1, cardQuantity: 100 }));
  assert.throws(() => validateDesign(null));
});
test('immutable design copy and pending rights default', () => {
  const state = { playerName: 'A', files: {} };
  const record = createDesignRecord(state, 'user');
  state.playerName = 'B';
  assert.equal(record.payload.playerName, 'A');
  assert.equal(record.rightsStatus, 'pending');
  assert.match(record.digest, /^[a-f0-9]{64}$/);
});

test('no automatic discount at five units', () => { assert.equal(calculateQuote({ variant: 'basic', quantity: 5 }).totalFen, 14995); });

test('three-tier quote amounts and fixed newcomer prices', () => {
  assert.equal(calculateQuote({ variant: 'light', quantity: 1 }).totalFen, 3499);
  assert.equal(calculateQuote({ variant: 'premium', quantity: 1 }).totalFen, 4499);
  assert.equal(calculateQuote({ variant: 'light', quantity: 1, eligibleNewCustomer: true }).totalFen, 2999);
  assert.equal(calculateQuote({ variant: 'premium', quantity: 1, eligibleNewCustomer: true }).totalFen, 3999);
  assert.throws(() => calculateQuote({ variant: 'special', quantity: 1 }));
});

test('newcomer fixed prices have no floating point rounding', () => {
  for (const [variant, regular, newcomer] of [['basic',2999,2699],['light',3499,2999],['premium',4499,3999]]) {
    assert.equal(calculateQuote({variant,quantity:1}).totalFen,regular);
    assert.equal(calculateQuote({variant,quantity:1,eligibleNewCustomer:true}).totalFen,newcomer);
    assert.equal(calculateQuote({variant,quantity:5,eligibleNewCustomer:true}).totalFen,newcomer*5);
  }
});

test('card-only has one delivery fee, matching front-end checkout quote', () => {
  assert.equal(calculateQuote({ variant: 'basic', quantity: 0, cardQuantity: 1 }).totalFen, 1899);
  assert.equal(calculateQuote({ variant: 'basic', quantity: 0, cardQuantity: 3 }).totalFen, 4897);
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1, cardQuantity: 1 }).totalFen, 4298);
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1, eligibleNewCustomer: true }).totalFen, 4298);
  assert.throws(() => calculateQuote({ variant: 'basic', quantity: 0, cardQuantity: 0 }));
  assert.throws(() => calculateQuote({ variant: 'basic', quantity: 0, accessory: 'clearStand', cardQuantity: 1 }));
});
