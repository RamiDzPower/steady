import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';

test('a ring number rolls in only the digits that changed, matched from the right', () => {
  assert.deepEqual(L.rollMask('1,234', '1,654'), [false, false, true, true, false]);
  assert.deepEqual(L.rollMask('1.5', '1.8'), [false, false, true]);
  assert.deepEqual(L.rollMask('30', '30'), [false, false]);
  // A new thousands digit rolls in; its comma is not a digit, so it just appears.
  assert.deepEqual(L.rollMask('950', '1,200'), [true, false, true, true, false]);
  assert.deepEqual(L.rollMask('1,000', '990'), [true, true, false]);
  assert.deepEqual(L.rollMask('', '5'), [true]);
});
