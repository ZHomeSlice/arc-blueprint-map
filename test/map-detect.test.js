import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFamilyFromTitle, selectMapCandidate } from '../public/map-detect.js';

test('reads known in-game map titles, including small OCR errors', () => {
  assert.equal(mapFamilyFromTitle('STELLA MONTIS .'), 'stella');
  assert.equal(mapFamilyFromTitle('DAM BATTLEGROUNDS'), 'dam');
  assert.equal(mapFamilyFromTitle('THE SPACEPORT'), 'spaceport');
  assert.equal(mapFamilyFromTitle('BURIED CITY'), 'buried-city');
  assert.equal(mapFamilyFromTitle('THE BLUE GATE'), 'blue-gate');
  assert.equal(mapFamilyFromTitle('RIVEN TIDES'), 'riven-tides');
  assert.equal(mapFamilyFromTitle('STELLA MONTlS'), 'stella');
  assert.equal(mapFamilyFromTitle('QUESTS'), null);
});

test('chooses a floor by tone while refusing close or weak matches', () => {
  const upper = { preset: { name: 'Stella Montis Upper', minScore: 0.62 },
    match: { score: 0.716 }, appearance: { mae: 18.7 }, position: { x: 0.2, y: 0.5 } };
  const lower = { preset: { name: 'Stella Montis Lower', minScore: 0.72 },
    match: { score: 0.751 }, appearance: { mae: 62.3 }, position: { x: 0.2, y: 0.5 } };
  assert.equal(selectMapCandidate([lower, upper]), upper);
  assert.match(selectMapCandidate([{ ...upper, appearance: { mae: 22 } },
    { ...lower, appearance: { mae: 25 } }]).error, /uncertain/);
  assert.ok(selectMapCandidate([{ ...upper, match: { score: 0.4 } }]).error);
});
