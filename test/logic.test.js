import test from 'node:test';
import assert from 'node:assert/strict';
import { blueprintFromText, clamp01 } from '../public/logic.js';

test('recognizes a blueprint on the same or next line', () => {
  assert.equal(blueprintFromText('Found\nAnvil Blueprint\nRare'), 'Anvil');
  assert.equal(blueprintFromText('Anvil\nBlueprint'), 'Anvil');
  assert.equal(blueprintFromText('Ammo\nWeapon Case'), null);
});

test('prefers the blueprint title over category and learned status', () => {
  const sample = 'PINGITEM\nua | BLUEPRINT | p 216.718\nDEFIBRILLATOR BLUEPRINT\nRequired resources\nBlueprint already learned';
  assert.equal(blueprintFromText(sample), 'DEFIBRILLATOR');
  assert.equal(blueprintFromText('Blueprint already learned'), null);
});

test('keeps normalized points within the map', () => {
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(0.47), 0.47);
  assert.equal(clamp01(2), 1);
});
