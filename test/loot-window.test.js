import test from 'node:test';
import assert from 'node:assert/strict';
import { LootWindow } from '../public/loot-window.js';

test('only unseen loot slots inside four seconds are accepted; closing panel resets window', () => {
  const window = new LootWindow();
  assert.deepEqual(window.observe(false, [3], 1000), []);
  assert.deepEqual(window.observe(true, [3], 2000), [3]);
  assert.deepEqual(window.observe(true, [3, 4], 3000), [4]);
  assert.deepEqual(window.observe(true, [5], 6001), []);
  assert.deepEqual(window.observe(false, [], 7000), []);
  assert.deepEqual(window.observe(true, [3], 8000), [3]);
});
