import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
const port = Number(process.env.PORT || 4177);
const origin = `http://127.0.0.1:${port}`;
let overlayProcess = null;
let overlayState = { revision: 0, expanded: false, bar: 'Capture stopped' };
let pipVisibilityQueue = Promise.resolve();
let pipCommand = { revision: 0, visible: false };
let pipCompanionSeenAt = 0;
let pipCompanionResult = { revision: 0, success: true };
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(value));
}

async function requestJson(req) {
  if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json'))
    throw new Error('Invalid overlay request');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 400_000) throw new Error('Overlay request too large');
  }
  return JSON.parse(body || '{}');
}

function pipBounds(payload) {
  const bounds = ['left', 'top', 'width', 'height', 'viewportHeight', 'targetViewportHeight'].map(key => Number(payload[key]));
  if (typeof payload.visible !== 'boolean' || bounds.some(value => !Number.isInteger(value)) ||
      bounds[2] < 250 || bounds[2] > 1200 || bounds[3] < 80 || bounds[3] > 900 ||
      bounds[4] < 40 || bounds[4] > 900 || ![88, 330].includes(bounds[5]))
    throw new Error('Invalid Picture-in-Picture window bounds');
  return bounds;
}

function setPipVisibility(payload) {
  const bounds = pipBounds(payload);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    join(root, 'Windows-Pip-Visibility.ps1'), '-Action', payload.visible ? 'Show' : 'Hide',
    '-Left', String(bounds[0]), '-Top', String(bounds[1]),
    '-Width', String(bounds[2]), '-Height', String(bounds[3]),
    '-ViewportHeight', String(bounds[4]), '-TargetViewportHeight', String(bounds[5])];
  const work = pipVisibilityQueue.then(() => new Promise((resolve, reject) => {
    execFile('powershell.exe', args, { cwd: root, windowsHide: true, timeout: 5000 },
      (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout.trim()));
  }));
  pipVisibilityQueue = work.catch(() => {});
  return work;
}

async function overlayRequest(req, res, pathname) {
  if (pathname === '/api/overlay/state' && req.method === 'GET') {
    json(res, 200, overlayState); return;
  }
  if (pathname === '/api/overlay/status' && req.method === 'GET') {
    json(res, 200, { open: Boolean(overlayProcess && overlayProcess.exitCode === null) }); return;
  }
  if (pathname === '/api/overlay/pip-command' && req.method === 'GET') {
    json(res, 200, pipCommand); return;
  }
  if (pathname === '/api/overlay/pip-companion-status' && req.method === 'GET') {
    json(res, 200, { active: Date.now() - pipCompanionSeenAt < 3000, result: pipCompanionResult }); return;
  }
  if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return; }
  const payload = await requestJson(req);
  if (pathname === '/api/overlay/pip-heartbeat') {
    pipCompanionSeenAt = Date.now();
    json(res, 200, { active: true }); return;
  }
  if (pathname === '/api/overlay/pip-report') {
    if (Number.isInteger(payload.revision) && typeof payload.success === 'boolean' &&
        payload.revision >= pipCompanionResult.revision) {
      pipCompanionResult = { revision: payload.revision, success: payload.success,
        error: String(payload.error || '').slice(0, 200) };
    }
    json(res, 200, pipCompanionResult); return;
  }
  if (pathname === '/api/overlay/pip-visibility') {
    if (process.platform !== 'win32') { json(res, 501, { error: 'Windows Picture-in-Picture control unavailable' }); return; }
    const bounds = pipBounds(payload);
    const revision = pipCommand.revision + 1;
    pipCommand = { revision, visible: payload.visible,
      left: bounds[0], top: bounds[1], width: bounds[2], height: bounds[3],
      viewportHeight: bounds[4], targetViewportHeight: bounds[5] };
    const queued = Date.now() - pipCompanionSeenAt < 3000;
    if (!queued) await setPipVisibility(payload);
    json(res, 200, { visible: payload.visible, revision, queued }); return;
  }
  if (pathname === '/api/overlay/state') {
    if (!Number.isFinite(payload.revision) || payload.revision <= overlayState.revision) {
      json(res, 200, { revision: overlayState.revision }); return;
    }
    overlayState = { revision: payload.revision, expanded: Boolean(payload.expanded),
      bar: String(payload.bar || '').slice(0, 80), name: String(payload.name || '').slice(0, 160),
      message: String(payload.message || '').slice(0, 300), detail: String(payload.detail || '').slice(0, 300),
      image: String(payload.image || '').slice(0, 160_000), mapImage: String(payload.mapImage || '').slice(0, 160_000) };
    json(res, 200, { revision: overlayState.revision }); return;
  }
  if (pathname === '/api/overlay/open') {
    if (process.platform !== 'win32') { json(res, 501, { error: 'Windows overlay unavailable' }); return; }
    if (!overlayProcess || overlayProcess.exitCode !== null) {
      overlayProcess = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass',
        '-File', join(root, 'Windows-Blueprint-Overlay.ps1'), '-Port', String(port)],
      { cwd: root, windowsHide: true, stdio: 'ignore' });
      overlayProcess.on('error', () => { overlayProcess = null; });
    }
    json(res, 200, { open: true }); return;
  }
  if (pathname === '/api/overlay/close') {
    overlayProcess?.kill(); overlayProcess = null;
    json(res, 200, { open: false }); return;
  }
  json(res, 404, { error: 'Unknown overlay action' });
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/overlay/')) { await overlayRequest(req, res, pathname); return; }
    const relative = pathname === '/' ? '/index.html' : pathname;
    const target = resolve(publicRoot, `.${relative.startsWith('/') ? relative : `/${relative}`}`);
    if (!target.startsWith(resolve(publicRoot) + sep) || !(await stat(target)).isFile()) {
      res.writeHead(404).end(); return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': mime[extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).end(body);
  } catch (error) {
    if (req.url?.startsWith('/api/overlay/')) json(res, 400, { error: error.message });
    else res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`ARC Blueprint Map: http://127.0.0.1:${port}`);
});
