import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
import { historyTrailLines } from '../src/components/routeTrailGeometry.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const longText=Array.from({length:30},(_,i)=>`Stop ${i+1} on a collection street`).join(' - ');
const route={name:'Area 11 Collection Route',barangay:['Abella'],routePath:{type:'MultiLineString',coordinates:[[[123.18,13.62],[123.19,13.63]],[[123.21,13.65],[123.22,13.66]]]}};
const points=[{clientSessionId:'a',longitude:123.3,latitude:13.7},{clientSessionId:'a',longitude:123.31,latitude:13.71},{clientSessionId:'b',longitude:123.4,latitude:13.8},{clientSessionId:'b',longitude:123.41,latitude:13.81}];
const detail={id:'history-one',eventDate:'2026-10-07',route,trailPoints:points,recordSummary:{streetSegment:longText,collectorName:'Driver',segmentStatus:'Not collected',geofenceEntry:'Not logged'},documentReference:{area:'Abella, Naga City'},logs:[]};
let empty=false;
const server=await createServer({root,server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_API_URL':JSON.stringify('/__history-api'),'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN':JSON.stringify('')},plugins:[{name:'history-fixture',resolveId(id){if(id==='/__history.js')return '\0history-fixture';},load(id){if(id==='\0history-fixture')return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Dashboard from '/src/pages/Dashboard.jsx';import '/src/index.css';sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Admin',role:'admin'}));createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`;},configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
 if(req.url.startsWith('/__history-api')){res.setHeader('Content-Type','application/json');
 if(req.url.includes('/route-history/history-one'))res.end(JSON.stringify({success:true,data:{...detail,trailPoints:empty?[]:points}}));
 else if(req.url.includes('/route-history'))res.end(JSON.stringify({success:true,data:{rows:[{id:'history-one',routeName:route.name,area:'Abella',date:'2026-10-07',collector:'Driver'}],count:1}}));
 else res.end(JSON.stringify({success:true,data:{users:[],routes:[],reports:[],loads:[],report:[],rows:[],trucks:[]}}));
 }else if(req.url==='/__history'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__history.js"></script></body></html>'));}else next();
});}}]});
let browser;const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 assert.deepEqual(historyTrailLines(detail).recorded.map(line=>line.length),[2,2]);
 assert.deepEqual(historyTrailLines({trail:{coveredSegments:[[[123,13],[124,14]]],expectedSegments:[[[125,15],[126,16]]]}}).recorded.map(line=>line.length),[2]);
 assert.equal(historyTrailLines({trailPoints:[{longitude:null,latitude:null}]}).recorded.length,0);
 await server.listen();browser=await openBrowser();const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async expression=>{for(let i=0;i<300;i++){if(await browser.evaluate(expression))return;await pause(100);}throw new Error(`Timeout ${expression}: ${errors}`);};
 const click=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__history?view=routes'});
 // Fixture HTML has a fixed entry URL; navigate to the route via the actual sidebar.
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__history'});
 await wait("!!document.querySelector('[aria-label=\"Route History\"]')");await click('[aria-label="Route History"]');
 await wait("!!document.querySelector('.route-history-table tbody button')");await click('.route-history-table tbody button');
 await wait("!!document.querySelector('[data-route-line=recorded]')");
 assert.equal(await browser.evaluate("document.querySelectorAll('[data-route-line=recorded]').length"),2);
 assert.equal(await browser.evaluate("document.querySelectorAll('[data-route-line=assigned]').length"),2);
 assert.ok(await browser.evaluate("document.querySelector('.modal-subtitle').textContent.length<180"),'compact report header');
 assert.equal(await browser.evaluate("document.querySelector('.rh-expandable button').getAttribute('aria-expanded')"),'false');
 await click('.rh-expandable button');await wait("document.querySelector('.rh-expandable button').textContent==='Hide'");
 assert.ok(await browser.evaluate(`document.querySelector('.rh-expandable').textContent.includes(${JSON.stringify(longText)})`));
 await click('.rh-expandable button');await wait("document.querySelector('.rh-expandable button').textContent==='Show all'");
 const before=await browser.evaluate("document.querySelector('[data-route-line=recorded]').getAttribute('points')");
 await browser.evaluate("[...document.querySelectorAll('.rh-trail-controls button')].find(el=>el.textContent==='Focus recorded trail').click()");
 await pause(100);assert.notEqual(await browser.evaluate("document.querySelector('[data-route-line=recorded]').getAttribute('points')"),before);
 for(const width of [1280,390]){await browser.send('Emulation.setDeviceMetricsOverride',{width,height:720,deviceScaleFactor:1,mobile:false});await pause(200);assert.ok(await browser.evaluate("document.querySelector('.route-history-detail-modal').getBoundingClientRect().right<=innerWidth+1"));assert.ok(await browser.evaluate("document.querySelector('.route-history-detail-modal .modal-footer').getBoundingClientRect().bottom<=innerHeight+1"));}
 await click('[aria-label="Close route history details"]');await wait("!document.querySelector('.route-history-detail-modal')");empty=true;await click('.route-history-table tbody button');await wait("!!document.querySelector('.rh-trail-note')");
 assert.equal(await browser.evaluate("document.querySelectorAll('[data-route-line=recorded]').length"),0);assert.ok(await browser.evaluate("document.querySelector('.rh-trail-note').textContent.includes('No uploaded GPS points')"));
 assert.deepEqual(errors,[]);console.log('PASS: actual admin report renders separate off-route trip lines and assigned geometry, focuses travel, expands/collapses text, handles unsynced trails, and fits desktop/mobile.');
}finally{if(browser)await browser.close();await server.close();}
