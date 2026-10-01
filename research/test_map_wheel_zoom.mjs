import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://127.0.0.1:4177/');
  await page.click('#use-stella-upper');
  const map = page.locator('#map');
  const bounds = await map.boundingBox();
  assert.ok(bounds?.width > 400 && bounds?.height > 300, 'preset map is visible');
  const cursor = { x: Math.floor(bounds.x + bounds.width * 0.68), y: Math.floor(bounds.y + bounds.height * 0.37) };
  const state = () => page.evaluate(() => {
    const transform = new DOMMatrix(getComputedStyle(document.querySelector('#map-content')).transform);
    const map = document.querySelector('#map').getBoundingClientRect();
    const element = document.querySelector('#map');
    return { scale: transform.a, x: transform.e, y: transform.f,
      width: element.clientWidth, height: element.clientHeight,
      borderX: element.clientLeft, borderY: element.clientTop };
  });
  const before = await state();
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.wheel(0, -240);
  const after = await state();
  assert.ok(after.scale > 1, 'wheel up zooms in');
  const beforeX = (cursor.x - bounds.x - before.borderX - before.x) / before.scale;
  const beforeY = (cursor.y - bounds.y - before.borderY - before.y) / before.scale;
  const afterX = (cursor.x - bounds.x - after.borderX - after.x) / after.scale;
  const afterY = (cursor.y - bounds.y - after.borderY - after.y) / after.scale;
  assert.ok(Math.abs(beforeX - afterX) < 1 && Math.abs(beforeY - afterY) < 1,
    'map point under cursor stays fixed');
  await page.mouse.click(cursor.x, cursor.y);
  const draft = await page.locator('#draft-pin').evaluate(pin => ({ x: parseFloat(pin.style.left), y: parseFloat(pin.style.top) }));
  assert.ok(Math.abs(draft.x - beforeX / before.width * 100) < 0.1);
  assert.ok(Math.abs(draft.y - beforeY / before.height * 100) < 0.1);
  await page.fill('#blueprint-search', 'Defibrillator');
  await page.locator('#blueprint-list .blueprint-picker-option').click();
  await page.click('#save-find');
  const pin = page.locator('#pins .pin').first();
  await pin.scrollIntoViewIfNeeded();
  const pinBounds = await pin.boundingBox();
  assert.ok(pinBounds && Math.abs(pinBounds.x + pinBounds.width / 2 - cursor.x) < 2,
    'saved pin stays under cursor');
  const hoverPoint = { x: Math.floor(pinBounds.x + pinBounds.width / 2), y: Math.floor(pinBounds.y + pinBounds.height / 2) };
  await page.mouse.move(hoverPoint.x - 60, hoverPoint.y - 60);
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  assert.equal(await pin.evaluate(element => element.classList.contains('hover-stable')), false,
    'pin hover waits for pointer to settle');
  await page.waitForTimeout(170);
  assert.equal(await pin.evaluate(element => element.classList.contains('hover-stable')), true,
    'pin hover activates after the delay');
  await page.mouse.move(hoverPoint.x + 25, hoverPoint.y + 25);
  await page.waitForTimeout(100);
  assert.equal(await pin.evaluate(element => element.classList.contains('hover-stable')), true,
    'brief movement away does not flicker');
  await page.mouse.move(hoverPoint.x, hoverPoint.y);
  await page.waitForTimeout(50);
  assert.equal(await pin.evaluate(element => element.classList.contains('hover-stable')), true);
  await page.mouse.move(hoverPoint.x - 60, hoverPoint.y - 60);
  await page.waitForTimeout(260);
  assert.equal(await pin.evaluate(element => element.classList.contains('hover-stable')), false,
    'hover clears after the exit grace period');
  await pin.click();
  assert.equal(await page.locator('#pin-popup-title').textContent(), 'Defibrillator');
  await page.mouse.move(bounds.x + 50, bounds.y + 50);
  await page.mouse.wheel(0, 600);
  assert.ok(Math.abs((await state()).scale - 1) < 0.001, 'wheel down returns to full map');
  console.log('Map wheel zoom, pointer anchor, placement, pin click, stable hover, and zoom out passed.');
} finally {
  await browser.close();
}
