import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260928093759_1.jpg');
const map = await readFile(folder + '20260928093803_1.jpg');
const uncertain = await readFile(folder + '20260927195813_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/test-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/test-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/test-uncertain.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: uncertain }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>image.width===960&&image.height===150?{data:{text:"STELLA MONTIS"}}:new Promise(()=>{})})};' }));
  await page.addInitScript(() => {
    window.testNotifications = [];
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'default';
      static async requestPermission() { this.permission = 'granted'; return 'granted'; }
      constructor(title, options) { window.testNotifications.push({ title, body: options.body, icon: options.icon }); }
    } });
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      await window.testSetFrame('/test-inventory.jpg');
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Enable Windows notifications' }).click();
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => document.querySelector('#sighting-count')?.textContent === '1');
  await page.getByText('Blueprint spotted', { exact: true }).waitFor();
  if (!await page.locator('#alert-blueprint').evaluate(image => image.src.startsWith('data:image/jpeg'))) {
    throw new Error('Discovery card did not show a captured blueprint image');
  }
  if (!await page.locator('#alert-message').textContent().then(text => text.includes('Open your in-game map'))) {
    throw new Error('Discovery card did not prompt for the in-game map');
  }
  if (!await page.evaluate(() => window.testNotifications.some(notification =>
    notification.title.includes('Blueprint spotted') && notification.icon?.startsWith('data:image/jpeg')))) {
    throw new Error('Desktop discovery notification did not include the blueprint image after opt-in');
  }
  await page.evaluate(() => window.testSetFrame('/test-map.jpg'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].position);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].name === 'Looting Mk. 3 (Survivor)');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).finds[0]?.name === 'Looting Mk. 3 (Survivor)');
  if (await page.locator('#pins .pin:not(.sighting-pin)').count() !== 1) throw new Error('Confident icon match did not appear as a saved map pin');
  await page.waitForFunction(() => ['Location captured', 'Pin saved'].includes(document.querySelector('#alert-state')?.textContent));
  await page.locator('#alert-map-preview img').waitFor({ state: 'visible' });
  if (!await page.evaluate(() => window.testNotifications.some(notification => notification.title.includes('Location captured')))) {
    throw new Error('Desktop location notification was not sent after opt-in');
  }
  await page.getByRole('button', { name: 'View saved pin' }).click();
  if (!await page.locator('#discovery-alert').isHidden()) throw new Error('Discovery card covered the map during review');
  const result = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    return { currentMap: saved.currentMap, sighting: { name: saved.sightings[0].name, map: saved.sightings[0].map,
      position: saved.sightings[0].position,
      savedFindId: saved.sightings[0].savedFindId }, find: saved.finds[0], findCount: document.querySelector('#find-count').textContent };
  });
  if (result.findCount !== '1' || result.sighting.savedFindId !== result.find.id || !result.find.autoGenerated ||
    result.currentMap !== 'Stella Montis Upper' || result.sighting.map !== 'Stella Montis Upper' ||
    result.find.map !== 'Stella Montis Upper' ||
    Math.abs(result.find.x - 0.206914) > 0.005 || Math.abs(result.find.y - 0.602818) > 0.005) {
    throw new Error(`Sighting did not become a located pin: ${JSON.stringify(result)}`);
  }
  await page.evaluate(async () => {
    const image = new Image(); image.src = '/test-uncertain.jpg'; await image.decode();
    const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
    frame.getContext('2d').drawImage(image, 0, 0, 1600, 900);
    const preview = document.createElement('canvas'); preview.width = 180; preview.height = 185;
    preview.getContext('2d').drawImage(frame, 390 * 1600 / 2048, 315 * 900 / 1152,
      105 * 1600 / 2048, 108 * 900 / 1152, 0, 0, 180, 185);
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    saved.sightings.unshift({ id: 'stored-preview-recheck', name: 'Unidentified blueprint',
      seenAt: new Date().toISOString(), tilePreview: preview.toDataURL('image/jpeg', 0.82),
      position: { x: 0.4, y: 0.5 }, map: saved.currentMap, savedFindId: null });
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].iconCandidates?.length === 3);
  if (await page.locator('.sighting-select').first().textContent().then(text => !text.includes('Unidentified blueprint'))) {
    throw new Error('Uncertain icon was named automatically');
  }
  if (await page.locator('.pin.sighting-pin').count() !== 1) throw new Error('Saved located sighting was not restored as a blue pin');
  if (await page.locator('#pins .pin:not(.sighting-pin)').count() !== 1) throw new Error('Reload changed the previously saved find');
  console.log(JSON.stringify({ name: result.find.name, position: result.sighting.position, findCount: result.findCount }));
} finally { await browser.close(); }
