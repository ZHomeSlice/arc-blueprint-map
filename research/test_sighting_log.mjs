import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"APHELION BLUEPRINT"}})})};',
  }));
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d');
      setInterval(() => { context.fillStyle = '#477b9f'; context.fillRect(0, 0, 640, 360); }, 100);
      return canvas.captureStream(15);
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => document.querySelector('#sighting-count')?.textContent === '1');
  const first = await page.evaluate(() => ({
    count: document.querySelector('#sighting-count').textContent,
    name: document.querySelector('#blueprint-name').value,
    shot: JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].frame.startsWith('data:image/jpeg;base64,'),
  }));
  if (first.count !== '1' || first.name !== 'APHELION' || !first.shot) throw new Error(`Sighting not saved: ${JSON.stringify(first)}`);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.reload();
  const restored = await page.locator('#sighting-count').textContent();
  if (restored !== '1') throw new Error(`Sighting did not survive reload: ${restored}`);
  await page.locator('.sighting-select').click();
  const review = await page.evaluate(() => ({ name: document.querySelector('#blueprint-name').value, preview: !document.querySelector('#sighting-preview').hidden }));
  if (review.name !== 'APHELION' || !review.preview) throw new Error(`Sighting review failed: ${JSON.stringify(review)}`);
  console.log(JSON.stringify({ first, restored, review }));
} finally { await browser.close(); }
