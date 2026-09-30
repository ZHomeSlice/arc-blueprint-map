import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const image = await readFile('C:/Users/zhome/AppData/Local/Temp/codex-clipboard-4a4eb55a-1c32-4b8c-9ea3-9dc33c8109e7.png');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/player-header.png', route => route.fulfill({ status: 200, contentType: 'image/png', body: image }));
  await page.goto('http://127.0.0.1:4177/');
  const result = await page.evaluate(async () => {
    const image = new Image(); image.src = '/player-header.png'; await image.decode();
    const crop = document.createElement('canvas'); crop.width = Math.round(image.width * .22) * 3; crop.height = image.height * 3;
    crop.getContext('2d').drawImage(image, image.width - crop.width / 3, 0, crop.width / 3, image.height, 0, 0, crop.width, crop.height);
    const worker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: '/vendor/worker.min.js', corePath: '/vendor/tesseract-core-simd-lstm.wasm.js', langPath: '/vendor',
    });
    try { await worker.setParameters({ tessedit_pageseg_mode: '7' }); return (await worker.recognize(crop)).data.text.trim(); }
    finally { await worker.terminate(); }
  });
  console.log(result);
  if (!/ZHomeSlice/i.test(result)) throw new Error('Player name was not read from the supplied header crop.');
} finally { await browser.close(); }
