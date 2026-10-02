import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/zhome/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import { emptyData } from '../public/backup.js';
const folder = 'C:/Program Files (x86)/Steam/userdata/297991134/760/remote/1808500/screenshots/';
const cases = [
  {file:'20261001174814_1.jpg', name:'Silencer II', expected:{x:0.35427,y:0.36210}},
  {file:'20261001175418_1.jpg', name:'Extended Shotgun Mag II', expected:{x:0.36631,y:0.36701}},
];
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
  for (const entry of cases) for (const width of [1280,1600]) {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const stored = emptyData();
    stored.currentMap = 'Spaceport';
    stored.sightings = [{id:'test-sighting',name:entry.name,nameSource:'OCR',seenAt:new Date(Date.now()-90000).toISOString()}];
    const bytes = await readFile(folder+entry.file);
    await page.route('**/test-map.jpg', route=>route.fulfill({contentType:'image/jpeg',body:bytes}));
    await page.route('**/vendor/tesseract.min.js', route=>route.fulfill({contentType:'text/javascript',
      body:'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"SPACEPORT"}}),terminate:async()=>{}})};'}));
    await page.addInitScript(({stored,width})=>{
      if(!localStorage.getItem('arc-blueprint-map-v1'))localStorage.setItem('arc-blueprint-map-v1',JSON.stringify(stored));
      navigator.mediaDevices.getDisplayMedia=async()=>{
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width*9/16;
        const image=new Image();image.src='/test-map.jpg';await image.decode();
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        const stream=canvas.captureStream(2);
        const track=stream.getVideoTracks()[0];
        const timer=setInterval(()=>track.requestFrame(),100);
        const stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);stop();};
        return stream;
      };
    },{stored,width});
    await page.goto('http://127.0.0.1:4177/');
    // Selecting an unresolved sighting used to silently disable its capture.
    await page.locator('.sighting-select').click();
    await page.locator('#start-capture').click();
    try { await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].savedFindId,null,{timeout:20000}); }
    catch(error){console.error(await page.locator('#status').textContent());throw error;}
    const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0]);
    assert.equal(result.map,'Spaceport');
    assert.equal(result.mapCapture.status,'located');
    assert.equal(result.mapCapture.source,'live capture');
    assert.equal(result.mapCapture.family,'spaceport');
    assert.match(result.mapCapture.frame,/^data:image\/jpeg/);
    assert.ok(Math.abs(result.position.x-entry.expected.x)<0.01 && Math.abs(result.position.y-entry.expected.y)<0.01);
    await page.locator('#stop-capture').click();
    await page.reload();
    await page.locator('.sighting-select').click();
    assert.ok(await page.locator('#sighting-map-preview').isVisible());
    assert.match(await page.locator('#sighting-map-status').textContent(),/located/);
    assert.deepEqual(errors,[]);
    console.log(`${entry.name} ${width}px: live location and retained map evidence passed`);
    await page.close();
  }
  for (const entry of cases) {
    const page = await browser.newPage();
    const stored = emptyData(); stored.currentMap = 'Spaceport';
    stored.sightings = [{id:'saved-sighting', name:entry.name, nameSource:'user edited', reviewVerdict:'blueprint',
      seenAt:new Date().toISOString(), savedFindId:'saved-find', map:'Spaceport', position:{x:.4,y:.4}}];
    stored.finds = [{id:'saved-find', sightingId:'saved-sighting', name:entry.name, nameSource:'user edited',
      map:'Spaceport',x:.4,y:.4,foundAt:stored.sightings[0].seenAt}];
    await page.addInitScript(stored=>{if(!localStorage.getItem('arc-blueprint-map-v1'))localStorage.setItem('arc-blueprint-map-v1',JSON.stringify(stored));},stored);
    await page.route('**/vendor/tesseract.min.js', route=>route.fulfill({contentType:'text/javascript',body:'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"SPACEPORT"}}),terminate:async()=>{}})};'}));
    await page.goto('http://127.0.0.1:4177/');
    await page.locator('[data-pin-id="saved-find"]').click();
    await page.locator('#saved-map-screenshot').setInputFiles(folder+entry.file);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].mapCapture?.status==='located');
    const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')));
    assert.equal(result.finds.length,1);
    assert.equal(result.finds[0].id,'saved-find');
    assert.ok(Math.abs(result.finds[0].x-entry.expected.x)<.01 && Math.abs(result.finds[0].y-entry.expected.y)<.01);
    assert.equal(result.sightings[0].position.x,result.finds[0].x);
    assert.equal(result.sightings[0].mapCapture.source,'saved screenshot');
    assert.equal(result.sightings[0].mapCapture.filename,entry.file);
    assert.match(result.finds[0].accuracy,/saved in-game map screenshot/);
    console.log(`${entry.name}: saved pin corrected from screenshot without duplicate finds`);
    await page.close();
  }
  const page=await browser.newPage();
  const stored=emptyData(); stored.sightings=[{id:'failed-test',name:'Silencer II',seenAt:new Date().toISOString()}];
  await page.addInitScript(stored=>{if(!localStorage.getItem('arc-blueprint-map-v1'))localStorage.setItem('arc-blueprint-map-v1',JSON.stringify(stored));},stored);
  await page.route('**/vendor/tesseract.min.js', route=>route.fulfill({contentType:'text/javascript',body:'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"unreadable"}}),terminate:async()=>{}})};'}));
  await page.goto('http://127.0.0.1:4177/');
  await page.locator('.sighting-select').click();
  await page.locator('#saved-map-screenshot').setInputFiles(folder+cases[0].file);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('arc-blueprint-map-v1')).sightings[0].mapCapture?.status==='failed');
  await page.reload(); await page.locator('.sighting-select').click();
  assert.ok(await page.locator('#sighting-map-preview').isVisible());
  assert.match(await page.locator('#sighting-map-status').textContent(),/failed.*not readable/);
  console.log('Failed map title: screenshot and failure reason retained after reload');
} finally {await browser.close();}
