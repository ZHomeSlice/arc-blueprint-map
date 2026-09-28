import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const expectedMissing = [
  'Extended Shotgun Mag III', 'Muzzle Brake III', 'Dolabra', 'Remote Raider Flare', 'Stable Stock III',
  'Compensator III', 'Vulcano', 'Barricade Kit', 'Stable Stock II', 'Shotgun Choke III',
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/collection.html');
  await page.waitForSelector('.card');
  const count = await page.locator('.card').count();
  if (count !== 83) throw new Error(`Expected 83 cards, got ${count}`);
  await page.getByRole('button', { name: 'Missing 10' }).click();
  const missing = await page.locator('.card strong').allTextContents();
  if (JSON.stringify(missing) !== JSON.stringify(expectedMissing)) throw new Error(`Wrong missing list: ${JSON.stringify(missing)}`);
  const unloaded = await page.locator('.card img').evaluateAll(images => images.filter(image => !image.complete || image.naturalWidth === 0).length);
  if (unloaded) throw new Error(`${unloaded} icons did not load`);
  console.log(`Verified ${count} cards, ${missing.length} missing blueprints, and loaded icons`);
} finally { await browser.close(); }
