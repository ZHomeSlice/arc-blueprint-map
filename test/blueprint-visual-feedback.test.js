import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { inspectBlueprintTile } from '../public/blueprint-visual.js';

// Lossless RGBA decoded from the supplied JPEGs, packed for dependency-free Node
// tests. The source captures and labels remain beside this pixel fixture.
const fixtures = JSON.parse(gunzipSync(readFileSync(new URL(
  '../research/fixtures/feedback-2026-10-01/tile-pixels.json.gz', import.meta.url))));

for (const fixture of fixtures) {
  test(`human-labeled ${fixture.verdict}: ${fixture.id}`, () => {
    const image = { width: fixture.width, height: fixture.height,
      data: Buffer.from(fixture.rgba, 'base64') };
    assert.equal(inspectBlueprintTile(image).isBlueprint, fixture.verdict === 'blueprint');
  });
}

test('an unavailable tile cannot supply blueprint evidence', () => {
  assert.equal(inspectBlueprintTile({ width: 1, height: 1, data: new Uint8ClampedArray(4) }).isBlueprint, false);
});
