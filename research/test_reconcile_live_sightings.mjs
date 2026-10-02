import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4177/');
  await page.evaluate(async () => {
    const { emptyData } = await import('/backup.js');
    const data = emptyData();
    data.sightings = [
      { id: 'safekeeper', name: 'Unidentified blueprint', map: data.currentMap, seenAt: '2026-09-28T15:38:11.795Z' },
      { id: 'first', name: 'Unidentified blueprint', map: data.currentMap, seenAt: '2026-09-28T16:00:00Z' },
      { id: 'second', name: 'Unidentified blueprint', map: data.currentMap, seenAt: '2026-09-28T16:05:00Z' },
    ];
    localStorage.setItem('arc-blueprint-map-v1', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Add the 4 finds from your screenshots' }).click();
  const linked = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    const find = saved.finds.find(entry => entry.name === 'Looting Mk. 3 (Safekeeper)');
    const sighting = saved.sightings.find(entry => entry.savedFindId === find?.id);
    return { finds: saved.finds.length, findId: find?.id, sightingName: sighting?.name, count: document.querySelector('#sighting-count').textContent };
  });
  if (linked.finds !== 4 || linked.sightingName !== 'Looting Mk. 3 (Safekeeper)' || linked.count !== '3') {
    throw new Error(`Screenshot find was not linked: ${JSON.stringify(linked)}`);
  }
  await page.getByRole('button', { name: 'Not a blueprint' }).first().click();
  await page.getByRole('button', { name: 'Not a blueprint' }).last().click();
  const reviewed = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('arc-blueprint-map-v1'));
    return { active: document.querySelector('#sighting-count').textContent, finds: document.querySelector('#find-count').textContent,
      dismissed: saved.sightings.filter(entry => entry.dismissed).length };
  });
  if (reviewed.active !== '1' || reviewed.finds !== '4' || reviewed.dismissed !== 2) {
    throw new Error(`Sighting review failed: ${JSON.stringify(reviewed)}`);
  }
  await page.reload();
  const persisted = await page.evaluate(() => ({ active: document.querySelector('#sighting-count').textContent,
    finds: document.querySelector('#find-count').textContent }));
  if (persisted.active !== '1' || persisted.finds !== '4') throw new Error(`State did not persist: ${JSON.stringify(persisted)}`);
  console.log(JSON.stringify({ linked, reviewed, persisted }));
} finally { await browser.close(); }
