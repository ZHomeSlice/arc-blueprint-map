import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = resolve(process.argv[2]);
const runtime = join(root, 'runtime/node.exe');
assert.match(execFileSync(runtime, ['--version'], { windowsHide:true }).toString(), /^v24\./);
const pkg = JSON.parse(await readFile(join(root, 'package.json')));
assert.equal(pkg.version, '0.2.4');
const app = await readFile(join(root,'public/app.js'),'utf8');
assert(!app.includes('suppliedFinds') && !app.includes('screenshotFinds'), 'Private prototype controls must be removed');
for (const [,relative] of app.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
  assert((await stat(join(root,'public',relative))).isFile(), `Missing packaged module: ${relative}`);
}
const index = await readFile(join(root,'public/index.html'),'utf8');
assert(!index.includes('add-screenshot-finds') && !index.includes('/collection.html'));
const catalog = JSON.parse(await readFile(join(root,'public/collection-data.json')));
assert(catalog.every(entry=>Object.keys(entry).every(key=>['slot','row','column','name','icon'].includes(key))));

const server = spawn(runtime, ['server.mjs'], { cwd:root, env:{...process.env,PORT:'4194'}, windowsHide:true, stdio:['ignore','pipe','pipe'] });
let serverOutput=''; server.stderr.on('data',chunk=>{serverOutput+=chunk;});
let browser;
try {
  await new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>reject(new Error(`Packaged server failed to start: ${serverOutput}`)),10000);
    server.once('error',reject);
    server.once('exit',code=>reject(new Error(`Packaged server exited ${code}: ${serverOutput}`)));
    server.stdout.on('data',chunk=>{if(chunk.toString().includes('ARC Blueprint Map:')) {clearTimeout(deadline);resolve();}});
  });
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[]; const failures=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))failures.push(`${response.status()} ${response.url()}`);});
  await page.goto('http://127.0.0.1:4194/');
  await page.waitForFunction(()=>document.querySelectorAll('#blueprint-list [role="option"]').length>0);
  assert.equal(await page.locator('#preset-map option').count(),9);
  assert.equal(await page.locator('#recent-find-count').textContent(),'0');
  await page.evaluate(async()=>{
    const {emptyData}=await import('/backup.js'); const data=emptyData();
    data.finds=[{id:'package-find',name:'Tagging Grenade',map:'Stella Montis Upper',x:.386,y:.324,
      foundAt:new Date().toISOString(),nameSource:'user edited'}];
    localStorage.setItem('arc-blueprint-map-v1',JSON.stringify(data));
  });
  await page.reload();
  await page.locator('#recent-find-list button').click();
  assert.equal(await page.locator('#current-map-title').textContent(),'Stella Montis Upper');
  assert.equal(await page.locator('#pin-popup-title').textContent(),'Tagging Grenade');
  assert.match(await page.locator('#map-content').getAttribute('style'),/scale\(2\.5\)/);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export-data').click();
  const download=await downloadPromise; const chunks=[];
  for await(const chunk of await download.createReadStream()) chunks.push(chunk);
  const backup=JSON.parse(Buffer.concat(chunks));
  assert.equal(backup.version,2); assert.equal(backup.finds.length,1);
  assert.deepEqual(errors,[]); assert.deepEqual(failures,[]);
  console.log(`PASS: Windows v${pkg.version} launches with bundled Node, every app module loads, private controls are removed, catalog loads, history zoom works, and JSON backup exports.`);
} finally {
  if(browser)await browser.close();
  server.kill();
}
