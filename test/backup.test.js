import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, cleanStoredData, emptyData, isNormalizedPosition } from '../public/backup.js';

const find = { id: 'good', name: 'Defibrillator', map: 'Stella Montis Upper', x: 0.25, y: 0.75,
  foundAt: '2026-10-01T12:00:00Z' };

test('version 2 backup round-trips normalized positions and uses map IDs without backgrounds', () => {
  const data = emptyData(); data.finds = [{ ...find }];
  const backup = JSON.parse(JSON.stringify(buildBackup(data)));
  assert.equal(backup.version, 2);
  assert.equal(backup.coordinateSystem, 'normalized-map');
  assert.deepEqual(backup.maps['Stella Montis Upper'], { presetId: 'stella-upper' });
  assert.equal(JSON.stringify(backup).includes('/maps/'), false);
  const imported = parseBackup(backup);
  assert.equal(imported.maps['Stella Montis Upper'].mode, 'stella-upper');
  assert.deepEqual(imported.finds, [find]);
});

test('older backups and mislabeled coordinate systems are rejected', () => {
  assert.throws(() => parseBackup({ version: 1, maps: {}, finds: [] }), /Older backups/);
  const backup = buildBackup(emptyData());
  for (const coordinateSystem of ['pixels', 'percent', undefined]) {
    assert.throws(() => parseBackup({ ...backup, coordinateSystem }), /Older backups/);
  }
});

test('version 2 imports reject pixels, strings, invalid maps and altered map references', () => {
  const data = emptyData(); data.finds = [{ ...find }];
  for (const patch of [{ x: 250 }, { y: -1 }, { x: '0.25' }, { x: NaN }, { map: 'Custom map' }, { coordinateSystem: 'pixels' }]) {
    const backup = buildBackup(data); backup.finds = [{ ...find, ...patch }];
    assert.throws(() => parseBackup(backup), /invalid records/);
  }
  const backup = buildBackup(data);
  backup.maps['Stella Montis Upper'] = { presetId: 'stella-lower' };
  assert.throws(() => parseBackup(backup), /built-in map references/);
  backup.maps['Stella Montis Upper'] = { presetId: 'stella-upper', image: 'data:image/png;base64,old' };
  assert.throws(() => parseBackup(backup), /built-in map references/);
});

test('duplicate IDs and invalid sighting positions cannot enter a new backup', () => {
  const data = emptyData(); data.finds = [{ ...find }, { ...find, name: 'Aphelion' }];
  assert.throws(() => parseBackup(buildBackup(data)), /duplicate record IDs/);
  data.finds = [];
  for (const position of [0, { x: 500, y: 300 }, { x: 0.3, y: '0.5' }]) {
    data.sightings = [{ id: 's', name: 'Aphelion', map: find.map, seenAt: find.foundAt, position }];
    assert.throws(() => parseBackup(buildBackup(data)), /invalid records/);
  }
});

test('local cleanup discards custom and pixel records while preserving verified built-in records', () => {
  const saved = emptyData(); delete saved.coordinateSystem; saved.version = 1;
  saved.maps.Custom = { image: 'data:image/png;base64,old', ratio: 16 / 9 };
  saved.maps['Buried City'] = { image: 'custom.jpg', mode: 'buried-city' };
  saved.finds = [{ ...find }, { ...find, id: 'pixel', x: 350 }, { ...find, id: 'custom', map: 'Custom' },
    { ...find, id: 'wrong-background', map: 'Buried City' }];
  saved.sightings = [{ id: 's', name: 'Aphelion', seenAt: find.foundAt, map: find.map, position: { x: 500, y: 200 } }];
  const { data, removed } = cleanStoredData(saved);
  assert.deepEqual(data.finds.map(find => find.id), ['good']);
  assert.equal(data.finds[0].x, 0.25);
  assert.deepEqual(removed, { maps: 2, finds: 3, sightings: 1 });
  assert.equal('Custom' in data.maps, false);
  assert.equal(data.maps['Buried City'].image, '/maps/buried-city.jpg');
  assert.equal(data.version, 2);
});

test('pixel-tagged local data is never reinterpreted even when numbers fall between 0 and 1', () => {
  const saved = emptyData(); saved.coordinateSystem = 'pixels'; saved.finds = [find];
  assert.equal(cleanStoredData(saved).data.finds.length, 0);
  assert.equal(isNormalizedPosition({ x: 0, y: 1 }), true);
  assert.equal(isNormalizedPosition({ x: 1.01, y: 0 }), false);
});
