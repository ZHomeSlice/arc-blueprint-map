import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  await page.evaluate(() => localStorage.setItem('arc-blueprint-map-v1', JSON.stringify({
    version: 1, currentMap: 'Map A', maps: { 'Map A': { image: null }, 'Map B': { image: null } },
    finds: [{ id: 'find-1', name: 'Original find', map: 'Map A', x: 0.2, y: 0.3,
      foundAt: '2026-09-28T12:00:00.000Z', sightingId: 'linked-1' }],
    sightings: [
      { id: 'linked-1', name: 'Original find', map: 'Map A', position: { x: 0.2, y: 0.3 },
        savedFindId: 'find-1', seenAt: '2026-09-28T12:00:00.000Z' },
      { id: 'pending-1', name: 'Pending find', map: 'Map A', position: { x: 0.7, y: 0.6 },
        seenAt: '2026-09-28T12:05:00.000Z' },
    ],
  })));
  await page.reload();

  await page.locator('[data-pin-id="find-1"]').click();
  await page.getByRole('button', { name: 'Edit pin' }).click();
  await page.locator('#pin-edit-blueprint-search').fill('Defibrillator');
  await page.locator('#pin-edit-blueprint-list .blueprint-picker-option').click();
  await page.locator('#pin-edit-x').fill('35.5');
  await page.locator('#pin-edit-y').fill('42');
  await page.locator('#pin-edit-map').selectOption('Map B');
  await page.getByRole('button', { name: 'Save changes' }).click();
  if (await page.locator('[data-pin-id="find-1"]').count()) throw new Error('Moved find stayed on Map A');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
  const find = saved.finds[0];
  const linked = saved.sightings.find(entry => entry.id === 'linked-1');
  if (find.name !== 'Defibrillator' || find.map !== 'Map B' || find.x !== 0.355 || find.y !== 0.42 ||
      linked.name !== find.name || linked.map !== find.map || linked.position.x !== find.x || linked.position.y !== find.y) {
    throw new Error('Edited find and linked sighting are out of sync');
  }

  await page.locator('[data-pin-id="pending-1"]').click();
  await page.getByRole('button', { name: 'Edit pin' }).click();
  await page.locator('#pin-edit-blueprint-search').fill('Aphelion');
  await page.locator('#pin-edit-blueprint-list .blueprint-picker-option').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  if (await page.locator('#pin-popup-title').textContent() !== 'Pending find') throw new Error('Cancel changed provisional pin');
  await page.getByRole('button', { name: 'Edit pin' }).click();
  await page.locator('#pin-edit-blueprint-search').fill('Aphelion');
  await page.locator('#pin-edit-blueprint-list .blueprint-picker-option').click();
  await page.locator('#pin-edit-x').fill('73');
  await page.getByRole('button', { name: 'Save changes' }).click();
  const finalized = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).finds.find(find => find.name === 'Aphelion'));
  if (!finalized || finalized.x !== 0.73 || await page.locator('[data-pin-id="pending-1"]').count()) {
    throw new Error('Catalog confirmation did not finalize the provisional pin');
  }
  await page.reload();
  await page.locator(`[data-pin-id="${finalized.id}"]`).click();
  if (await page.locator('#pin-popup-title').textContent() !== 'Aphelion' ||
      !await page.locator('#pin-popup-details').textContent().then(text => text.includes('73% across'))) {
    throw new Error('Provisional pin edit did not survive reload');
  }
  await page.locator('#map-name').fill('Map B');
  await page.locator('#use-map').click();
  await page.locator('[data-pin-id="find-1"]').click();
  if (await page.locator('#pin-popup-title').textContent() !== 'Defibrillator') throw new Error('Moved find did not appear on Map B');
  console.log('Pin edits, cancel, linked sighting, map move, and reload passed');
} finally {
  await browser.close();
}
