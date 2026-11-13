const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
const database={execAsync:async sql=>db.exec(sql),runAsync:async(sql,...args)=>db.prepare(sql).run(...args),getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args)||null,getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args),withExclusiveTransactionAsync:async work=>{db.exec('BEGIN');try{await work(database);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
let connected=false,requests=0,fail=false,id=0;
const dependencies={'@react-native-community/netinfo':{default:{fetch:async()=>({isConnected:connected,isInternetReachable:connected}),addEventListener:()=>()=>{}}},'expo-crypto':{randomUUID:()=>`id-${++id}`},'expo-sqlite':{openDatabaseAsync:async()=>database}};
const fetch=async(url,init)=>{requests++;if(fail)throw Error('Connection lost');const {sessions}=JSON.parse(init.body);return{ok:true,json:async()=>({success:true,data:{syncedSessionIds:sessions.map(s=>s.clientSessionId),syncedPointIds:sessions.flatMap(s=>s.points.map(p=>p.clientId))}})};};
function load(){const out={};const js=ts.transpileModule(fs.readFileSync(__dirname+'/../src/lib/driver-trail-queue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports','fetch',js)(name=>dependencies[name],out,fetch);return out;}
(async()=>{let queue=load();const context={collectorId:'driver',apiUrl:'https://mock',token:'token'};
await queue.startDriverTrailSession({collectorId:'driver',routeId:'route',routeName:'Test'});
await queue.recordDriverTrailLocation({timestamp:Date.now(),coords:{latitude:13.6,longitude:123.2,accuracy:5}},'driver');
await queue.finishDriverTrailSession();
assert.equal((await queue.syncDriverTrailQueue(context)).pendingPoints,1);assert.equal(requests,0);
queue=load();assert.equal((await queue.getDriverTrailQueueStats('driver')).pendingSessions,1);
assert.equal(db.prepare('SELECT status FROM driver_trail_sessions').get().status,'completed');
connected=true;fail=true;await queue.syncDriverTrailQueue(context);assert.equal((await queue.getDriverTrailQueueStats('driver')).pendingPoints,1);
fail=false;const result=await queue.syncDriverTrailQueue(context);assert.equal(result.pendingSessions,0);assert.equal(result.syncedPoints,1);
console.log('PASS: offline start/record/end, process restart, no offline upload, failed upload retention and successful reconnect sync.');db.close();})().catch(e=>{console.error(e);process.exitCode=1;});
