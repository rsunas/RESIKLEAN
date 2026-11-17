const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
const database={execAsync:async sql=>db.exec(sql),runAsync:async(sql,...args)=>db.prepare(sql).run(...args),getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args)||null,getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args),withExclusiveTransactionAsync:async work=>{db.exec('BEGIN');try{await work(database);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
let connected=false,requests=0,fail=false,hang=false,id=0,lastSignal;
function readModule(name,dependencies){const out={};const js=ts.transpileModule(fs.readFileSync(__dirname+'/../src/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports',js)(key=>dependencies[key],out);return out;}
const timeout=readModule('async-timeout',{}).withTimeout;
const dependencies={'./async-timeout':{withTimeout:operation=>timeout(operation,30)},'@react-native-community/netinfo':{default:{fetch:async()=>({isConnected:connected,isInternetReachable:connected}),addEventListener:()=>()=>{}}},'expo-crypto':{randomUUID:()=>`id-${++id}`},'expo-sqlite':{openDatabaseAsync:async()=>database}};
const fetch=async(url,init)=>{requests++;lastSignal=init.signal;if(hang)return new Promise(()=>{});if(fail)throw Error('Connection lost');const {sessions}=JSON.parse(init.body);return{ok:true,json:async()=>({success:true,data:{syncedSessionIds:sessions.map(s=>s.clientSessionId),syncedPointIds:sessions.flatMap(s=>s.points.map(p=>p.clientId))}})};};
function load(){const out={};const js=ts.transpileModule(fs.readFileSync(__dirname+'/../src/lib/driver-trail-queue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports','fetch',js)(name=>dependencies[name],out,fetch);return out;}
(async()=>{let queue=load();const {mergeRouteHistory}=readModule('driver-route-history-cache',dependencies);const path={type:'LineString',coordinates:[[123.2,13.6],[123.201,13.601]]};const context={collectorId:'driver',apiUrl:'https://mock',token:'token'};
await queue.startDriverTrailSession({collectorId:'driver',routeId:'route',routeName:'Test',routePath:path});
await queue.recordDriverTrailLocation({timestamp:Date.now(),coords:{latitude:13.6,longitude:123.2,accuracy:5}},'driver');
await queue.recordDriverTrailLocation({timestamp:Date.now()+5000,coords:{latitude:13.6001,longitude:123.2001,accuracy:5}},'driver');
await queue.finishDriverTrailSession();
assert.equal((await queue.syncDriverTrailQueue(context)).pendingPoints,2);assert.equal(requests,0);
queue=load();assert.equal((await queue.getDriverTrailQueueStats('driver')).pendingSessions,1);
assert.equal(db.prepare('SELECT status FROM driver_trail_sessions').get().status,'completed');
const local=await queue.getLocalDriverTrailHistory('driver');assert.equal(local.length,1);assert.deepEqual(local[0].routePath,path);assert.equal(local[0].trailPath.coordinates.length,2);assert.equal(local[0].pendingSync,true);assert.deepEqual(await queue.getLocalDriverTrailHistory('other'),[]);
let merged=mergeRouteHistory([{...local[0],routePath:undefined,trailPath:undefined}],local);assert.deepEqual(merged[0].routePath,path);assert.equal(merged[0].trailPath.coordinates.length,2);assert.equal(mergeRouteHistory(merged,local).length,1);
connected=true;hang=true;await queue.syncDriverTrailQueue(context);assert.equal(lastSignal.aborted,true);assert.equal((await queue.getDriverTrailQueueStats('driver')).pendingPoints,2);hang=false;fail=true;await queue.syncDriverTrailQueue(context);assert.equal((await queue.getDriverTrailQueueStats('driver')).pendingPoints,2);
fail=false;const result=await queue.syncDriverTrailQueue(context);assert.equal(result.pendingSessions,0);assert.equal(result.syncedPoints,2);
const synced=await queue.getLocalDriverTrailHistory('driver');assert.equal(synced[0].pendingSync,false);assert.equal(synced[0].trailPath.coordinates.length,2);
console.log('PASS: local assigned/GPS paths survive restart and sync, owner isolation, empty server path merge, upload timeout and retry.');
console.log('PASS: offline start/record/end, process restart, no offline upload, failed upload retention and successful reconnect sync.');db.close();})().catch(e=>{console.error(e);process.exitCode=1;});
