const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function moduleFile(name){const out={};const code=ts.transpileModule(fs.readFileSync(__dirname+'/../src/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(()=>({}),out);return out;}
const {mergeRouteHistory,historyTrailStartpoint}=moduleFile('driver-route-history-cache');const {withTimeout}=moduleFile('async-timeout');
const source=ts.createSourceFile('collector.tsx',fs.readFileSync(__dirname+'/../app/collector.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const declarations={};
function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))declarations[n.name.text]=n.initializer?.getText(source);if(ts.isFunctionDeclaration(n)&&n.name)declarations[n.name.text]=n.getText(source);ts.forEachChild(n,visit);}visit(source);
function evaluate(name,context){const code=ts.transpileModule('const result = '+declarations[name],{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;return new Function(...Object.keys(context),code+';return result;')(...Object.values(context));}
const path={type:'LineString',coordinates:[[123.17,13.62],[123.19,13.62]]},trail={type:'LineString',coordinates:[[123.1,13.5],[123.11,13.51],[123.12,13.52]]};
const day='2026-11-13',local={id:day+'|route',date:day,routeId:'route',routeName:'Test',trailPath:trail,routePath:path,stopLogs:[],sessionStartedAt:day+'T01:00:00Z',sessionEndedAt:day+'T02:00:00Z'};
let shown=[],cached=[],loading=false,cleared=false,queued=false,ended=false,connected=false;
const context={isUpdatingGeofence:false,isSubmittingRoute:false,useCallback:fn=>fn,collectorId:'driver',session:{token:'token',user:{_id:'driver'}},API_URL:'https://fixture',historyLoadRequestRef:{current:0},
 finishRouteFlowRef:{current:false},driverDataRequestRef:{current:0},setIsLoading(){},
 submittingRouteRef:{current:false},
 setHistoryLoading:v=>loading=v,setHistoryLoadError(){},setHistoryGroups:v=>shown=v,setSelectedHistoryGroup(){},getRouteHistoryCache:async()=>cached,getLocalDriverTrailHistory:async()=>[local],saveRouteHistoryCache:async(_,v)=>cached=v,mergeRouteHistory,withTimeout:promise=>withTimeout(promise,50),NetInfo:{fetch:async()=>({isConnected:connected,isInternetReachable:connected})},fetch:async()=>({ok:true,json:async()=>({success:true,data:{groups:[{...local,routePath:null,trailPath:null}]}})}),
 assignedRoute:{_id:'route',name:'Test',barangay:['Abella'],routePath:path},setIsFinishRouteConfirmVisible(){},setIsSubmittingRoute(){},setRouteActionMessage(){},queueRouteCompletion:async()=>{queued=true;},monitoringDay:()=>day,displayBarangay:v=>v.join(', '),totalStops:1,completed:0,setAssignedRoute:()=>cleared=true,clearCachedAssignedRoute:async()=>{},clearRouteProximityEvents:async()=>{},disableBackgroundGeofencing:async()=>{ended=true;},loadRouteHistory:async()=>{},syncDriverTrailQueue:async()=>({pendingSessions:1})};
context.requestJson=async (...args)=>{const response=await context.fetch(...args);return {response,payload:await response.json()};};
(async()=>{
 await evaluate('confirmRouteCompletion',context)();assert.equal(queued,true);assert.equal(ended,true);assert.equal(cleared,true);assert.deepEqual(shown[0].trailPath,trail);assert.deepEqual(shown[0].routePath,path);assert.equal(shown[0].pendingSync,true);
 await evaluate('loadRouteHistory',context)('token');assert.equal(loading,false);assert.deepEqual(shown[0].trailPath,trail);
 connected=true;await evaluate('loadRouteHistory',context)('token');assert.deepEqual(shown[0].trailPath,trail);assert.deepEqual(shown[0].routePath,path);
 context.fetch=()=>new Promise(()=>{});await evaluate('loadRouteHistory',context)('token');assert.equal(loading,false);assert.deepEqual(shown[0].trailPath,trail);
 const prefix={...local,trailPath:{type:'LineString',coordinates:trail.coordinates.slice(0,2)}};assert.deepEqual(mergeRouteHistory([local],[prefix])[0].trailPath,trail);
 const other={...local,trailPath:{type:'LineString',coordinates:[[123.2,13.6],[123.21,13.61]]}};assert.equal(mergeRouteHistory([local],[other])[0].trailPath.type,'MultiLineString');
 const geo={historyTrailStartpoint};geo.normalizeCoordinate=evaluate('normalizeCoordinate',{});geo.normalizeLineCoordinates=evaluate('normalizeLineCoordinates',geo);geo.routeLineFeature=evaluate('routeLineFeature',geo);geo.Mapbox={Camera:'Camera'};geo.MAP_CENTER=[123,13];geo.React={createElement:(type,props)=>({type,props})};
 const camera=evaluate('HistoryMapCamera',geo)({center:null,zoom:16,group:local});assert.ok(camera.props.bounds.ne[0]>123.19);assert.ok(camera.props.bounds.sw[0]<123.1);assert.ok(camera.props.bounds.sw[1]<13.5);
 let opened=false;
 context.setIsFinishRouteConfirmVisible=value=>opened=value;
 context.submitRoute=evaluate('submitRoute',context);
 ended=false;queued=false;await evaluate('endTrip',context)();assert.equal(ended,false);assert.equal(queued,false);assert.equal(opened,true);
 context.setIsFinishRouteConfirmVisible(false);assert.equal(ended,false);assert.equal(opened,false);
 const jsx=source.getFullText();assert.ok(jsx.includes('routePresence.enabled ? endTrip() : enableBackgroundGeofencing()'));
 assert.ok(!jsx.includes('ROUTE PRESENCE'));
 let failureMessage;
 context.setRouteActionMessage=value=>failureMessage=value;
 context.queueRouteCompletion=async()=>{throw Error('Device storage unavailable');};
 connected=false;cleared=false;
 await evaluate('confirmRouteCompletion',context)();assert.equal(cleared,false);assert.equal(failureMessage.kind,'error');
 console.log('PASS: End trip and cancel leave tracking active; failed offline persistence keeps the route available to retry.');
 console.log('PASS: offline finish stores both paths, offline history renders local points, empty/failed server responses preserve paths, partial sync deduplicates, separate trips stay separate, camera fits both paths.');
})().catch(e=>{console.error(e);process.exitCode=1;});
