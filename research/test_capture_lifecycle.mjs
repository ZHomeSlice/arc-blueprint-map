import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const screenshot = await readFile('C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/20260927195813_1.jpg');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/test-loot.jpg', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: screenshot }));
  await page.route('**/vendor/tesseract.min.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: `
    window.Tesseract={createWorker:async()=>{
      window.captureMetrics.created++;
      await new Promise(resolve=>setTimeout(resolve,window.workerDelay));
      return {recognize:async()=>{window.captureMetrics.ocr++;return {data:{text:'DEFIBRILLATOR BLUEPRINT'}}},
        terminate:async()=>{window.captureMetrics.terminated++}};
    }};` }));
  await page.addInitScript(() => {
    window.workerDelay = 0;
    window.captureMetrics = { created: 0, terminated: 0, ocr: 0, readPixels: 0, fullReads: 0, fullCopies: 0 };
    const getImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, width, height, ...rest) {
      window.captureMetrics.readPixels += width * height;
      if (width >= 1000 && height >= 600) window.captureMetrics.fullReads++;
      return getImageData.call(this, x, y, width, height, ...rest);
    };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (source instanceof HTMLVideoElement && args.length === 4 && args[2] >= 1000 && args[3] >= 600)
        window.captureMetrics.fullCopies++;
      return drawImage.call(this, source, ...args);
    };
    navigator.mediaDevices.getDisplayMedia = async options => {
      window.requestedCapture = options.video;
      const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
      window.testSetLoot = async () => {
        const image = new Image(); image.src = '/test-loot.jpg'; await image.decode();
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      const context = canvas.getContext('2d');
      window.testClearFrame = () => { context.fillStyle = '#17212b'; context.fillRect(0, 0, 1600, 900); };
      window.testClearFrame();
      window.testStream = canvas.captureStream(2);
      const track = window.testStream.getVideoTracks()[0];
      // Unlike a desktop stream, a canvas only emits frames when painted.
      // Supply frames while constraints and preview playback initialize.
      const frameTimer = setInterval(() => track.requestFrame(), 500);
      const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(frameTimer); stop(); };
      return window.testStream;
    };
  });
  await page.clock.install();
  await page.clock.resume();
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForTimeout(10000);
  const idle = await page.evaluate(() => ({ ...window.captureMetrics,
    requestedFPS: window.requestedCapture.frameRate, actualFPS: window.testStream.getVideoTracks()[0].getSettings().frameRate }));
  assert.equal(idle.created, 0, 'ordinary gameplay must not load OCR');
  assert.equal(idle.ocr, 0);
  assert.equal(idle.fullCopies, 0, 'ordinary gameplay must not copy full video frames');
  assert.equal(idle.fullReads, 0);
  assert.equal(idle.requestedFPS, 2);
  assert.ok(idle.actualFPS <= 2);
  assert.ok(idle.readPixels < 200000, `idle probes read too many pixels: ${idle.readPixels}`);
  console.log('10-second idle capture', JSON.stringify(idle));
  await page.locator('summary').filter({ hasText: 'Capture troubleshooting' }).click();
  await page.locator('#pause-scanning').check();
  const paused = await page.evaluate(() => ({ ...window.captureMetrics }));
  await page.evaluate(() => window.testSetLoot());
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(() => ({ ...window.captureMetrics })), paused, 'Pause left scanners running');
  assert.equal(await page.evaluate(() => window.testStream.getVideoTracks()[0].readyState), 'live');
  await page.evaluate(() => window.testClearFrame());
  await page.waitForTimeout(600);
  await page.locator('#pause-scanning').uncheck();
  console.log('Pause stops all analysis while sharing stays live');

  // Stop while the model is still loading. Its late result must be terminated
  // and must not start OCR, update the UI, or schedule work in the new session.
  await page.evaluate(() => { window.workerDelay = 2500; return window.testSetLoot(); });
  await page.waitForFunction(() => window.captureMetrics.created === 1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  assert.equal(await page.evaluate(() => window.testStream.getVideoTracks()[0].readyState), 'ended');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => window.captureMetrics.terminated === 1);
  await page.waitForFunction(() => !document.querySelector('#stop-capture').disabled);
  console.log('restart after model load', await page.evaluate(() => ({ status: document.querySelector('#status').textContent,
    startDisabled: document.querySelector('#start-capture').disabled, stopDisabled: document.querySelector('#stop-capture').disabled,
    readyState: document.querySelector('#live-preview').readyState, streamState: window.testStream.getVideoTracks()[0].readyState })));
  assert.equal(await page.evaluate(() => window.captureMetrics.ocr), 0, 'old model load resumed scanning');
  // Also exercise cleanup of an initialized worker before accelerating time.
  await page.evaluate(() => { window.workerDelay = 0; return window.testSetLoot(); });
  await page.waitForFunction(() => window.captureMetrics.ocr > 0);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForFunction(() => window.captureMetrics.terminated === 2);
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.waitForFunction(() => document.querySelector('#live-preview').readyState >= 2);
  console.log('Late model and initialized OCR worker cleanup passed');
  // Use accelerated browser time to exercise 15 minutes of polling, plus
  // repeated stop/start. This verifies work counts, not real GPU performance.
  const baseline = await page.evaluate(() => ({ ...window.captureMetrics }));
  await page.clock.runFor(15 * 60 * 1000);
  const longRun = await page.evaluate(() => ({ ...window.captureMetrics }));
  assert.equal(longRun.created, baseline.created);
  assert.equal(longRun.ocr, baseline.ocr);
  assert.equal(longRun.fullCopies, baseline.fullCopies);
  assert.equal(longRun.fullReads, baseline.fullReads);
  assert.ok(longRun.readPixels - baseline.readPixels > 10000000, 'simulated time did not exercise the visual polling loop');
  assert.ok(longRun.readPixels - baseline.readPixels < 16000000, 'idle polling workload grew unexpectedly');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const before = await page.evaluate(() => window.captureMetrics.readPixels);
  await page.clock.runFor(1100);
  assert.equal(await page.evaluate(() => window.captureMetrics.readPixels), before, 'scans continued after Stop');
  await page.clock.resume();
  for (let repeat = 0; repeat < 5; repeat++) {
    await page.getByRole('button', { name: 'Start capture' }).click();
    await page.waitForFunction(() => !document.querySelector('#stop-capture').disabled);
    await page.clock.runFor(1500);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
  }
  const stopped = await page.evaluate(() => ({ ...window.captureMetrics }));
  await page.clock.runFor(5000);
  assert.deepEqual(await page.evaluate(() => ({ ...window.captureMetrics })), stopped, 'restart left background callbacks running');
  assert.deepEqual(errors, []);
  console.log('15-minute simulated idle and repeated restart passed', JSON.stringify({ readPixels: longRun.readPixels - baseline.readPixels,
    fullFrameCopies: longRun.fullCopies - baseline.fullCopies, ocrCalls: longRun.ocr - baseline.ocr,
    terminatedWorkers: await page.evaluate(() => window.captureMetrics.terminated) }));
} finally { await browser.close(); }
