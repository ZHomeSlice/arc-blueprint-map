import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const url = process.env.BLUEPRINT_TEST_URL || 'http://127.0.0.1:4177/';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  for (const selector of ['#map-name', '#use-map', '#use-stella-upper', '#map-image', '#use-frame-map']) {
    assert.equal(await page.locator(selector).count(), 0, `${selector} is still present`);
  }
  assert.equal(await page.locator('#preset-map option').count(), 9);
  await page.evaluate(async () => {
    const { emptyData } = await import('/backup.js');
    const data = emptyData(); data.version = 1; delete data.coordinateSystem;
    data.maps.Legacy = { image: 'data:image/png;base64,old', ratio: 16 / 9 };
    data.currentMap = 'Legacy';
    const good = { id: 'keep', name: 'Defibrillator', map: 'Stella Montis Upper', x: .25, y: .75,
      foundAt: '2026-10-01T12:00:00Z' };
    data.finds = [good, { ...good, id: 'pixels', x: 500, y: 200 }, { ...good, id: 'custom', map: 'Legacy' }];
    data.sightings = [{ id: 'pixel-sighting', name: 'Aphelion', map: good.map,
      seenAt: good.foundAt, position: { x: 300, y: 400 } }];
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(data));
  });
  await page.reload();
  assert.equal(await page.locator('[data-pin-id="keep"]').count(), 1);
  assert.equal(await page.locator('[data-pin-id="pixels"], [data-pin-id="custom"], [data-pin-id="pixel-sighting"]').count(), 0);
  assert.match(await page.locator('#data-cleanup-notice').textContent(), /1 legacy maps, 2 unsupported finds, and 1 unsupported sightings/);
  const snapshot = () => page.evaluate(() => localStorage.getItem('arc-blueprint-map-v1'));
  const clean = await snapshot();
  assert.equal(JSON.parse(clean).version, 2);
  const file = payload => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await page.locator('#import-data').setInputFiles(file({ version: 1, maps: {}, finds: [] }));
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Older backups are no longer supported'));
  assert.equal(await snapshot(), clean, 'Rejected legacy backup changed current data');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-data').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^arc-blueprint-map-v2-/);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(backup.version, 2);
  assert.equal(backup.coordinateSystem, 'normalized-map');
  assert.deepEqual(backup.maps['Stella Montis Upper'], { presetId: 'stella-upper' });
  assert.equal(backup.finds[0].x, .25);
  assert.equal(JSON.stringify(backup.maps).includes('image'), false);
  const invalid = structuredClone(backup); invalid.finds[0].x = 400;
  await page.locator('#import-data').setInputFiles(file(invalid));
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Backup contains invalid records'));
  assert.equal(await snapshot(), clean, 'Rejected pixel backup changed current data');
  if (process.env.BLUEPRINT_TEST_SCREENSHOT) await page.locator('section.card').first().screenshot({ path: process.env.BLUEPRINT_TEST_SCREENSHOT });
  const restored = await browser.newPage();
  await restored.goto(url);
  await restored.locator('#import-data').setInputFiles(file(backup));
  await restored.waitForFunction(() => document.querySelector('#status').textContent === 'Version 2 backup imported');
  await restored.reload();
  await restored.locator('[data-pin-id="keep"]').click();
  assert.match(await restored.locator('#pin-popup-details').textContent(), /25% across, 75% down/);
  await restored.locator('#import-data').setInputFiles(file(backup));
  await restored.waitForFunction(() => document.querySelector('#status').textContent === 'Version 2 backup imported');
  assert.equal(await restored.locator('[data-pin-id="keep"]').count(), 1, 'Repeated import duplicated the find');
  assert.deepEqual(errors, []);
  console.log('Legacy controls removed; unsafe local data discarded; old and pixel backups rejected without mutation; new backup export/import/reload passed.');
} finally {
  await browser.close();
}
