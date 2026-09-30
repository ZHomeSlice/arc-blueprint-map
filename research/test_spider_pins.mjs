import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://127.0.0.1:4177/');
  await page.click('#use-stella-upper');
  await page.evaluate(() => {
    const key = 'arc-blueprint-map-v1';
    const data = JSON.parse(localStorage.getItem(key));
    data.finds = [
      { id: 'overlap-a', name: 'Defibrillator', map: data.currentMap, x: .46, y: .46, foundAt: new Date().toISOString() },
      { id: 'overlap-b', name: 'Seeker Grenade', map: data.currentMap, x: .462, y: .462, foundAt: new Date().toISOString() },
      { id: 'overlap-c', name: 'Explosive Mine', map: data.currentMap, x: .464, y: .464, foundAt: new Date().toISOString() },
    ];
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  const map = page.locator('#map');
  const bounds = await map.boundingBox();
  const origin = { x: Math.floor(bounds.x + bounds.width * .462), y: Math.floor(bounds.y + bounds.height * .462) };
  const label = await page.locator('#pins [data-pin-id="overlap-a"] .pin-label').boundingBox();
  await page.mouse.move(Math.floor(label.x + label.width - 5), Math.floor(label.y + label.height / 2));
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#pins .spider-pin').count(), 3, 'hovering a stacked name spreads its dots');
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#pins .spider-pin').count(), 0, 'spread closes after leaving the area');
  await page.mouse.move(origin.x - 80, origin.y - 80);
  await page.mouse.move(origin.x, origin.y);
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#pins .spider-pin').count(), 3, 'stacked pins spread on hover');
  assert.equal(await page.locator('#pin-spider-lines line').count(), 3, 'every pin has a line to its origin');
  await page.mouse.wheel(0, -240);
  assert.equal(await page.locator('#pins .spider-pin').count(), 3, 'spread stays aligned while zooming');
  const positions = await page.locator('#pins .spider-pin').evaluateAll(pins => pins.map(pin => {
    const box = pin.getBoundingClientRect();
    return { name: pin.querySelector('.pin-label').textContent, x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }));
  assert.equal(new Set(positions.map(item => Math.round(item.y))).size, 3, 'every dot has a separate row');
  const labels = await page.locator('#pins .spider-pin .pin-label').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (const label of labels) {
    assert.ok(label.left >= bounds.x && label.right <= bounds.x + bounds.width, 'label stays within the map');
    assert.ok(label.top >= bounds.y && label.bottom <= bounds.y + bounds.height, 'label stays within the map');
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const overlaps = labels[i].left < labels[j].right && labels[i].right > labels[j].left &&
      labels[i].top < labels[j].bottom && labels[i].bottom > labels[j].top;
    assert.equal(overlaps, false, 'expanded names do not cover each other');
  }
  const seeker = positions.find(item => item.name === 'Seeker Grenade');
  await page.mouse.move(seeker.x, seeker.y, { steps: 12 });
  await page.waitForTimeout(220);
  assert.equal(await page.locator('#pins .spider-pin').count(), 3, 'spread holds while pointer travels to a dot');
  await page.mouse.click(seeker.x, seeker.y);
  assert.equal(await page.locator('#pin-popup-title').textContent(), 'Seeker Grenade');
  await page.click('#pin-popup-edit');
  assert.equal(await page.locator('#pin-popup-form').isVisible(), true, 'expanded dot can be edited');
  console.log('Stacked pins spread with origin lines, hold during travel, and open the correct edit form.');
} finally {
  await browser.close();
}
