import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, createDesignRecord, validateDesign } from '../lib/commerce.mjs';

test('pricing and non-stacking discounts', () => {
  const q = calculateQuote({ variant: 'special', quantity: 5, accessory: 'ledBase', cardQuantity: 2, eligibleNewCustomer: true });
  assert.equal(q.subtotalFen, 20000);
  assert.equal(q.discountFen, 4000);
  assert.equal(q.addonsFen, 13000);
  assert.equal(q.totalFen, 29000);
  assert.equal(q.discountType, 'bulk');
});
test('single unit and optional accessories', () => {
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1 }).totalFen, 3000);
  assert.equal(calculateQuote({ variant: 'basic', quantity: 1, accessory: 'clearStand', cardQuantity: 1 }).totalFen, 4900);
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
