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
  await page.route('**/test-floating-inventory.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: inventory }));
  await page.route('**/test-floating-map.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: map }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async image=>image.width===960&&image.height===150?{data:{text:"STELLA MONTIS"}}:new Promise(()=>{})})};' }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetFrame = async file => {
        const image = new Image(); image.src = file; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      };
      await window.testSetFrame('/test-floating-inventory.jpg');
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  assert.equal(await page.evaluate(() => Boolean(window.documentPictureInPicture)), true);
  const floatingEvent = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open floating game alert' }).click();
  const floating = await floatingEvent;
  await floating.waitForFunction(() => getComputedStyle(document.documentElement).backgroundColor === 'rgb(17, 27, 26)');
  await floating.getByText('Waiting for a blueprint').waitFor();
  await page.getByRole('button', { name: 'Use full Stella Montis upper map' }).click();
  await page.getByRole('button', { name: 'Start capture' }).click();
  await floating.getByText('Deadline').waitFor();
  await floating.getByText('Press M and keep the in-game map open.').waitFor();
  assert.ok((await floating.locator('#floating-blueprint').getAttribute('src')).startsWith('data:image/jpeg'));
  await page.evaluate(() => window.testSetFrame('/test-floating-map.jpg'));
  await floating.getByText('Pin saved').waitFor();
  await floating.getByText('Stella Montis Upper', { exact: false }).waitFor();
  assert.equal(await floating.locator('#floating-map').isVisible(), true);
  console.log('Floating alert showed the blueprint icon and captured map position.');
} finally { await browser.close(); }
