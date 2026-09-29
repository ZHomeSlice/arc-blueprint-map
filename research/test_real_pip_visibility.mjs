import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = new URL('../', import.meta.url);
const script = fileURLToPath(new URL('../Windows-Pip-Visibility.ps1', import.meta.url));
const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const inventory = await readFile(folder + '20260928150336_1.jpg');
const map = await readFile(folder + '20260928150339_1.jpg');

function isVisible(bounds) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', 'Status',
    '-Left', String(bounds.left), '-Top', String(bounds.top),
    '-Width', String(bounds.width), '-Height', String(bounds.height)];
  return execFileSync('powershell.exe', args, { cwd: fileURLToPath(root), windowsHide: true,
    encoding: 'utf8' }).trim() === 'True';
}

async function waitVisible(bounds, expected, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (isVisible(bounds) === expected) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.equal(isVisible(bounds), expected);
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false });
try {
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('PAGE ERROR', error.message));
  await page.route('**/api/overlay/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"open":false}' }));
  await page.route('**/real-pip-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/real-pip-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>image.width===960&&image.height===150?{data:{text:"STELLA MONTIS"}}:new Promise(()=>{})})};' }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      await window.testSetFrame('/real-pip-inventory.jpg');
      setTimeout(() => window.testSetFrame('/real-pip-map.jpg'), 5000);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Open floating game alert' }).click();
  await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('.floating-card'));
  const bounds = await page.evaluate(() => {
    const pip = documentPictureInPicture.window;
    return { left: pip.screenX, top: pip.screenY, width: pip.outerWidth, height: pip.outerHeight };
  });
  await waitVisible(bounds, false);
  assert.ok(bounds.height < 200, 'PiP should be compact before a discovery');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => document.querySelector('#discovery-alert')?.classList.contains('expanded'));
  await page.waitForFunction(() => documentPictureInPicture.window?.innerHeight >= 250);
  const expandedBounds = await page.evaluate(() => {
    const pip = documentPictureInPicture.window;
    return { left: pip.screenX, top: pip.screenY, width: pip.outerWidth, height: pip.outerHeight };
  });
  await waitVisible(expandedBounds, true);
  await page.waitForFunction(() => !document.querySelector('#discovery-alert')?.classList.contains('expanded'), null, { timeout: 18_000 });
  await page.waitForFunction(() => documentPictureInPicture.window?.innerHeight < 150);
  const hiddenBounds = await page.evaluate(() => {
    const pip = documentPictureInPicture.window;
    return { left: pip.screenX, top: pip.screenY, width: pip.outerWidth, height: pip.outerHeight };
  });
  await waitVisible(hiddenBounds, false);
  assert.equal(await page.evaluate(() => Boolean(documentPictureInPicture.window && !documentPictureInPicture.window.closed)), true);
  console.log('Real Chrome PiP stayed open, showed the blueprint, then hid after the map timer.');
} finally { await browser.close(); }
