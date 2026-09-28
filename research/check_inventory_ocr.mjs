import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const screenshot = await readFile('C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/20260927195813_1.jpg');
  await page.route('**/test-raid.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: screenshot }));
  await page.goto('http://127.0.0.1:4177/');
  const text = await page.evaluate(async () => {
    const image = new Image(); image.src = '/test-raid.jpg'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
    canvas.getContext('2d').drawImage(image, 0, 0, 1600, 900);
    const worker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: '/vendor/worker.min.js', corePath: '/vendor/tesseract-core-simd-lstm.wasm.js', langPath: '/vendor',
    });
    try { return (await worker.recognize(canvas)).data.text; }
    finally { await worker.terminate(); }
  });
  console.log(text.slice(0, 1200));
  if (!/\b(?:CONTAINER|LOADOUT|BACKPACK)\b/i.test(text)) throw new Error('Inventory context was not recognized');
} finally { await browser.close(); }
