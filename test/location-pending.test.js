import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingMapSightings} from '../public/location-pending.js';
const now=Date.parse('2026-10-02T03:00:00Z');
const entry=(id,age,extra={})=>({id,seenAt:new Date(now-age).toISOString(),...extra});
test('selected and delayed sightings remain eligible for the next nearby map',()=>{
  const sightings=[entry('selected',90000),entry('delayed',150000),entry('old',240000)];
  assert.deepEqual(pendingMapSightings(sightings,now).map(s=>s.id),['selected','delayed']);
});
test('an open-map retry outlives the window without accepting unrelated old finds',()=>{
  const sightings=[entry('captured',600000),entry('old',600000),entry('dismissed',1000,{dismissed:true}),
    entry('missed',1000,{locationMissed:true}),entry('saved',1000,{savedFindId:'find'}),entry('located',1000,{position:{x:.4,y:.5}})];
  assert.deepEqual(pendingMapSightings(sightings,now,['captured']).map(s=>s.id),['captured']);
  assert.deepEqual(pendingMapSightings(sightings,now),[]);
});
