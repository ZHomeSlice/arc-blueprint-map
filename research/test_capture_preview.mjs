import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 360;
      const context = canvas.getContext('2d');
      let tick = 0;
      setInterval(() => {
        context.fillStyle = tick++ % 2 ? '#548bb4' : '#395e87';
        context.fillRect(0, 0, canvas.width, canvas.height);
      }, 100);
      const stream = canvas.captureStream(15);
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), displaySurface: 'monitor' });
      return stream;
    };
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.getByRole('button', { name: 'Start capture' }).click();
  await page.locator('#live-preview').evaluate(video => new Promise(resolve => {
    if (video.readyState >= 2) resolve(); else video.addEventListener('loadeddata', resolve, { once: true });
  }));
  const sharing = await page.evaluate(() => ({
    visible: !document.querySelector('#preview-panel').hidden,
    width: document.querySelector('#live-preview').videoWidth,
    height: document.querySelector('#live-preview').videoHeight,
    surface: document.querySelector('#preview-details').textContent,
    hint: document.querySelector('#preview-hint').textContent,
  }));
  if (!sharing.visible || sharing.width !== 640 || sharing.height !== 360 || !sharing.surface.includes('Entire Screen')) {
    throw new Error(`Preview failed: ${JSON.stringify(sharing)}`);
  }
  console.log('sharing', JSON.stringify(sharing));
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await page.evaluate(() => ({
    hidden: document.querySelector('#preview-panel').hidden,
    stream: document.querySelector('#live-preview').srcObject,
    startEnabled: !document.querySelector('#start-capture').disabled,
  }));
  if (!stopped.hidden || stopped.stream || !stopped.startEnabled) throw new Error(`Stop failed: ${JSON.stringify(stopped)}`);
  console.log('stopped', JSON.stringify(stopped));
} finally { await browser.close(); }
