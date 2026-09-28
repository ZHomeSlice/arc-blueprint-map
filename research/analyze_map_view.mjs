import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const files = ['20260928142435_1.jpg', '20260928142439_1.jpg', '20260928093803_1.jpg', '20260928093759_1.jpg',
  '20260928091348_1.jpg', '20260928091343_1.jpg', '20260927202158_1.jpg', '20260927202155_1.jpg'];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [index, file] of files.entries()) {
    const data = await readFile(folder + file);
    const result = await page.evaluate(async url => {
      const { isArcMapView } = await import('/map-match.js');
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1152;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 2048, 1152);
      const pixels = context.getImageData(0, 0, 2048, 1152).data;
      function region(x0, y0, x1, y1) {
        let sum = 0, square = 0, bright = 0, count = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * 2048 + x) * 4;
          const value = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) / 256;
          sum += value; square += value * value; if (value > 150) bright++; count++;
        }
        return { mean: Math.round(sum / count), std: Math.round(Math.sqrt(square / count - (sum / count) ** 2)), bright: +(bright / count).toFixed(3) };
      }
      return { detected: isArcMapView(canvas), mapTab: region(1000, 25, 1090, 70), inventoryTab: region(675, 25, 835, 70), patch: region(870, 440, 1040, 540) };
    }, `data:image/jpeg;base64,${data.toString('base64')}`);
    console.log(file, JSON.stringify(result));
    if (result.detected !== (index % 2 === 0)) throw new Error(`Map view misclassified: ${file}`);
  }
} finally { await browser.close(); }
