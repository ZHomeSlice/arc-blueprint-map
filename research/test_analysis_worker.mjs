import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, file] of [['loot', '20260927195813_1.jpg'], ['map', '20260928142435_1.jpg']]) {
    const body = await readFile(folder + file);
    await page.route(`**/test-${name}.jpg`, route => route.fulfill({ status: 200, contentType: 'image/jpeg', body }));
  }
  await page.goto('http://127.0.0.1:4177/');
  const result = await page.evaluate(async () => {
    const original = await import('/icon-match.js');
    const client = await import('/analysis-client.js');
    const { matchFullMap, mapPatchAppearance, pointOnFullMap } = await import('/full-map-match.js');
    const { detectPlayerArrow } = await import('/map-match.js');
    const { mapPresets } = await import('/map-presets.js');
    const { selectMapCandidate } = await import('/map-detect.js');
    async function image(url) { const img = new Image(); img.src = url; await img.decode(); return img; }
    function frame(img) { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; c.getContext('2d').drawImage(img, 0, 0, 1600, 900); return c; }
    const loot = frame(await image('/test-loot.jpg'));
    const expectedIcons = await original.rankBlueprintIcons(loot, 3);
    let coldTicks = 0, coldGap = 0, coldPrevious = performance.now();
    const coldTimer = setInterval(() => { const now = performance.now(); coldGap = Math.max(coldGap, now - coldPrevious); coldPrevious = now; coldTicks++; }, 10);
    const icons = await client.rankBlueprintIcons(loot, 3);
    clearInterval(coldTimer);
    const preview = await image('/catalog-icons/defibrillator-recipe.webp');
    const expectedPreview = await original.rankBlueprintPreview(preview);
    const rankedPreview = await client.rankBlueprintPreview(preview);
    const map = frame(await image('/test-map.jpg'));
    const arrow = detectPlayerArrow(map);
    const candidates = [];
    for (const preset of mapPresets.filter(p => p.family === 'stella')) {
      const base = await image(preset.image);
      const match = matchFullMap(base, map, { scales: preset.scales, minScore: -1 });
      if (match) candidates.push({ preset, match, position: pointOnFullMap(match, arrow), appearance: mapPatchAppearance(base, map, match) });
    }
    const expectedMap = selectMapCandidate(candidates);
    let ticks = 0, largestGap = 0, previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); largestGap = Math.max(largestGap, now - previous); previous = now; ticks++; }, 10);
    const mapped = await client.matchCapturedMap(map, { family: 'stella' });
    clearInterval(timer);
    const pending = client.matchCapturedMap(map, { family: 'stella' }).then(() => 'resolved', error => error.name);
    client.stopImageAnalysis();
    const cancellation = await pending;
    const restarted = await client.rankBlueprintIcons(loot, 3);
    client.stopImageAnalysis();
    return { expectedIcons, icons, expectedPreview, rankedPreview, expectedMap, mapped, ticks, largestGap, coldTicks, coldGap, cancellation, restarted,
      candidates: candidates.map(c => ({ id: c.preset.id, score: c.match.score, mae: c.appearance.mae })) };
  });
  console.log(JSON.stringify({ icons: result.icons.map(i => i.name), map: result.mapped, ticks: result.ticks, largestGap: result.largestGap, coldTicks: result.coldTicks, coldGap: result.coldGap }));
  assert.deepEqual(result.icons.map(i => i.name), result.expectedIcons.map(i => i.name), 'worker changed icon rankings');
  result.icons.forEach((icon, i) => assert.ok(Math.abs(icon.score - result.expectedIcons[i].score) < 0.001, 'worker changed calibrated icon scores'));
  assert.deepEqual(result.rankedPreview, result.expectedPreview);
  assert.ok(result.coldTicks >= 5);
  assert.ok(result.coldGap < 150, `catalog preparation stalled for ${result.coldGap} ms`);
  assert.ok(result.expectedMap.position);
  assert.equal(result.mapped.presetId, result.expectedMap.preset.id);
  assert.deepEqual(result.mapped.position, result.expectedMap.position, 'worker changed map coordinates');
  assert.ok(Math.abs(result.mapped.confidence - result.expectedMap.match.score) < 0.001);
  assert.ok(result.ticks >= 5, 'map search prevented page timers from running');
  assert.ok(result.largestGap < 150, `page stalled for ${result.largestGap} ms during worker matching`);
  assert.equal(result.cancellation, 'AbortError');
  assert.deepEqual(result.restarted, result.icons);
  console.log('Worker matching parity, page responsiveness, cancellation, and restart passed');
} finally { await browser.close(); }
