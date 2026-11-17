import { createRequire } from 'node:module';
import console from 'node:console';
const require = createRequire(import.meta.url);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../mobile/node_modules/typescript');
let now = 0, timers = new Map(), nextTimer = 0, current;
const depsEqual = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
const ReactMock = {
 useRef(initial) { const i=current.cursor++; return current.slots[i] ||= {current:initial}; },
 useState(initial) { const owner=current,i=owner.cursor++; if (!(i in owner.slots)) owner.slots[i]=typeof initial==='function'?initial():initial; return [owner.slots[i],value=>{owner.slots[i]=typeof value==='function'?value(owner.slots[i]):value;}]; },
 useEffect(fn,deps) { const i=current.cursor++; const previous=current.slots[i]; if(!previous || !depsEqual(previous.deps,deps)) {previous?.cleanup?.();const slot={deps};current.slots[i]=slot;current.effects.push(()=>{slot.cleanup=fn();});} },
};
const moduleExports={};
const source=fs.readFileSync('src/components/Skeleton.jsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports','setTimeout','clearTimeout','Date',code)(name=>name==='react'?ReactMock:name==='./Skeleton.css'?{}:name==='@heroui/react'?{}:require(name),moduleExports,(fn,delay)=>{const id=++nextTimer;timers.set(id,{time:now+delay,fn});return id;},id=>timers.delete(id),{now:()=>now});
function instance(props) {
 const owner={slots:[],cursor:0,effects:[],props};
 owner.render=changes=>{Object.assign(owner.props,changes);owner.cursor=0;owner.effects=[];current=owner;owner.value=moduleExports.useLoadingPresentation(owner.props);for(const effect of owner.effects) effect();return owner.value;};
 owner.render();return owner;
}
function advance(ms,owner) {const end=now+ms;while(true){const due=[...timers].filter(([,timer])=>timer.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!due)break;now=due[1].time;timers.delete(due[0]);due[1].fn();owner.render();}now=end;return owner.render();}
const fresh=props=>{timers.clear();now=0;return instance(props);};
let view=fresh({loading:true,hasData:false});assert.equal(view.value.initial,true);assert.equal(view.value.visible,false);
advance(149,view);assert.equal(view.value.visible,false);advance(1,view);assert.equal(view.value.visible,true);
advance(50,view);view.render({loading:false,hasData:true});assert.equal(view.value.visible,true);
advance(349,view);assert.equal(view.value.visible,true);advance(1,view);assert.equal(view.value.initial,false);
view=fresh({loading:true,hasData:false});advance(100,view);view.render({loading:false,hasData:true});advance(100,view);assert.equal(view.value.visible,false,'Fast requests never flash');
view=fresh({loading:true,hasData:true});advance(1000,view);assert.equal(view.value.initial,false);assert.equal(view.value.refreshing,true);
view=fresh({loading:true,hasData:false});advance(200,view);view.render({loading:false,hasData:false});advance(400,view);assert.equal(view.value.initial,false,'Empty result replaces skeleton');view.render({loading:true});assert.equal(view.value.initial,false,'Refreshing an empty result never flashes skeleton');
view=fresh({loading:true,hasData:false});advance(200,view);view.render({error:'Offline'});view.render();assert.equal(view.value.failure,'Offline');assert.equal(view.value.initial,false);
view=fresh({loading:true,hasData:false});advance(10000,view);assert.match(view.value.failure,/too long/);assert.equal(view.value.initial,false);assert.equal(view.value.busy,false);view.value.retry();view.render();advance(200,view);assert.equal(view.value.visible,true);assert.equal(view.value.failure,'');
view=fresh({loading:true,hasData:false,enabled:false});advance(11000,view);assert.equal(view.value.busy,false);assert.equal(view.value.failure,'');
console.log('PASS: 150ms delay, 400ms minimum, fast-load suppression, cached/empty refreshes, error interruption, 10s timeout, retry, disabled dialogs.');
