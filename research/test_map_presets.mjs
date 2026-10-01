import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  const presets = await page.evaluate(async () => (await import('/map-presets.js')).mapPresets);
  assert.equal(presets.length, 9);
  for (const preset of presets) {
    await page.locator('#preset-map').selectOption(preset.id);
    await page.locator('#use-preset-map').click();
    assert.equal(await page.locator('#current-map-title').textContent(), preset.name);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).maps[document.querySelector('#current-map-title').textContent].mode), preset.id);
    const image = await page.evaluate(async path => {
      const element = new Image(); element.src = path; await element.decode();
      return { width: element.width, height: element.height };
    }, preset.image);
    assert.deepEqual(image, { width: preset.width, height: preset.height });
    assert.ok((await page.locator('#map-credit-link').getAttribute('href')).endsWith(preset.source));
    console.log(`${preset.name}: ${image.width} × ${image.height}`);
  }
  await page.locator('#preset-map').selectOption('stella-lower');
  await page.locator('#use-preset-map').click();
  await page.locator('#map').click({ position: { x: 300, y: 200 } });
  await page.locator('#blueprint-search').fill('Defibrillator');
  await page.locator('#blueprint-list .blueprint-picker-option').click();
  await page.locator('#save-find').click();
  assert.equal(await page.locator('#find-count').textContent(), '1');
  await page.locator('#preset-map').selectOption('stella-upper');
  await page.locator('#use-preset-map').click();
  assert.equal(await page.locator('#find-count').textContent(), '0');
  await page.locator('#preset-map').selectOption('stella-lower');
  await page.locator('#use-preset-map').click();
  assert.equal(await page.locator('#find-count').textContent(), '1');
  console.log('separate Stella layer pins: OK');
} finally { await browser.close(); }
