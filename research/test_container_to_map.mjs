import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260928142439_1.jpg');
const secondBlueprint = await readFile(folder + '20260927195813_1.jpg');
const map = await readFile(folder + '20260928142435_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/test-seeker-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/test-second-blueprint.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: secondBlueprint }));
  await page.route('**/test-seeker-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>({data:{text:image.width===960&&image.height===150?"STELLA MONTIS":window.testOcrText}})})};' }));
  await page.addInitScript(() => {
    window.testOcrText = 'SEEKER GRENADE BLUEPRINT';
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      await window.testSetFrame('/test-seeker-inventory.jpg');
      // The original fixture contains only one blueprint. Add a distinct,
      // real Defibrillator tile to slot two to exercise a two-item container.
      const second = new Image(); second.src = '/test-second-blueprint.jpg'; await second.decode();
      canvas.getContext('2d').drawImage(second, 390 / 2048 * second.width, 315 / 1152 * second.height,
        105 / 2048 * second.width, 108 / 1152 * second.height,
        280 / 2048 * canvas.width, 315 / 1152 * canvas.height, 105 / 2048 * canvas.width, 108 / 1152 * canvas.height);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.locator('#preset-map').selectOption('stella-upper');
  await page.locator('#use-preset-map').click();
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings.some(s => s.name === 'SEEKER GRENADE'));
  await page.evaluate(() => { window.testOcrText = 'DEFIBRILLATOR BLUEPRINT'; });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings.some(s => s.name === 'DEFIBRILLATOR'));
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings.map(s => ({ name: s.name, position: s.position })));
  if (before.some(s => s.position)) throw new Error(`An inventory frame was treated as a map: ${JSON.stringify(before)}`);
  await page.evaluate(() => window.testSetFrame('/test-seeker-map.jpg'));
  await page.waitForFunction(() => {
    const sightings = JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings;
    return sightings.length >= 2 && sightings.every(s => s.position);
  });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings.map(s =>
    ({ name: s.name, position: s.position, map: s.map })));
  if (after.some(s => Math.abs(s.position.x - 0.67017) > 0.01 || Math.abs(s.position.y - 0.26755) > 0.01)) {
    throw new Error(`One container's blueprints did not use the real map location: ${JSON.stringify(after)}`);
  }
  const autoSaved = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    return { sightings: saved.sightings.map(s => ({ name: s.name, savedFindId: s.savedFindId })), finds: saved.finds.map(f => f.name) };
  });
  if (autoSaved.sightings.some(s => !s.savedFindId) || autoSaved.finds.length !== 2) {
    throw new Error(`Named sightings were not logged as finds: ${JSON.stringify(autoSaved)}`);
  }
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    for (const sighting of saved.sightings) { sighting.position = { x: 0.10, y: 0.74 }; sighting.savedFindId = null; }
    saved.finds = [];
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.locator('.sighting-select').filter({ hasText: 'SEEKER GRENADE' }).click();
  await page.locator('#saved-map-screenshot').setInputFiles(folder + '20260928142439_1.jpg');
  await page.getByText('That screenshot does not show the in-game map.', { exact: false }).waitFor();
  await page.locator('#saved-map-screenshot').setInputFiles(folder + '20260928142435_1.jpg');
  await page.getByText('Corrected map position for 2 sightings.', { exact: false }).waitFor();
  const corrected = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings.map(s => s.position));
  if (corrected.some(position => Math.abs(position.x - 0.67017) > 0.01 || Math.abs(position.y - 0.26755) > 0.01)) {
    throw new Error(`Saved map screenshot did not repair both sightings: ${JSON.stringify(corrected)}`);
  }
  console.log(JSON.stringify(after));
} catch (error) {
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    console.error('Container-to-map failure:', await page.evaluate(() => ({ status: document.querySelector('#status')?.textContent,
      ocr: document.querySelector('#ocr-text')?.textContent,
      sightings: JSON.parse(localStorage.getItem('arc-blueprint-map-v1'))?.sightings.map(({ name, nameSource, position }) => ({ name, nameSource, position })) })));
  }
  throw error;
} finally { await browser.close(); }
