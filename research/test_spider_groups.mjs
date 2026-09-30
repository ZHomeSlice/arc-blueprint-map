import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.VIEWPORT_WIDTH) || 1400, height: 1000 } });
  await page.goto('http://127.0.0.1:4177/');
  await page.click('#use-stella-upper');
  await page.evaluate(() => {
    const key = 'arc-blueprint-map-v1';
    const data = JSON.parse(localStorage.getItem(key));
    const names = ['Deadline', 'Deadline', 'Silencer II', 'Gas Mine', 'Aphelion', 'Pulse Mine',
      'Torrente', 'Green Light', 'Complex Gun Parts', 'Seeker Grenade', 'Defibrillator'];
    const offsets = [[-12,-8],[-9,9],[8,-14],[17,8],[3,15],[-18,13],[-19,-4],[13,-4],[4,-1],[-3,3],[12,15]];
    data.finds = names.map((name, index) => ({ id: `dense-${index}`, name, map: data.currentMap,
      x: .46 + offsets[index][0] / 988, y: .46 + offsets[index][1] / 675,
      foundAt: new Date(Date.now() - index * 60_000).toISOString() }));
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload();
  await page.locator('#map').scrollIntoViewIfNeeded();
  const map = await page.locator('#map').boundingBox();
  await page.mouse.move(Math.floor(map.x + map.width * .46), Math.floor(map.y + map.height * .46));
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#pins .spider-pin').count(), 10, 'duplicate name uses one expanded marker');
  assert.equal(await page.locator('#pins .spider-hidden').count(), 1);
  assert.equal(await page.locator('#pins .pin-count').textContent(), '2');
  assert.equal(await page.locator('#pin-spider-lines line').count(), 11, 'both duplicate origins keep lines');
  assert.equal(await page.locator('#pins .spider-left').count(), 2, 'overflow names move left');
  await page.mouse.wheel(0, -240);
  assert.equal(await page.locator('#pins .spider-pin').count(), 10, 'counted markers remain expanded while zooming');
  const geometry = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('#pins .spider-pin .pin-label')].map(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    const lines = [...document.querySelectorAll('#pin-spider-lines line')].map(element => ({
      a: { x: +element.getAttribute('x1'), y: +element.getAttribute('y1') },
      b: { x: +element.getAttribute('x2'), y: +element.getAttribute('y2') },
    }));
    return { labels, lines };
  });
  for (let first = 0; first < geometry.labels.length; first++) {
    const a = geometry.labels[first];
    assert.ok(a.left >= map.x && a.right <= map.x + map.width && a.top >= map.y && a.bottom <= map.y + map.height,
      'arc labels stay inside the map');
    for (let second = first + 1; second < geometry.labels.length; second++) {
      const b = geometry.labels[second];
      assert.equal(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
        false, 'arc labels do not overlap');
    }
  }
  const turn = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  let crossings = 0;
  for (let first = 0; first < geometry.lines.length; first++) for (let second = first + 1; second < geometry.lines.length; second++) {
    const { a, b } = geometry.lines[first];
    const { a: c, b: d } = geometry.lines[second];
    if (turn(a,b,c) * turn(a,b,d) < -0.01 && turn(c,d,a) * turn(c,d,b) < -0.01) crossings++;
  }
  assert.equal(crossings, 0, 'origin lines do not cross');
  const deadline = page.locator('#pins .spider-pin').filter({ hasText: 'Deadline' }).first();
  await deadline.click();
  assert.equal(await page.locator('#pin-popup-choices button').count(), 2, 'counted marker opens a two-find chooser');
  await page.locator('#pin-popup-choices button').nth(1).click();
  assert.equal(await page.locator('#pin-popup-title').textContent(), 'Deadline');
  await page.click('#pin-popup-edit');
  assert.equal(await page.locator('#pin-popup-form').isVisible(), true);
  console.log('Arc layout avoids crossings, groups duplicate names, and lets each find be edited.');
} finally {
  await browser.close();
}
