import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const backup = JSON.parse(await readFile('C:/Users/zhome/Downloads/arc-blueprint-map-2026-09-28.json', 'utf8'));
const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = backup.sightings.map((entry, index) => ({ label: `sighting-${index}-${entry.seenAt}`, url: entry.frame }));
for (const name of ['20260928093759_1.jpg', '20260927195813_1.jpg', '20260927202155_1.jpg']) {
  cases.push({ label: name, url: `data:image/jpeg;base64,${(await readFile(folder + name)).toString('base64')}` });
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:4177/');
  for (const item of cases) {
    const result = await page.evaluate(async url => {
      const source = new Image(); source.src = url; await source.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(source, 0, 0, 1600, 900);
      const image = context.getImageData(0, 0, 1600, 900); const data = image.data;
      const fractions = [];
      for (let slot = 0; slot < 8; slot++) {
        const sx = [169, 280, 390, 502][slot % 4], sy = slot < 4 ? 315 : 427;
        const parts = [];
        for (const [x1, x2, y1, y2] of [[5, 100, 5, 85], [55, 95, 5, 40], [10, 45, 5, 40], [55, 95, 45, 80]]) {
          let blue = 0, count = 0;
          for (let y = sy + y1; y < sy + y2; y += 2) for (let x = sx + x1; x < sx + x2; x += 2) {
            const px = Math.floor(x * 1600 / 2048), py = Math.floor(y * 900 / 1152), o = (py * 1600 + px) * 4;
            const r = data[o], g = data[o + 1], b = data[o + 2];
            if (b > 45 && b > r * 1.35 && b > g * 1.12 && g > 20) blue++;
            count++;
          }
          parts.push(Math.round(100 * blue / count));
        }
        fractions.push(parts);
      }
      const iconSlots = [1, 2];
      const masks = iconSlots.map(slot => {
        const sx = [169, 280, 390, 502][slot], sy = 315;
        const rows = [];
        for (let y = sy + 80; y < sy + 106; y += 2) {
          let row = '';
          for (let x = sx + 3; x < sx + 31; x += 2) {
            const px = Math.floor(x * 1600 / 2048), py = Math.floor(y * 900 / 1152), o = (py * 1600 + px) * 4;
            const r = data[o], g = data[o + 1], b = data[o + 2];
            row += r > 160 && g > 160 && b > 160 ? '#' : '.';
          }
          rows.push(row);
        }
        return rows.join('/');
      });
      return { fractions, masks };
    }, item.url);
    console.log(item.label, JSON.stringify(result));
  }
} finally { await browser.close(); }
