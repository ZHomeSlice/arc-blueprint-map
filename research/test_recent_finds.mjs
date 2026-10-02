import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { emptyData } from '../public/backup.js';

const now = Date.parse('2026-10-02T03:30:00Z');
const entry = (id, name, map, minutes, x, y) => ({ id, name, map, x, y,
  foundAt: new Date(now - minutes * 60000).toISOString(), nameSource: 'user edited' });
const seed = emptyData(); seed.currentMap = 'Spaceport';
seed.finds = [entry('upper','Tagging Grenade','Stella Montis Upper',25,.38,.32),
  entry('lower','Seeker Grenade','Stella Montis Lower',5,.28,.43),
  entry('old','Silencer II','Spaceport',61,.35,.36)];
seed.sightings = [{ id:'linked-upper', savedFindId:'upper', name:'Tagging Grenade',
  seenAt:seed.finds[0].foundAt, nameSource:'user edited', reviewVerdict:'blueprint',
  map:'Stella Montis Upper', position:{x:.38,y:.32}, catalogIcon:'/catalog-icons/tagging-grenade-recipe.webp' }];
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  const page = await browser.newPage({ viewport:{width:1440,height:1100} });
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({seed,now})=>{
    if(!localStorage.getItem('arc-blueprint-map-v1')) localStorage.setItem('arc-blueprint-map-v1',JSON.stringify(seed));
    window.recentTestNow=now; Date.now=()=>window.recentTestNow;
    const interval=window.setInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>interval(fn,ms===60000?250:ms,...args);
  },{seed,now});
  await page.goto('http://127.0.0.1:4177/');
  assert.equal(await page.locator('#recent-find-count').textContent(),'2');
  assert.deepEqual(await page.locator('#recent-find-list strong').allTextContents(),['Seeker Grenade','Tagging Grenade']);
  assert.equal(await page.locator('#sighting-list .sighting-select').count(),0,'Completed sightings stay out of the review queue');
  await page.locator('#map-filters-toggle').click();
  await page.locator('#show-personal').uncheck();
  await page.locator('#map-filters-toggle').click();
  await page.locator('#recent-find-list button[data-find-id="lower"]').click();
  assert.equal(await page.locator('#current-map-title').textContent(),'Stella Montis Lower');
  assert.equal(await page.locator('#preset-map').inputValue(),'stella-lower');
  assert.equal(await page.locator('#pin-popup-title').textContent(),'Seeker Grenade');
  assert(await page.locator('#pin-popup-details').isVisible());
  assert(!(await page.locator('#pin-popup-form').isVisible()),'History opens details rather than editing');
  const focused=await page.locator('[data-pin-id="lower"]').boundingBox();
  const map=await page.locator('#map').boundingBox();
  assert(focused && map,'Selected find must be visible despite personal filters');
  assert(Math.abs(focused.x+focused.width/2-(map.x+map.width/2))<8);
  assert(Math.abs(focused.y+focused.height/2-(map.y+map.height/2))<8);
  assert.match(await page.locator('#map-content').getAttribute('style'),/scale\(2\.5\)/);
  await page.locator('#recent-find-list button[data-find-id="upper"]').click();
  assert.equal(await page.locator('#current-map-title').textContent(),'Stella Montis Upper');
  assert.equal(await page.locator('#pin-popup-title').textContent(),'Tagging Grenade');
  await page.setViewportSize({width:3072,height:1594});
  await page.locator('#recent-find-list button[data-find-id="lower"]').click();
  await page.waitForFunction(()=>{
    const rect=document.querySelector('[data-pin-id="lower"]').getBoundingClientRect();
    return Math.abs(rect.y+rect.height/2-window.innerHeight/2)<15;
  });
  await page.reload();
  assert.equal(await page.locator('#recent-find-count').textContent(),'2');
  await page.evaluate(now=>{window.recentTestNow=now+61*60000;},now);
  await page.waitForFunction(()=>document.getElementById('recent-find-count').textContent==='0');
  assert(await page.locator('#recent-finds-empty').isVisible());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).finds.length),3,'Expired history must not delete finds');
  assert.deepEqual(errors,[]);
  console.log('PASS: recent finds, discovery-time order, cross-floor map switch, 2.5× centered zoom, filtered pin visibility, details, reload, idle expiry, and data preservation.');
} finally { await browser.close(); }
