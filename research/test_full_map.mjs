import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';

const screenshotRoot = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots';
const cases = [
  ['first_medical', '20260927194241_1.jpg'],
  ['medical', '20260927195819_1.jpg'],
  ['business', '20260927202158_1.jpg'],
  ['business_later', '20260927202335_1.jpg'],
  ['inventory', '20260927202155_1.jpg'],
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [label, filename] of cases) {
    const data = await readFile(`${screenshotRoot}/${filename}`);
    const url = `data:image/jpeg;base64,${data.toString('base64')}`;
    const result = await page.evaluate(async (imageUrl) => {
      const { matchFullMap, pointOnFullMap } = await import('/full-map-match.js');
      const { detectPlayerArrow } = await import('/map-match.js');
      const base = new Image(); base.src = '/maps/stella-upper.jpg'; await base.decode();
      const frame = new Image(); frame.src = imageUrl; await frame.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      canvas.getContext('2d').drawImage(frame, 0, 0, canvas.width, canvas.height);
      const start = performance.now();
      const match = matchFullMap(base, canvas, { scales: [0.29, 0.30, 0.31], minScore: 0.62 });
      const arrow = detectPlayerArrow(canvas);
      return { match, arrow, point: match && arrow && pointOnFullMap(match, arrow), milliseconds: Math.round(performance.now() - start) };
    }, url);
    console.log(label, JSON.stringify(result));
  }
  await page.getByRole('button', { name: 'Add the 4 finds from your screenshots' }).click();
  await page.screenshot({ path: 'research/full-map-preview.png', fullPage: true });
  console.log('ui', JSON.stringify(await page.evaluate(() => ({
    title: document.querySelector('#current-map-title').textContent,
    count: document.querySelector('#find-count').textContent,
    pins: document.querySelectorAll('#pins .pin').length,
    image: getComputedStyle(document.querySelector('#map')).backgroundImage,
    ratio: getComputedStyle(document.querySelector('#map')).aspectRatio,
  }))));
  await page.reload();
  console.log('persisted', await page.locator('#find-count').textContent());
} finally { await browser.close(); }
