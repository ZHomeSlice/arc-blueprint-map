import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';

const screenshot = process.argv[2] || 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/20260928091348_1.jpg';
const data = await readFile(screenshot);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  const result = await page.evaluate(async (url) => {
    const { matchFullMap, pointOnFullMap } = await import('/full-map-match.js');
    const { detectPlayerArrow } = await import('/map-match.js');
    const base = new Image(); base.src = '/maps/stella-upper.jpg'; await base.decode();
    const source = new Image(); source.src = url; await source.decode();
    const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
    frame.getContext('2d').drawImage(source, 0, 0, frame.width, frame.height);
    const match = matchFullMap(base, frame, { scales: [0.29, 0.30, 0.31], minScore: 0.62 });
    const arrow = detectPlayerArrow(frame);
    return { match, arrow, point: match && arrow ? pointOnFullMap(match, arrow) : null };
  }, `data:image/jpeg;base64,${data.toString('base64')}`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
