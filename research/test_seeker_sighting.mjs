import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const fixture = await readFile('research/fixtures/seeker-grenade-sighting.png');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  const result = await page.evaluate(async encoded => {
    const { identifyBlueprintPreview, rankBlueprintPreview } = await import('/icon-match.js');
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    return { match: await identifyBlueprintPreview(image), ranked: await rankBlueprintPreview(image) };
  }, fixture.toString('base64'));
  console.log(JSON.stringify(result));
  assert.equal(result.match?.name, 'Seeker Grenade');

  const savedPage = await browser.newPage();
  await savedPage.addInitScript(encoded => {
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify({
      version: 1, currentMap: 'Test Map', maps: { 'Test Map': { image: null } }, finds: [], dismissedTiles: [],
      sightings: [
        { id: 'newer', name: 'Unidentified blueprint', map: 'Test Map', position: { x: .4, y: .4 }, seenAt: '2026-09-29T23:00:00Z' },
        { id: 'seeker', name: 'Unidentified blueprint', map: 'Test Map', position: { x: .23, y: .13 },
          seenAt: '2026-09-29T23:49:31Z', tilePreview: `data:image/png;base64,${encoded}`,
          iconCandidates: [{ name: 'Fireworks Box', icon: '/catalog-icons/fireworks-box-blueprint.webp', score: .7 }] },
      ],
    }));
  }, fixture.toString('base64'));
  await savedPage.goto('http://127.0.0.1:4177/');
  await savedPage.locator('#sighting-list .sighting-select').nth(1).click();
  await savedPage.waitForFunction(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[1].name === 'Seeker Grenade');
  const saved = await savedPage.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
  assert.equal(saved.finds.find(find => find.sightingId === 'seeker')?.name, 'Seeker Grenade');
  assert.equal(await savedPage.locator('.pin[data-pin-kind="find"]').count(), 1);
} finally {
  await browser.close();
}
