import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = new URL('./fixtures/feedback-2026-10-01/', import.meta.url);
const manifest = JSON.parse((await readFile(new URL('manifest.json', root), 'utf8')).replace(/^\uFEFF/, ''));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/feedback-fixture/*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({ body: await readFile(new URL(name, root)),
      contentType: name.endsWith('.js') ? 'text/javascript' : 'image/jpeg' });
  });
  await page.goto('http://127.0.0.1:4177/');
  const results = await page.evaluate(async manifest => {
    const current = await import('/blueprint-visual.js');
    const legacy = await import('/feedback-fixture/legacy-blueprint-visual.js');
    const { CaptureRegions } = await import('/capture-regions.js');
    const slots = [[169,315], [280,315], [390,315], [502,315], [169,427], [280,427], [390,427], [502,427]];
    const rows = [];
    for (const example of manifest) {
      const tile = new Image(); tile.src = `/feedback-fixture/${example.capturedTileFile}`; await tile.decode();
      const tileCanvas = document.createElement('canvas'); tileCanvas.width = tile.width; tileCanvas.height = tile.height;
      const tileContext = tileCanvas.getContext('2d', { willReadFrequently: true }); tileContext.drawImage(tile, 0, 0);
      const evidence = current.inspectBlueprintTile(tileContext.getImageData(0, 0, tile.width, tile.height));
      const trials = [];
      // Archived previews have no original slot. Replay every slot/scale to avoid
      // choosing a favorable rounding phase for the small white glyph.
      for (const width of [1280,1600,2048]) for (const [index, [x,y]] of slots.entries()) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width * 9 / 16;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tile, x * width / 2048, y * canvas.height / 1152, 105 * width / 2048, 108 * canvas.height / 1152);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const previous = legacy.detectBlueprintTiles(image, 'CONTAINER LOADOUT').some(match => match.slot === index + 1);
        const updated = current.detectBlueprintTiles(image, 'CONTAINER LOADOUT').some(match => match.slot === index + 1);
        const regions = new CaptureRegions();
        const cropped = regions.blueprintTiles(canvas).some(match => match.slot === index + 1);
        regions.release();
        trials.push({ width, slot: index + 1, previous, updated, cropped });
      }
      let frame = null;
      if (example.capturedFrameFile) {
        const image = new Image(); image.src = `/feedback-fixture/${example.capturedFrameFile}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image,0,0,1600,900);
        const pixels = ctx.getImageData(0,0,1600,900);
        frame = { panel: current.isLootPanelVisible(pixels), previousPanel: legacy.isLootPanelVisible(pixels),
          previous: legacy.detectBlueprintTiles(pixels,'CONTAINER LOADOUT').map(match => match.slot),
          updated: current.detectBlueprintTiles(pixels,'CONTAINER LOADOUT').map(match => match.slot) };
      }
      rows.push({ id: example.id, label: example.verdict, name: example.reviewedName, expectedFrameSlots: example.frameBlueprintSlots,
        evidence, trials, frame });
    }
    return rows;
  }, manifest);
  const negatives = results.filter(row => row.label === 'not_blueprint');
  const positives = results.filter(row => row.label === 'blueprint');
  const summary = {
    negativeExamples: negatives.length, positiveExamples: positives.length,
    before: { falsePositiveExamples: negatives.filter(row => row.trials.some(trial => trial.previous)).length,
      falsePositiveTrials: negatives.flatMap(row => row.trials).filter(trial => trial.previous).length,
      missedPositiveTrials: positives.flatMap(row => row.trials).filter(trial => !trial.previous).length },
    after: { falsePositiveExamples: negatives.filter(row => row.trials.some(trial => trial.updated)).length,
      falsePositiveTrials: negatives.flatMap(row => row.trials).filter(trial => trial.updated).length,
      missedPositiveTrials: positives.flatMap(row => row.trials).filter(trial => !trial.updated).length },
  };
  await writeFile(new URL('detection-results.json', root), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary));
  for (const row of results) {
    assert.equal(row.evidence.isBlueprint, row.label === 'blueprint', `${row.id}: captured tile label`);
    for (const trial of row.trials) {
      assert.equal(trial.updated, row.label === 'blueprint', `${row.id}/${trial.width}/slot ${trial.slot}`);
      assert.equal(trial.cropped, trial.updated, `${row.id}: capture crop changed classification`);
    }
    if (row.frame) {
      // Reduced 960px discovery frames can already fail the old lettering gate
      // after JPEG compression. Preserve its positive behavior; reject scenery.
      assert.equal(row.frame.panel, row.label === 'blueprint' ? row.frame.previousPanel : false, `${row.id}: container panel gate`);
      if (row.label === 'not_blueprint') assert.deepEqual(row.frame.updated, [], `${row.id}: false gameplay frame`);
      else assert.deepEqual(row.frame.updated, row.expectedFrameSlots, `${row.id}: real blueprint frame slots`);
    }
  }
  console.log('All labeled tiles, 360 placement/scale trials, capture crops, and available real frames passed.');
} finally { await browser.close(); }
