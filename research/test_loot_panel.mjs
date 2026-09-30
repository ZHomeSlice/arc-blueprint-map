import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  ['20260927195813_1.jpg', true, [3]],
  ['20260927202155_1.jpg', true, [2]],
  ['20260928093759_1.jpg', true, [3]],
  ['20260928083711_1.jpg', false, []],
  ['20260928083718_1.jpg', false, []],
  ['20260927195819_1.jpg', false, []],
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [file, expectedPanel, expectedSlots] of cases) {
    const encoded = (await readFile(folder + file)).toString('base64');
    const actual = await page.evaluate(async encoded => {
      const { isLootPanelVisible, detectBlueprintTiles } = await import('/blueprint-visual.js');
      const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 1600, 900);
      const pixels = context.getImageData(0, 0, 1600, 900);
      return { panel: isLootPanelVisible(pixels), slots: detectBlueprintTiles(pixels, 'CONTAINER LOADOUT').map(tile => tile.slot) };
    }, encoded);
    if (actual.panel !== expectedPanel || JSON.stringify(actual.slots) !== JSON.stringify(expectedSlots))
      throw new Error(`${file}: expected ${expectedPanel}/${expectedSlots}, got ${JSON.stringify(actual)}`);
    console.log(file, JSON.stringify(actual));
  }
} finally { await browser.close(); }
