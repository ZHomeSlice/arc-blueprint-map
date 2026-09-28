import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const screenshot = await readFile('C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/20260927195813_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/test-raid.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: screenshot }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:window.testOcrText}})})};',
  }));
  await page.addInitScript(() => {
    window.testOcrText = 'CONTAINER LOADOUT BACKPACK';
    navigator.mediaDevices.getDisplayMedia = async () => {
      const image = new Image(); image.src = '/test-raid.jpg'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => document.querySelector('#sighting-count')?.textContent === '1');
  const unknown = await page.evaluate(() => ({
    name: JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].name,
    input: document.querySelector('#blueprint-name').value,
  }));
  if (unknown.name !== 'Unidentified blueprint' || unknown.input) throw new Error(`Visual sighting failed: ${JSON.stringify(unknown)}`);
  await page.evaluate(() => { window.testOcrText = 'DEFIBRILLATOR BLUEPRINT'; });
  await page.waitForFunction(() => document.querySelector('#blueprint-name')?.value === 'DEFIBRILLATOR');
  const named = await page.evaluate(() => ({
    count: document.querySelector('#sighting-count').textContent,
    sighting: JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].name,
  }));
  if (named.count !== '1' || named.sighting !== 'DEFIBRILLATOR') throw new Error(`Upgrade failed: ${JSON.stringify(named)}`);
  console.log(JSON.stringify({ unknown, named }));
} finally { await browser.close(); }
