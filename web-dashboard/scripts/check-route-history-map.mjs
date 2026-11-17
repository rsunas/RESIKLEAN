import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './browser-check.mjs';
import { historyTrailLines, trailBounds, trailFeatureCollection } from '../src/components/routeTrailGeometry.js';
const points=[
 {clientSessionId:'a',longitude:123.2,latitude:13.62,recordedAt:'2026-11-16T00:02:00Z'},
 {clientSessionId:'a',longitude:123.19,latitude:13.61,recordedAt:'2026-11-16T00:01:00Z'},
 {clientSessionId:'b',longitude:123.25,latitude:13.65,recordedAt:'2026-11-16T01:01:00Z'},
];
const data={trailPoints:points,trail:{coveredSegments:[[[120,10],[121,11]]]},route:{routePath:{type:'LineString',coordinates:[[123.1,13.5],[123.3,13.8]]}}};
const lines=historyTrailLines(data);
assert.deepEqual(lines.recorded,[[[123.19,13.61],[123.2,13.62]],[[123.25,13.65]]]);
assert.deepEqual(trailBounds(lines.recorded,lines.expected,true),[[123.19,13.61],[123.25,13.65]]);
assert.deepEqual(trailBounds(lines.recorded,lines.expected,false),[[123.1,13.5],[123.3,13.8]]);
assert.deepEqual(historyTrailLines({...data,trailPoints:[]}).recorded,[]);
assert.deepEqual(historyTrailLines({trail:data.trail}).recorded,[[[120,10],[121,11]]]);
assert.deepEqual(historyTrailLines({trailPoints:[points[0],{...points[0],longitude:null},points[1]]}).recorded.map(line=>line.length),[2]);
assert.equal(trailFeatureCollection(lines.recorded).features[1].geometry.type,'Point');
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(path.join(await mkdir('D:/RESIKLEAN-QA-TEMP',{recursive:true}).then(()=> 'D:/RESIKLEAN-QA-TEMP'),'route-map-'));
const entry=path.join(root,'__trail-qa.jsx');
// Mapbox boundary stub: verifies GPS data, layers, camera commands and cleanup without a token/network.
const mapStub=`window.qaMaps=[];class Map{constructor(options){this.options=options;this.sources={};this.layers=[];this.handlers={};window.qaMaps.push(this);setTimeout(()=>this.handlers.load?.(),50);}on(event,fn){this.handlers[event]=fn;}addControl(){}addSource(id,source){this.sources[id]=source;}addLayer(layer){this.layers.push(layer);}fitBounds(bounds,options){this.bounds=bounds;this.fitOptions=options;}resize(){}remove(){this.removed=true;}}class Marker{setLngLat(point){this.point=point;return this;}addTo(){return this;}remove(){}}export default {Map,Marker,NavigationControl:class{},ScaleControl:class{}};`;
await build({root,logLevel:'error',define:{'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN':JSON.stringify('fixture')},plugins:[{name:'route-map-fixture',enforce:'pre',resolveId(id){if(id===entry)return id;if(id==='mapbox-gl')return '\0map-stub';},load(id){if(id==='\0map-stub')return mapStub;if(id===entry)return `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import RouteHistoryTrail from '/src/components/RouteHistoryTrail.jsx';import '/src/index.css';function App(){const [data,setData]=useState(${JSON.stringify(data)});window.replaceTrail=setData;return <RouteHistoryTrail data={data}/>;}createRoot(document.getElementById('root')).render(<App/>);`;}}],build:{outDir:dir,emptyOutDir:false,minify:false,cssCodeSplit:false,rollupOptions:{input:entry,output:{entryFileNames:'app.js',assetFileNames:'[name][extname]'}}}});
const server=createServer(async(req,res)=>{if(req.url.endsWith('.js')||req.url.endsWith('.css')){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(path.join(dir,path.basename(req.url))));}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/app.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{browser=await openBrowser();const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async expression=>{for(let n=0;n<100;n++){assert.deepEqual(errors,[]);if(await browser.evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,60));}throw Error('Timeout: '+expression+' '+JSON.stringify(await browser.evaluate("({state:document.querySelector('[data-map-state]')?.dataset.mapState,maps:window.qaMaps?.length})")));};
 await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await wait("document.querySelector('[data-map-state]')?.dataset.mapState==='ready'");
 assert.deepEqual(await browser.evaluate('window.qaMaps.at(-1).bounds'),[[123.1,13.5],[123.3,13.8]]);
 assert.deepEqual(await browser.evaluate("window.qaMaps.at(-1).sources['history-recorded'].data"),trailFeatureCollection(lines.recorded));
 await browser.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent==='Focus recorded trail').click()");await wait('window.qaMaps.at(-1).bounds[0][0]===123.19');
 const next={...data,trailPoints:[{...points[0],longitude:124,latitude:14},{...points[1],longitude:124.2,latitude:14.1}]};await browser.evaluate(`window.replaceTrail(${JSON.stringify(next)})`);await wait('window.qaMaps.length===2 && window.qaMaps.at(-1).bounds?.[0][0]===124');assert.equal(await browser.evaluate('window.qaMaps[0].removed'),true);
 await browser.evaluate("window.qaMaps.at(-1).handlers.error()");await wait("!!document.querySelector('[data-route-line=recorded]')");assert.ok(await browser.evaluate("document.body.textContent.includes('Street map unavailable')"));
 await browser.evaluate(`window.replaceTrail(${JSON.stringify({...data,trailPoints:[]})})`);await wait("document.body.textContent.includes('No uploaded GPS points')");assert.equal(await browser.evaluate("document.querySelectorAll('[data-route-line=recorded]').length"),0);
 assert.deepEqual(errors,[]);console.log('PASS: raw uploads override derived report geometry; sorted separate sessions; full/focused camera bounds; different records update/reset map; empty uploads do not borrow geometry; map error fallback.');
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
