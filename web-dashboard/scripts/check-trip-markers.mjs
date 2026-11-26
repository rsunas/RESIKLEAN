import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { historyTrailEndpoints } from '../src/components/routeTrailGeometry.js';
const require = createRequire(new URL('../../mobile/package.json', import.meta.url));
const ts = require('typescript'), mobile = {};
const source = readFileSync(new URL('../../mobile/src/lib/driver-route-history-cache.ts', import.meta.url), 'utf8');
new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(() => ({}), mobile);
const { historyTrailMarkers, mergeRouteHistory, historyTrailStartpoint, historyTrailEndpoint } = mobile;
const day = '2026-11-26';
const point = (session, minute, coordinate) => ({clientSessionId:session,recordedAt:day+'T00:'+minute+':00Z',longitude:coordinate[0],latitude:coordinate[1]});
const points = [point('a','01',[123,13]),point('a','04',[124,14]),point('b','02',[123.2,13.2]),point('b','03',[123.3,13.3])];
const session = id => {
 const p=points.filter(p=>p.clientSessionId===id);
 return {id,date:day,routeId:'route',sessionStartedAt:p[0].recordedAt,sessionEndedAt:day+'T00:05:00Z',
 firstLocation:[p[0].longitude,p[0].latitude],firstRecordedAt:p[0].recordedAt,
 lastLocation:[p.at(-1).longitude,p.at(-1).latitude],lastRecordedAt:p.at(-1).recordedAt,
 trailPath:{type:'LineString',coordinates:p.map(p=>[p.longitude,p.latitude])}};
};
for(const ordered of [points,[...points].reverse()]) {
 const web=historyTrailEndpoints({trailPoints:ordered,sessions:[{endedAt:day+'T00:05:00Z'}]});
 assert.deepEqual(web.markers,[{point:[123,13],label:'Start'},{point:[124,14],label:'End'}]);
 for(const records of [[session('a'),session('b')],[session('b'),session('a')]]) {
  assert.deepEqual(historyTrailMarkers(mergeRouteHistory([],records)[0]),web.markers);
 }
}
const lone={...session('a'),firstLocation:[122,12],firstRecordedAt:day+'T00:00:00Z',lastLocation:[125,15],lastRecordedAt:day+'T00:06:00Z'};
for(const records of [[lone,session('a')],[session('a'),lone]]) {
 const merged=mergeRouteHistory([],records)[0];
 assert.deepEqual(historyTrailStartpoint(merged),[122,12]); assert.deepEqual(historyTrailEndpoint(merged),[125,15]);
}
const legacy={...session('a'),firstLocation:undefined,firstRecordedAt:undefined,lastLocation:undefined,lastRecordedAt:undefined,
 sessionStartedAt:day+'T00:00:00Z',sessionEndedAt:day+'T00:10:00Z'};
for(const records of [[legacy,lone],[lone,legacy]]) {
 const merged=mergeRouteHistory([],records)[0];
 assert.deepEqual(historyTrailStartpoint(merged),lone.firstLocation);
 assert.deepEqual(historyTrailEndpoint(merged),lone.lastLocation);
}
const single={...session('a'),firstLocation:[123,13],lastLocation:[123,13]};
assert.deepEqual(historyTrailMarkers(single),[{point:[123,13],label:'Start / End'}]);
assert.deepEqual(historyTrailEndpoints({trailPoints:[points[0]],session:{endedAt:day}}).markers,historyTrailMarkers(single));
assert.deepEqual(historyTrailEndpoints({trailPoints:[],trail:{coveredCoordinates:[[123,13],[124,14]]}}).markers,[]);
assert.deepEqual(historyTrailMarkers({firstLocation:null,lastLocation:null,trailPath:session('a').trailPath}),[]);
assert.deepEqual(historyTrailMarkers({routePath:session('a').trailPath}),[]);
assert.equal(historyTrailMarkers({...single,sessionEndedAt:undefined})[0].label,'Start / Last GPS');
assert.deepEqual(historyTrailEndpoints({logs:[{latitude:1,longitude:2,collectedAt:day,exitedAt:day}]}).markers,[]);
console.log('PASS: driver/admin marker parity across interleaved trips, reversed uploads, stale cache, isolated fixes, one-point trips, active trips and missing GPS; geofence coordinates are never guessed.');
