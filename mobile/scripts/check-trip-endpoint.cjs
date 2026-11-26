const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const output={};
new Function('require','exports',ts.transpileModule(fs.readFileSync(__dirname+'/../src/lib/driver-route-history-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),output);
const {mergeRouteHistory,historyTrailEndpoint}=output;
const date='2026-11-26';
const trip=(hour,coords)=>({id:date+'|route',date,routeId:'route',sessionStartedAt:date+'T'+hour+':00:00Z',sessionEndedAt:date+'T'+hour+':30:00Z',lastRecordedAt:date+'T'+hour+':29:59Z',lastLocation:coords.at(-1),trailPath:{type:'LineString',coordinates:coords}});
const old=trip('01',[[123.1,13.1],[123.2,13.2]]),recent=trip('03',[[123.3,13.3],[123.4,13.4]]),middle=trip('02',[[123.2,13.2],[123.3,13.3]]);
for(const records of [[recent,middle,old],[old,middle,recent],[middle,recent,old]]){
 const merged=mergeRouteHistory([],records)[0];
 assert.deepEqual(historyTrailEndpoint(merged),recent.lastLocation);
 assert.equal(merged.lastRecordedAt,recent.lastRecordedAt);
 assert.deepEqual(historyTrailEndpoint(mergeRouteHistory([old],[merged])[0]),recent.lastLocation);
}
const lone={...recent,lastLocation:[123.5,13.5],lastRecordedAt:date+'T03:35:00Z',sessionEndedAt:date+'T03:35:01Z'};
assert.deepEqual(historyTrailEndpoint(mergeRouteHistory([recent],[lone])[0]),lone.lastLocation);
assert.deepEqual(historyTrailEndpoint({...lone,trailPath:undefined}),lone.lastLocation);
const full={...recent,lastLocation:undefined,lastRecordedAt:undefined,trailPath:{type:'LineString',coordinates:[[123.1,13.1],[123.2,13.2],[123.3,13.3]]}};
const prefix={...full,trailPath:{type:'LineString',coordinates:full.trailPath.coordinates.slice(0,2)}};
for(const pair of [[full,prefix],[prefix,full]]) assert.deepEqual(historyTrailEndpoint(mergeRouteHistory([pair[0]],[pair[1]])[0]),[123.3,13.3]);
assert.equal(historyTrailEndpoint({routePath:old.trailPath}),null);
assert.equal(historyTrailEndpoint({lastLocation:[NaN,13]}),null);
assert.deepEqual(historyTrailEndpoint({lastLocation:[999,13],trailPath:old.trailPath}),old.lastLocation);
console.log('PASS: endpoint survives reversed trips, stale sync, legacy prefixes, isolated final points, and invalid/missing GPS.');
