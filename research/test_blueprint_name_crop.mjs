import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  ['20260927195813_1.jpg', 'Defibrillator'],
  ['20260927202155_1.jpg', 'Aphelion'],
  ['20260928093759_1.jpg', null],
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [file, expected] of cases) {
    const encoded = (await readFile(folder + file)).toString('base64');
    const result = await page.evaluate(async encoded => {
      const { blueprintFromText } = await import('/logic.js');
      const { cropBlueprintName } = await import('/ocr-crop.js');
      const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
      const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
      frame.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      const worker = await window.Tesseract.createWorker('eng', 1, {
        workerPath: '/vendor/worker.min.js', corePath: '/vendor/tesseract-core-simd-lstm.wasm.js', langPath: '/vendor',
      });
      try {
        const start = performance.now();
        const text = (await worker.recognize(cropBlueprintName(frame))).data.text;
        return { ms: Math.round(performance.now() - start), name: blueprintFromText(text), text: text.slice(0, 500) };
      } finally { await worker.terminate(); }
    }, encoded);
    console.log(file, JSON.stringify(result));
    if (expected ? result.name?.toLowerCase() !== expected.toLowerCase() : result.name !== null)
      throw new Error(`${file}: expected ${expected}, got ${result.name}`);
  }
} finally { await browser.close(); }
