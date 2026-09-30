import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rarityForBlueprint, rarityTiers } from '../public/blueprint-rarity.js';

const catalog = JSON.parse(readFileSync(new URL('../public/collection-data.json', import.meta.url)));

test('every catalog blueprint has one of the five find rarity tiers', () => {
  assert.equal(catalog.length, 83);
  for (const entry of catalog) {
    const rarity = rarityForBlueprint(entry.name);
    assert.ok(rarity, `Missing rarity: ${entry.name}`);
    assert.equal(rarity.color, rarityTiers[rarity.id].color);
  }
});

test('drop rarity follows observed blueprint availability, not crafted item tier', () => {
  assert.equal(rarityForBlueprint('Silencer II').id, 'veryCommon');
  assert.equal(rarityForBlueprint('Silencer I').id, 'rare');
  assert.equal(rarityForBlueprint('Vita Shot').id, 'extreme');
  assert.equal(rarityForBlueprint('Equalizer').id, 'extreme');
  assert.equal(rarityForBlueprint('Hullcracker').id, 'common');
});

test('common catalog aliases resolve while unknown finds remain unrated', () => {
  assert.equal(rarityForBlueprint('Bettina')?.id, rarityForBlueprint('Bettina I')?.id);
  assert.equal(rarityForBlueprint('Extended Medium Magazine III')?.id, 'uncommon');
  assert.equal(rarityForBlueprint('Unidentified blueprint'), null);
});
