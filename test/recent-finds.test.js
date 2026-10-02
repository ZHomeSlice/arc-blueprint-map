import test from 'node:test';
import assert from 'node:assert/strict';
import { recentBlueprintFinds, RECENT_FINDS_WINDOW_MS } from '../public/recent-finds.js';

const now = Date.parse('2026-10-02T03:30:00Z');
const find = (id, age) => ({ id, foundAt: new Date(now - age).toISOString() });

test('recent finds use discovery time, span maps, and sort newest first', () => {
  const newest = { ...find('new', 60000), map: 'Spaceport' };
  const boundary = { ...find('boundary', RECENT_FINDS_WINDOW_MS), map: 'Stella Montis Lower' };
  const older = { ...find('older', 120000), map: 'Stella Montis Upper' };
  const data = { finds: [older, find('old', RECENT_FINDS_WINDOW_MS + 1), boundary, newest,
    find('future', -1), { id: 'invalid', foundAt: 'invalid' }], sightings: [] };
  assert.deepEqual(recentBlueprintFinds(data, now).map(entry => entry.id), ['new', 'older', 'boundary']);
  assert.equal(data.finds[0], older, 'History sorting must not reorder stored finds');
});

test('missed locations and false alerts stay out of recent finds; expiry keeps saved data', () => {
  const data = { finds: [find('kept', 1000), find('missed', 1000), find('false', 1000)], sightings: [
    { savedFindId: 'missed', locationMissed: true }, { savedFindId: 'false', dismissed: true }] };
  assert.deepEqual(recentBlueprintFinds(data, now).map(entry => entry.id), ['kept']);
  assert.deepEqual(recentBlueprintFinds(data, now + RECENT_FINDS_WINDOW_MS), []);
  assert.equal(data.finds.length, 3);
});
