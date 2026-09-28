// Geometry smoke test using visible crops of each bundled map. Real raid
// screenshots are still needed to calibrate each map's in-game zoom.
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  const results = await page.evaluate(async () => {
    const { mapPresets } = await import('/map-presets.js');
    const { matchFullMap, mapPatchAppearance, pointOnFullMap } = await import('/full-map-match.js');
    const { selectMapCandidate } = await import('/map-detect.js');
    const results = [];
    for (const preset of mapPresets) {
      const base = new Image(); base.src = preset.image; await base.decode();
      const scale = 0.30;
      const sourceWidth = base.width * 2048 * scale / 768;
      const sourceHeight = base.width * 1152 * scale / 768;
      const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
      frame.getContext('2d').drawImage(base, (base.width - sourceWidth) / 2, (base.height - sourceHeight) / 2,
        sourceWidth, sourceHeight, 0, 0, frame.width, frame.height);
      const start = performance.now();
      const match = matchFullMap(base, frame, { scales: preset.scales, minScore: preset.minScore });
      const point = match && pointOnFullMap(match, { x: 0.5, y: 0.5 });
      const candidates = [];
      for (const option of mapPresets.filter(entry => entry.family === preset.family)) {
        const optionBase = new Image(); optionBase.src = option.image; await optionBase.decode();
        const optionMatch = matchFullMap(optionBase, frame, { scales: option.scales, minScore: -1 });
        if (optionMatch) candidates.push({ preset: option, match: optionMatch,
          position: pointOnFullMap(optionMatch, { x: 0.5, y: 0.5 }),
          appearance: mapPatchAppearance(optionBase, frame, optionMatch) });
      }
      const selected = selectMapCandidate(candidates);
      results.push({ name: preset.name, id: preset.id, score: match?.score, x: point?.x, y: point?.y,
        selected: selected.preset?.id, selectionError: selected.error,
        milliseconds: Math.round(performance.now() - start) });
    }
    return results;
  });
  for (const result of results) {
    console.log(result);
    assert.ok(result.score > 0.69, `${result.name}: image did not match its own map crop`);
    assert.ok(Math.abs(result.x - 0.5) < 0.02 && Math.abs(result.y - 0.5) < 0.02,
      `${result.name}: pin is outside the expected area`);
    assert.equal(result.selected, result.id,
      `${result.name}: ${result.selectionError || 'selected the wrong layer'}`);
  }
} finally { await browser.close(); }
