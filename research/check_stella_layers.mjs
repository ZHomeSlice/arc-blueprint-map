import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const screenshotRoot = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  for (const filename of ['20260927194241_1.jpg', '20260927195819_1.jpg', '20260927202158_1.jpg',
    '20260927202335_1.jpg', '20260928142435_1.jpg', '20260928150339_1.jpg']) {
    const bytes = await readFile(`${screenshotRoot}/${filename}`);
    const result = await page.evaluate(async url => {
      const { matchFullMap, mapPatchAppearance, pointOnFullMap } = await import('/full-map-match.js');
      const { selectMapCandidate } = await import('/map-detect.js');
      const { mapPresets } = await import('/map-presets.js');
      const frame = new Image(); frame.src = url; await frame.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      canvas.getContext('2d').drawImage(frame, 0, 0, 1600, 900);
      const candidates = [];
      for (const preset of mapPresets.filter(entry => entry.family === 'stella')) {
        const base = new Image(); base.src = preset.image; await base.decode();
        const match = matchFullMap(base, canvas, { scales: preset.scales, minScore: -1 });
        candidates.push({ preset, match, position: pointOnFullMap(match, { x: 0.5, y: 0.5 }),
          appearance: mapPatchAppearance(base, canvas, match) });
      }
      const chosen = selectMapCandidate(candidates);
      return { chosen: chosen.preset?.id, error: chosen.error,
        candidates: candidates.map(item => ({ id: item.preset.id, score: item.match.score, mae: item.appearance.mae })) };
    }, `data:image/jpeg;base64,${bytes.toString('base64')}`);
    console.log(filename, result);
    assert.equal(result.chosen, 'stella-upper', `${filename}: ${result.error || 'wrong floor'}`);
  }
} finally { await browser.close(); }
