import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260928150336_1.jpg');
const map = await readFile(folder + '20260928150339_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const sent = [];
  let open = false;
  await page.route('**/api/overlay/**', async route => {
    const request = route.request();
    const action = new URL(request.url()).pathname;
    if (action.endsWith('/status')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ open }) });
    if (action.endsWith('/open')) open = true;
    if (action.endsWith('/close')) open = false;
    if (action.endsWith('/state') && request.method() === 'POST') sent.push(request.postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(action.endsWith('/state') ? { revision: sent.length } : { open }) });
  });
  await page.route('**/overlay-test-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/overlay-test-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>image.width===960&&image.height===150?{data:{text:"STELLA MONTIS"}}:new Promise(()=>{})})};' }));
  await page.addInitScript(() => {
    window.__forceNativeAlert = true;
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      await window.testSetFrame('/overlay-test-inventory.jpg');
      setTimeout(() => window.testSetFrame('/overlay-test-map.jpg'), 4000);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Open floating game alert' }).click();
  await page.waitForFunction(() => document.querySelector('#floating-alerts')?.textContent === 'Close floating game alert');
  assert.equal(open, true);
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1') || '{}').finds?.length === 1);
  await page.waitForFunction(() => !document.querySelector('#discovery-alert')?.classList.contains('expanded'), null, { timeout: 13_000 });
  assert.ok(sent.some(state => !state.expanded && state.bar === 'Scanning for blueprints'));
  assert.ok(sent.some(state => state.expanded && state.image?.startsWith('data:image/jpeg') &&
    state.message.includes('Open your in-game map')));
  assert.ok(sent.some(state => state.expanded && state.bar === 'Pin saved' &&
    state.mapImage?.startsWith('data:image/jpeg')));
  assert.equal(sent.at(-1).expanded, false);
  console.log('Windows overlay received scan, discovery, map, and collapse states.');
} finally { await browser.close(); }
