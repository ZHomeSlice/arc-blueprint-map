import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
const port = Number(process.env.PORT || 4177);
const origin = `http://127.0.0.1:${port}`;
let overlayProcess = null;
let overlayState = { revision: 0, expanded: false, bar: 'Capture stopped' };
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

async function overlayRequest(req, res, pathname) {
  if (pathname === '/api/overlay/state' && req.method === 'GET') {
    json(res, 200, overlayState); return;
  }
  if (pathname === '/api/overlay/status' && req.method === 'GET') {
    json(res, 200, { open: Boolean(overlayProcess && overlayProcess.exitCode === null) }); return;
  }
  if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return; }
  const payload = await requestJson(req);
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
