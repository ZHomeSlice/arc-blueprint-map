import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/collection-data.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep all sharing in this test local; do not open or submit the real Form.
  await page.addInitScript(() => {
    window.open = url => { window.testFormUrl = url; };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} } });
  });
  await page.goto(process.env.BLUEPRINT_TEST_URL || 'http://127.0.0.1:4177/');
  await page.locator('#blueprint-list .blueprint-picker-option').first().waitFor();
  assert.equal(await page.locator('#blueprint-list .blueprint-picker-option').count(), catalog.length);
  assert.ok(await page.locator('#blueprint-name').getAttribute('readonly') !== null);
  await page.locator('#preset-map').selectOption('stella-upper');
  await page.locator('#use-preset-map').click();
  await page.locator('#map').click({ position: { x: 160, y: 130 } });
  await page.locator('#blueprint-search').fill('unlisted random name');
  assert.equal(await page.locator('#blueprint-list .blueprint-picker-option').count(), 0);
  assert.equal(await page.locator('#save-find').isDisabled(), true);
  await page.locator('#blueprint-search').fill('  safekeeper   looting  ');
  assert.equal(await page.locator('#blueprint-list .blueprint-picker-option').count(), 1);
  await page.locator('#blueprint-list .blueprint-picker-option').click();
  assert.equal(await page.locator('#blueprint-name').inputValue(), 'Looting Mk. 3 (Safekeeper)');
  await page.locator('#save-find').click();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
  assert.equal(saved.finds[0].name, 'Looting Mk. 3 (Safekeeper)');
  assert.ok(saved.finds[0].catalogIcon);
  await page.locator('[data-pin-kind="find"]').click();
  await page.locator('#pin-popup-edit').click();
  const list = page.locator('#pin-edit-blueprint-list');
  await list.locator('.blueprint-picker-option').first().waitFor();
  assert.equal(await list.locator('.blueprint-picker-option').count(), catalog.length);
  assert.ok(await page.locator('#pin-edit-name').getAttribute('readonly') !== null);
  const transform = await page.locator('#map-content').evaluate(element => element.style.transform);
  await list.hover();
  await page.mouse.wheel(0, 400);
  await page.waitForFunction(() => document.querySelector('#pin-edit-blueprint-list').scrollTop > 0);
  assert.equal(await page.locator('#map-content').evaluate(element => element.style.transform), transform);
  await page.locator('#pin-edit-blueprint-search').fill('WOLFPACK');
  assert.equal(await list.locator('.blueprint-picker-option').count(), 1);
  assert.equal(await list.evaluate(element => element.scrollTop), 0);
  await list.locator('.blueprint-picker-option').click();
  if (process.env.BLUEPRINT_TEST_SCREENSHOT) await page.screenshot({ path: process.env.BLUEPRINT_TEST_SCREENSHOT });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('#pin-popup-close').click();
  await page.reload();
  await page.locator('#blueprint-list .blueprint-picker-option').first().waitFor();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
  assert.equal(saved.finds[0].name, 'Wolfpack');
  await page.locator('#game-name').fill('Search test');
  await page.locator('#find-list .share-find input').check();
  await page.locator('#share-blueprints').click();
  await page.locator('#share-json').waitFor({ state: 'visible' });
  const payload = JSON.parse(await page.locator('#share-json').inputValue());
  assert.equal(payload.gameName, 'Search test');
  assert.equal(payload.finds[0].name, 'Wolfpack');
  assert.equal(payload.finds.length, 1);
  assert.equal('maps' in payload, false);
  assert.equal('catalogIcon' in payload.finds[0], false);
  await page.waitForFunction(() => Boolean(window.testFormUrl));
  assert.ok((await page.evaluate(() => window.testFormUrl)).includes('entry.1619425695=Search+test'));
  // An old manually entered name must also be blocked before sharing.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    stored.finds[0].name = 'Misc spreadsheet entry';
    stored.finds[0].shareApproved = true;
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(stored));
  });
  await page.reload();
  await page.locator('#share-blueprints').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('outside the blueprint catalog'));
  assert.equal(await page.locator('#share-json').isVisible(), false);
  assert.equal(await page.evaluate(() => window.testFormUrl), undefined);
  assert.deepEqual(errors, []);
  console.log('Full-catalog search, selection, wheel scrolling, reload, compact sharing, and legacy-name rejection passed.');
} finally {
  await browser.close();
}
