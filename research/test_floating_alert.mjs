import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260928150336_1.jpg');
const map = await readFile(folder + '20260928150339_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', error => console.error('PAGE ERROR', error.message));
  let nativeOpenRequests = 0;
  let nativeCloseRequests = 0;
  const visibilityCalls = [];
  await page.route('**/api/overlay/pip-visibility', route => {
    visibilityCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/overlay/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"open":true}' }));
  await page.route('**/api/overlay/close', route => {
    nativeCloseRequests++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"open":false}' });
  });
  await page.route('**/api/overlay/open', route => {
    nativeOpenRequests++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"open":true}' });
  });
  await page.route('**/test-floating-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/test-floating-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>image.width===960&&image.height===150?{data:{text:"STELLA MONTIS"}}:new Promise(()=>{})})};' }));
  await page.addInitScript(() => {
    const pipDocument = document.implementation.createHTMLDocument('ARC Blueprint Alert');
    const listeners = new Map();
    window.testPiP = {
      document: pipDocument, closed: false, innerHeight: 88,
      outerWidth: 406, outerHeight: 131, screenX: 2626, screenY: 1542,
      addEventListener(type, listener) { listeners.set(type, listener); },
      resizeTo(width, height) {
        const change = height - this.innerHeight;
        this.innerHeight = height; this.outerHeight += change; this.screenY -= change;
        listeners.get('resize')?.();
      },
      close() { this.closed = true; listeners.get('pagehide')?.(); },
    };
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true, value: { requestWindow: async () => window.testPiP },
    });
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Use browser floating alert' }).click();
  await page.waitForFunction(() => window.testPiP.document.querySelector('.floating-card'));
  assert.equal(nativeOpenRequests, 0);
  assert.equal(nativeCloseRequests, 1);
  assert.equal(visibilityCalls[0]?.visible, false);
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('#floating-state').textContent), 'Capture stopped');
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('.floating-card').classList.contains('expanded')), false);
  await page.getByRole('button', { name: 'Use full Stella Montis upper map' }).click();
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.evaluate(() => window.testSetFrame('/test-floating-inventory.jpg'));
  await page.waitForFunction(() => window.testPiP.document.querySelector('#floating-state').textContent === 'Scanning for blueprints');
  await page.evaluate(() => window.testSetFrame('/test-floating-inventory.jpg'));
  await page.waitForFunction(() => window.testPiP.document.querySelector('.floating-card')?.classList.contains('expanded'));
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('.floating-card').classList.contains('compact')), true);
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('#floating-state').textContent.includes('Blueprint spotted')), true);
  assert.ok((await page.evaluate(() => window.testPiP.document.querySelector('#floating-bar-icon').src)).startsWith('data:image/jpeg'));
  assert.equal(visibilityCalls.at(-1)?.visible, true);
  assert.equal(visibilityCalls.at(-1)?.targetViewportHeight, 330);
  await page.evaluate(() => window.testPiP.resizeTo(390, 330));
  assert.equal(await page.evaluate(() => window.testPiP.innerHeight), 330);
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('#floating-message').textContent), 'Press M and keep the in-game map open.');
  await page.evaluate(() => window.testSetFrame('/test-floating-map.jpg'));
  await page.waitForFunction(() => window.testPiP.document.querySelector('#floating-state').textContent === 'Pin saved');
  await page.waitForFunction(() => window.testPiP.document.querySelector('#floating-detail').textContent.includes('Stella Montis Upper'));
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('#floating-map').hidden), false);
  console.log('Browser alert showed the blueprint icon and captured map position.');
  await page.waitForFunction(() => window.testPiP.document.querySelector('#floating-state').textContent === 'Scanning for blueprints', null, { timeout: 13_000 });
  assert.equal(await page.evaluate(() => window.testPiP.document.querySelector('.floating-card').classList.contains('expanded')), false);
  assert.equal(visibilityCalls.at(-1)?.visible, false);
  assert.equal(visibilityCalls.at(-1)?.targetViewportHeight, 88);
  console.log('Floating alert hid 10 seconds after location capture.');
} finally { await browser.close(); }
