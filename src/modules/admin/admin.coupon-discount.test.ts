import assert from 'node:assert/strict';
import test from 'node:test';
import { couponDiscountPatch } from './admin.coupon-discount';

test('editing a fixed coupon ignores the editor percent placeholder and updates currency', () => {
  assert.deepEqual(couponDiscountPatch({ discountType: 'FIXED', amountOff: 12.5, percentOff: 0, currency: 'BDT' },
    { amountOff: 1000, percentOff: null }), { amountOff: 1250, percentOff: null, currency: 'bdt' });
});

test('switching discount types clears the previous value in both directions', () => {
  assert.deepEqual(couponDiscountPatch({ discountType: 'PERCENT', percentOff: 25, amountOff: 0 },
    { amountOff: 1000, percentOff: null }), { percentOff: 25, amountOff: null });
  assert.deepEqual(couponDiscountPatch({ discountType: 'FIXED', percentOff: 0, amountOff: 8.99 },
    { amountOff: null, percentOff: 25 }), { percentOff: null, amountOff: 899 });
});

test('partial updates preserve discount type and leave unrelated columns untouched', () => {
  assert.deepEqual(couponDiscountPatch({ amountOff: 5 }, { amountOff: 1000, percentOff: null }),
    { percentOff: null, amountOff: 500 });
  assert.deepEqual(couponDiscountPatch({ percentOff: 15 }, { amountOff: null, percentOff: 25 }),
    { percentOff: 15, amountOff: null });
  assert.deepEqual(couponDiscountPatch({ code: 'RENAMED', currency: ' EUR ' }, { amountOff: 1000, percentOff: null }),
    { currency: 'eur' });
  assert.deepEqual(couponDiscountPatch({ isActive: false }, { amountOff: 1000, percentOff: null }), {});
});

test('create uses the same exclusive discount contract', () => {
  assert.deepEqual(couponDiscountPatch({ discountType: 'FIXED', amountOff: 2.5, percentOff: 0 }),
    { amountOff: 250, percentOff: null, currency: 'usd' });
  assert.deepEqual(couponDiscountPatch({ percentOff: 10, amountOff: 0 }),
    { percentOff: 10, amountOff: null, currency: 'usd' });
});

test('invalid discounts and currencies fail before persistence', () => {
  for (const percentOff of [0, -1, 101, 5.5, NaN, Infinity, '10', null]) {
    assert.throws(() => couponDiscountPatch({ discountType: 'PERCENT', percentOff }));
  }
  for (const amountOff of [0, -1, NaN, Infinity, 30_000_000, '10', null]) {
    assert.throws(() => couponDiscountPatch({ discountType: 'FIXED', amountOff }));
  }
  assert.throws(() => couponDiscountPatch({ discountType: 'OTHER', percentOff: 10 }));
  assert.throws(() => couponDiscountPatch({ discountType: null, percentOff: 10 }));
  assert.throws(() => couponDiscountPatch({ percentOff: 10, currency: 'invalid' }));
  assert.throws(() => couponDiscountPatch({ discountType: 'FIXED' }, { percentOff: 10, amountOff: null }));
  assert.throws(() => couponDiscountPatch({ discountType: 'PERCENT' }, { percentOff: null, amountOff: 1000 }));
});
