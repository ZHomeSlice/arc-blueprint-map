import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const screenshots = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const first = await readFile(screenshots + '20260928091343_1.jpg');
const second = await readFile(screenshots + '20260927202155_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/feedback-first.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: first }));
  await page.route('**/feedback-second.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: second }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"CONTAINER LOADOUT BACKPACK"}})})};' }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const image = new Image(); image.src = '/feedback-first.jpg'; await image.decode();
      canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      window.feedbackCanvas = canvas;
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/feedback-first.jpg'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
    canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
    const preview = document.createElement('canvas'); preview.width = 180; preview.height = 185;
    preview.getContext('2d').drawImage(canvas, 390 * 1600 / 2048, 315 * 900 / 1152,
      105 * 1600 / 2048, 108 * 900 / 1152, 0, 0, 180, 185);
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1')) ||
      { version: 1, currentMap: '', maps: {}, finds: [], sightings: [] };
    saved.sightings.unshift({ id: 'dismissed-example', name: 'Unidentified blueprint', dismissed: true,
      seenAt: new Date().toISOString(), frame: canvas.toDataURL('image/jpeg', 0.55),
      tilePreview: preview.toDataURL('image/jpeg', 0.82), savedFindId: null });
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(saved));
  });
  await page.reload();
  assert.equal(await page.locator('#sighting-count').textContent(), '0');
  assert.equal(await page.locator('#reviewed-count').textContent(), '1');
  assert.equal(await page.locator('#sighting-list li').count(), 0);
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForTimeout(1600);
  assert.equal(await page.locator('#sighting-count').textContent(), '0', 'Dismissed tile repeated as a new alert');
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/feedback-second.jpg'; await image.decode();
    window.feedbackCanvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
  });
  await page.waitForFunction(() => document.querySelector('#sighting-count')?.textContent === '1');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].name === 'Aphelion');
  await page.locator('#reviewed-sightings summary').click();
  await page.locator('#reviewed-list').getByRole('button', { name: 'Restore' }).click();
  assert.equal(await page.locator('#sighting-count').textContent(), '2');
  assert.equal(await page.locator('#reviewed-sightings').isVisible(), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).dismissedTiles.length), 0);
  await page.locator('#sighting-list .icon-btn').first().click();
  assert.equal(await page.locator('#sighting-count').textContent(), '1');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).dismissedTiles.length), 1);
  await page.evaluate(() => window.feedbackCanvas.getContext('2d').clearRect(0, 0, 1600, 900));
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/feedback-second.jpg'; await image.decode();
    window.feedbackCanvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
  });
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#sighting-count').textContent(), '1', 'Newly dismissed tile repeated as a new alert');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.locator('#forget-dismissed').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).dismissedTiles.length), 0);
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).dismissedTiles.length), 0,
    'Forgotten examples returned after reload');
  await page.evaluate(() => localStorage.removeItem('arc-blueprint-map-v1'));
  await page.reload();
  await page.locator('#preset-map').selectOption('stella-upper');
  await page.locator('#use-preset-map').click();
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/feedback-second.jpg'; await image.decode();
    const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
    frame.getContext('2d').drawImage(image, 0, 0, 1600, 900);
    const preview = document.createElement('canvas'); preview.width = 180; preview.height = 185;
    preview.getContext('2d').drawImage(frame, 280 * 1600 / 2048, 315 * 900 / 1152,
      105 * 1600 / 2048, 108 * 900 / 1152, 0, 0, 180, 185);
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    saved.sightings.unshift({ id: 'old-unknown-aphelion', name: 'Unidentified blueprint',
      seenAt: new Date().toISOString(), frame: frame.toDataURL('image/jpeg', 0.55),
      tilePreview: preview.toDataURL('image/jpeg', 0.82), map: saved.currentMap,
      position: { x: 0.4, y: 0.5 }, savedFindId: null });
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].name === 'Aphelion');
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
  assert.equal(recovered.finds[0]?.name, 'Aphelion');
  assert.ok(recovered.sightings[0].savedFindId);
  console.log('Dismissed tile stayed hidden, a different blueprint was recognized, and restore worked.');
} finally { await browser.close(); }
