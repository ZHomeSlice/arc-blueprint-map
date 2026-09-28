import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  await page.evaluate(async () => {
    window.mapTitleWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: '/vendor/worker.min.js', corePath: '/vendor/tesseract-core-simd-lstm.wasm.js', langPath: '/vendor',
    });
    return true;
  });
  for (const filename of ['20260927194241_1.jpg', '20260928142435_1.jpg', '20260928150339_1.jpg']) {
    const bytes = await readFile(root + filename);
    const result = await page.evaluate(async url => {
      const { cropMapTitle, mapFamilyFromTitle } = await import('/map-detect.js');
      const image = new Image(); image.src = url; await image.decode();
      const result = await window.mapTitleWorker.recognize(cropMapTitle(image));
      return { text: result.data.text, confidence: result.data.confidence,
        family: mapFamilyFromTitle(result.data.text) };
    }, `data:image/jpeg;base64,${bytes.toString('base64')}`);
    console.log(filename, result);
    assert.equal(result.family, 'stella');
  }
} finally { await browser.close(); }
