import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  ['20260928150336_1.jpg', 2, 'Deadline'],
  ['20260928142439_1.jpg', 1, 'Seeker Grenade'],
  ['20260927195813_1.jpg', 3, null],
  ['20260927202155_1.jpg', 2, 'Aphelion'],
  ['20260928091343_1.jpg', 3, 'Extended Barrel II'],
  ['20260928093759_1.jpg', 3, 'Looting Mk. 3 (Survivor)'],
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const [file, slot, expected] of cases) {
    const data = await readFile(folder + file);
    const result = await page.evaluate(async ({ url, slot }) => {
      const { identifyBlueprintIcon, identifyBlueprintPreview, rankBlueprintIcons, rankBlueprintPreview } = await import('/icon-match.js');
      const image = new Image(); image.src = url; await image.decode();
      const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
      frame.getContext('2d').drawImage(image, 0, 0, 1600, 900);
      const reduced = document.createElement('canvas'); reduced.width = 960; reduced.height = 540;
      reduced.getContext('2d').drawImage(frame, 0, 0, 960, 540);
      const stored = new Image(); stored.src = reduced.toDataURL('image/jpeg', 0.55); await stored.decode();
      const restored = document.createElement('canvas'); restored.width = 1600; restored.height = 900;
      restored.getContext('2d').drawImage(stored, 0, 0, 1600, 900);
      const { detectBlueprintTiles } = await import('/blueprint-visual.js');
      const tiles = detectBlueprintTiles(restored.getContext('2d').getImageData(0, 0, 1600, 900), 'CONTAINER LOADOUT');
      const column = (slot - 1) % 4, row = Math.floor((slot - 1) / 4);
      const left = [169, 280, 390, 502][column] * 1600 / 2048;
      const top = [315, 427][row] * 900 / 1152;
      const previewCanvas = document.createElement('canvas'); previewCanvas.width = 180; previewCanvas.height = 185;
      previewCanvas.getContext('2d').drawImage(frame, left, top, 105 * 1600 / 2048, 108 * 900 / 1152, 0, 0, 180, 185);
      const preview = new Image(); preview.src = previewCanvas.toDataURL('image/jpeg', 0.82); await preview.decode();
      return { matched: await identifyBlueprintIcon(frame, slot), restored: await identifyBlueprintIcon(restored, slot),
        preview: await identifyBlueprintPreview(preview), previewRanked: await rankBlueprintPreview(preview), restoredTile: tiles.some(tile => tile.slot === slot),
        ranked: await rankBlueprintIcons(frame, slot), restoredRanked: await rankBlueprintIcons(restored, slot) };
    }, { url: `data:image/jpeg;base64,${data.toString('base64')}`, slot });
    console.log(file, JSON.stringify({ matched: result.matched, preview: result.preview, previewRanked: result.previewRanked, restored: result.restored, restoredRanked: result.restoredRanked, restoredTile: result.restoredTile }));
    assert.equal(result.matched?.name ?? null, expected, `Full frame: ${file}`);
    assert.equal(result.preview?.name ?? null, expected, `Stored tile preview: ${file}`);
    assert.equal(result.restoredTile, true, `Stored tile detection: ${file}`);
  }
  const compactPreview = (await readFile('research/fixtures/ambiguous-blueprint-preview.png')).toString('base64');
  const ambiguous = await page.evaluate(async encoded => {
    const { identifyBlueprintPreview, rankBlueprintPreview } = await import('/icon-match.js');
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    return { match: await identifyBlueprintPreview(image), ranked: await rankBlueprintPreview(image) };
  }, compactPreview);
  assert.equal(ambiguous.match, null, 'Small, ambiguous preview must not be named automatically');
  assert.deepEqual(ambiguous.ranked.slice(0, 2).map(entry => entry.name).sort(), ['Aphelion', 'Extended Barrel II']);
} finally { await browser.close(); }
