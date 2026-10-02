import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const names = ['Silencer II', 'Hullcracker', 'Aphelion', 'Snap Hook', 'Vita Shot', 'Unknown test blueprint'];
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify({
      version: 1, currentMap: 'Stella Montis Upper', maps: { 'Stella Montis Upper': { mode: 'stella-upper', image: '/maps/stella-upper.jpg', ratio: 5120 / 3500 } },
      finds: names.map((name, i) => ({ id: `rarity-${i}`, name, map: 'Stella Montis Upper', x: .1 + i * .12, y: .4, foundAt: '2026-09-29T12:00:00Z' })),
      sightings: [{ id: 'pending', name: 'Unidentified blueprint', map: 'Stella Montis Upper', position: { x: .85, y: .65 },
        seenAt: '2026-09-29T12:00:00Z', dismissed: false, savedFindId: null }], dismissedTiles: [],
    }));
  });
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto('http://127.0.0.1:4177/');
  const expected = [
    ['rarity-veryCommon', 'rgb(146, 154, 150)'],
    ['rarity-common', 'rgb(37, 164, 78)'],
    ['rarity-uncommon', 'rgb(8, 146, 210)'],
    ['rarity-rare', 'rgb(175, 45, 134)'],
    ['rarity-extreme', 'rgb(220, 171, 15)'],
  ];
  for (let i = 0; i < expected.length; i++) {
    const pin = page.locator(`.pin[data-pin-id="rarity-${i}"]`);
    assert.equal(await pin.evaluate(el => getComputedStyle(el).backgroundColor), expected[i][1]);
    assert.ok((await pin.getAttribute('class')).includes(expected[i][0]));
    assert.equal(await page.locator(`.rarity-dot.${expected[i][0]}`).evaluate(el => getComputedStyle(el).backgroundColor), expected[i][1]);
  }
  const unknown = page.locator('.pin[data-pin-id="rarity-5"]');
  assert.match(await unknown.getAttribute('title'), /Rarity not rated/);
  const pending = page.locator('.pin[data-pin-id="pending"]');
  assert.equal(await pending.evaluate(el => getComputedStyle(el).borderTopStyle), 'dashed');
  assert.equal(await pending.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(28, 39, 33)');
  await page.locator('.pin[data-pin-id="rarity-4"]').click();
  assert.match(await page.locator('#pin-popup-details').textContent(), /Find rarityExtremely rare/);
  console.log('Rarity pin colors, legend, unknown fallback, and popup passed.');
} finally {
  await browser.close();
}
