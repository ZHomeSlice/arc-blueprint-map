import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  ['20260927195813_1.jpg', 'CONTAINER LOADOUT BACKPACK', [3]],
  ['20260927202155_1.jpg', 'CONTAINER LOADOUT BACKPACK', [2]],
  ['20260928093759_1.jpg', 'CONTAINER LOADOUT BACKPACK', [3]],
  ['20260928083711_1.jpg', 'BLUEPRINTS FOUND: 73/83', []],
  ['20260928083718_1.jpg', 'BLUEPRINTS FOUND: 73/83', []],
  ['20260927195819_1.jpg', 'STELLA MONTIS MAP', []],
];
const feedbackRoot = new URL('./fixtures/feedback-2026-10-01/', import.meta.url);
const feedback = JSON.parse((await readFile(new URL('manifest.json', feedbackRoot), 'utf8')).replace(/^\uFEFF/, ''));
const capturedCases = await Promise.all(feedback.filter(example => example.capturedFrameFile).map(async example => [
  `feedback-${example.id}`, `data:image/jpeg;base64,${(await readFile(new URL(example.capturedFrameFile, feedbackRoot))).toString('base64')}`,
  example.frameBlueprintSlots,
]));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [file, text, expected] of cases) {
    const encoded = (await readFile(folder + file)).toString('base64');
    const actual = await page.evaluate(async ({ encoded, text }) => {
      const { detectBlueprintTiles } = await import('/blueprint-visual.js');
      const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 1600, 900);
      return detectBlueprintTiles(context.getImageData(0, 0, 1600, 900), text);
    }, { encoded, text });
    const slots = actual.map(match => match.slot);
    if (JSON.stringify(slots) !== JSON.stringify(expected)) throw new Error(`${file}: expected ${expected}, got ${JSON.stringify(actual)}`);
    console.log(file, JSON.stringify(actual));
  }
  for (const [label, url, expected] of capturedCases) {
    const actual = await page.evaluate(async imageUrl => {
      const { detectBlueprintTiles } = await import('/blueprint-visual.js');
      const image = new Image(); image.src = imageUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 1600, 900);
      return detectBlueprintTiles(context.getImageData(0, 0, 1600, 900), 'CONTAINER LOADOUT');
    }, url);
    const slots = actual.map(match => match.slot);
    if (JSON.stringify(slots) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${expected}, got ${JSON.stringify(actual)}`);
    console.log(label, JSON.stringify(actual));
  }
} finally { await browser.close(); }
