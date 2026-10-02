import test from 'node:test';
import assert from 'node:assert/strict';
import { blueprintFromText, clamp01, isOwnCommunityDuplicate, removeRecentDuplicateDiscoveries } from '../public/logic.js';

test('reads noisy Spaceport tooltip titles against the catalog', () => {
  const names = ['Silencer I', 'Silencer II', 'Extended Shotgun Mag II'];
  assert.equal(blueprintFromText('(ole RPV EL SILENCER Il BLUEPRINT\nModerately reduces noise', names), 'SILENCER II');
  assert.equal(blueprintFromText('CONTAINER 4/8 EXTENDED SHOTGUN MAG II\nBLUEPRINT\n2 SN Moderately extends the ammo capacity cl', names), 'EXTENDED SHOTGUN MAG II');
  assert.equal(blueprintFromText('EXTENDED SHOTGUN MAG II\nBLUEPRINT\nModerately extends capacity'), 'EXTENDED SHOTGUN MAG II');
});

test('recognizes a blueprint on the same or next line', () => {
  assert.equal(blueprintFromText('Found\nAnvil Blueprint\nRare'), 'Anvil');
  assert.equal(blueprintFromText('Anvil\nBlueprint'), 'Anvil');
  assert.equal(blueprintFromText('EXPLOSIVE MINE BLUEPRINT\nRequired resources'), 'EXPLOSIVE MINE');
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

test('filters only matching self-imported community points already in personal finds', () => {
  const personal = [{ name: 'Seeker Grenade', map: 'Stella Montis Upper', x: 0.235, y: 0.412 }];
  const samePoint = { name: 'Seeker Grenade', map: 'Stella Montis Upper', x: 0.235001, y: 0.411999 };
  assert.equal(isOwnCommunityDuplicate('ZHomeSlice', ' zhomeslice ', samePoint, personal), true);
  assert.equal(isOwnCommunityDuplicate('OtherPlayer', 'ZHomeSlice', samePoint, personal), false);
  assert.equal(isOwnCommunityDuplicate('ZHomeSlice', '', samePoint, personal), false);
  assert.equal(isOwnCommunityDuplicate('ZHomeSlice', 'ZHomeSlice', { ...samePoint, name: 'Deadline' }, personal), false);
  assert.equal(isOwnCommunityDuplicate('ZHomeSlice', 'ZHomeSlice', { ...samePoint, map: 'Stella Montis Lower' }, personal), false);
  assert.equal(isOwnCommunityDuplicate('ZHomeSlice', 'ZHomeSlice', { ...samePoint, x: 0.24 }, personal), false);
});

test('keeps the best located and recognized discovery within a minute and removes its weaker duplicate', () => {
  const data = {
    finds: [
      { id: 'first', name: 'Seeker Grenade', foundAt: '2026-09-30T12:00:00.000Z', sightingId: 's1' },
      { id: 'best', name: ' seeker   grenade ', map: 'Stella Montis Upper', x: 0.4, y: 0.5,
        foundAt: '2026-09-30T12:00:45.000Z', sightingId: 's2' },
      { id: 'later', name: 'Seeker Grenade', foundAt: '2026-09-30T12:02:00.000Z' },
    ],
    sightings: [
      { id: 's1', name: 'Seeker Grenade', seenAt: '2026-09-30T12:00:00.000Z', savedFindId: 'first' },
      { id: 's2', name: 'Seeker Grenade', map: 'Stella Montis Upper', position: { x: 0.4, y: 0.5 },
        seenAt: '2026-09-30T12:00:45.000Z', savedFindId: 'best' },
      { id: 'false', name: 'Seeker Grenade', seenAt: '2026-09-30T12:00:50.000Z', dismissed: true },
      { id: 'unnamed', name: 'Unidentified blueprint', seenAt: '2026-09-30T12:00:50.000Z' },
    ],
  };

  assert.equal(removeRecentDuplicateDiscoveries(data), 2);
  assert.deepEqual(data.finds.map(find => find.id), ['best', 'later']);
  assert.deepEqual(data.sightings.map(sighting => sighting.id), ['s2', 'false', 'unnamed']);
});
