import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  ['20260927195813_1.jpg', true, [3], false],
  ['20260927202155_1.jpg', true, [2], false],
  ['20260928093759_1.jpg', true, [3], false],
  ['20260928083711_1.jpg', false, [], false],
  ['20260928083718_1.jpg', false, [], false],
  ['20260927195819_1.jpg', false, [], true],
  ['20260928093803_1.jpg', false, [], true],
  ['20260928150339_1.jpg', false, [], true],
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [file, panel, slots, map] of cases) {
    const encoded = (await readFile(folder + file)).toString('base64');
    const actual = await page.evaluate(async encoded => {
      const { CaptureRegions } = await import('/capture-regions.js');
      const { isLootPanelVisible, detectBlueprintTiles } = await import('/blueprint-visual.js');
      const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
      const results = [];
      for (const width of [1280, 1600, 3840]) {
        const source = document.createElement('canvas'); source.width = width; source.height = width * 9 / 16;
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
        const regions = new CaptureRegions();
        const foundPanel = regions.lootPanelVisible(source);
        const croppedSlots = foundPanel ? regions.blueprintTiles(source).map(tile => tile.slot) : [];
        const frame = document.createElement('canvas'); frame.width = Math.min(1600, width); frame.height = frame.width * 9 / 16;
        const context = frame.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, 0, 0, frame.width, frame.height);
        const full = context.getImageData(0, 0, frame.width, frame.height);
        const fullSlots = isLootPanelVisible(full) ? detectBlueprintTiles(full, 'CONTAINER LOADOUT').map(tile => tile.slot) : [];
        const detectedMap = regions.mapVisible(source);
        const firstBuffers = [...regions.buffers.values(), ...Object.values(regions.mapBuffers)];
        for (let repeat = 0; repeat < 30; repeat++) {
          regions.lootPanelVisible(source); if (foundPanel) regions.blueprintTiles(source); regions.mapVisible(source);
        }
        const reused = firstBuffers.every((canvas, index) => canvas === [...regions.buffers.values(), ...Object.values(regions.mapBuffers)][index]);
        regions.release();
        results.push({ width, panel: foundPanel, slots: croppedSlots, fullSlots, map: detectedMap, reused,
          released: firstBuffers.every(canvas => canvas.width === 0 && canvas.height === 0) });
      }
      return results;
    }, encoded);
    console.log(file, JSON.stringify(actual));
    for (const result of actual) {
      assert.equal(result.panel, panel, `${file}/${result.width}: container gate`);
      assert.deepEqual(result.slots, result.fullSlots, `${file}/${result.width}: crop changed detection`);
      if (result.width <= 1600) assert.deepEqual(result.slots, slots, `${file}/${result.width}: blueprint slots`);
      assert.equal(result.map, map, `${file}/${result.width}: map gate`);
      assert.ok(result.reused && result.released, 'scan buffers must be reused and released');
    }
  }
} finally { await browser.close(); }
