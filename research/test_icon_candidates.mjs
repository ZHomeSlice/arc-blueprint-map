import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260927195813_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/test-defibrillator.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Use full Stella Montis upper map' }).click();
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/test-defibrillator.jpg'; await image.decode();
    const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
    frame.getContext('2d').drawImage(image, 0, 0, 1600, 900);
    const preview = document.createElement('canvas'); preview.width = 180; preview.height = 185;
    preview.getContext('2d').drawImage(frame, 390 * 1600 / 2048, 315 * 900 / 1152,
      105 * 1600 / 2048, 108 * 900 / 1152, 0, 0, 180, 185);
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    saved.sightings.unshift({ id: 'test-defibrillator', name: 'Unidentified blueprint',
      seenAt: new Date().toISOString(), frame: frame.toDataURL('image/jpeg', 0.55),
      tilePreview: preview.toDataURL('image/jpeg', 0.82), map: saved.currentMap,
      position: { x: 0.2, y: 0.55 }, savedFindId: null });
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.locator('.sighting-select').filter({ hasText: 'Unidentified blueprint' }).click();
  await page.locator('#icon-candidate-list button').filter({ hasText: 'Defibrillator' }).waitFor();
  assert.equal(await page.locator('#selected-blueprint-tile').isVisible(), true);
  assert.equal(await page.locator('#pins .sighting-pin').count(), 1);
  await page.locator('#icon-candidate-list button').filter({ hasText: 'Defibrillator' }).click();
  const saved = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    return { sighting: { name: data.sightings[0].name, savedFindId: data.sightings[0].savedFindId },
      find: { name: data.finds[0].name, x: data.finds[0].x, y: data.finds[0].y } };
  });
  assert.equal(saved.sighting.name, 'Defibrillator');
  assert.equal(saved.find.name, 'Defibrillator');
  assert.ok(saved.sighting.savedFindId);
  console.log(JSON.stringify(saved));
} finally { await browser.close(); }
