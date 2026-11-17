import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const qaRoot = process.env.RESIKLEAN_QA_TEMP || 'D:/RESIKLEAN-QA-TEMP';
await mkdir(qaRoot, {recursive:true});
const directory = await mkdtemp(path.join(qaRoot, 'skeleton-qa-'));
const outDir = path.join(directory, 'dist');
const entry = path.join(root, '__skeleton-fixture.jsx');
await build({root, logLevel:'warn', define:{'import.meta.env.VITE_API_URL':JSON.stringify('/__qa/api'), 'import.meta.env.VITE_SOCKET_URL':JSON.stringify(''), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN':JSON.stringify('')}, plugins:[{
 name:'skeleton-fixture', resolveId(id){if(id===entry)return entry;},
 load(id){if(id===entry)return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Dashboard from '/src/pages/Dashboard.jsx';import '/src/index.css';sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'QA Admin',role:'admin'}));createRoot(document.getElementById('root')).render(<BrowserRouter><Dashboard/></BrowserRouter>);`;},
}], build:{outDir, emptyOutDir:false, minify:false, cssCodeSplit:false, rollupOptions:{input:entry,output:{entryFileNames:'app.js',assetFileNames:'[name][extname]'}}}});
const assets=await readdir(outDir);
const css=assets.filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/${name}">`).join('');
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;
const id=i=>i.toString(16).padStart(24,'0');
const users=Array.from({length:12},(_,i)=>({_id:id(i+1),name:'Driver '+(i+1),role:'collector',email:'driver'+i+'@example.test',phone:'09123456789',barangay:'Abella'}));
const routes=users.map((user,i)=>({_id:id(i+30),name:'Area '+(i+1),barangay:['Abella'],collectorId:user,schedule:[1],isActive:true,stops:[]}));
const trucks=users.map((_,i)=>({_id:id(i+60),truckNumber:String(i+1),plateNumber:'QA-'+i,length:3,width:2,height:1,availability:'available',isActive:true}));
const reports=users.map((user,i)=>({_id:id(i+90),residentId:user,barangay:'Abella',description:'Missed collection '+i,status:'pending',wasteCategory:'recyclable',createdAt:'2026-11-16T00:00:00Z'}));
const loads=users.map((user,i)=>({_id:id(i+120),staffId:user,routeId:routes[i],length:3,width:2,height:1,slope:0.5,tonnesEstimate:1.9,arrivedAt:'2026-11-15T00:00:00Z',truckPlate:trucks[i].plateNumber}));
const history=routes.map((route,i)=>({id:id(i+150),area:route.name,street:'Street '+i,collector:users[i].name,date:'Nov 15, 2026',rowStatus:'collected',truck:{plateNumber:trucks[i].plateNumber}}));
let mode='hold';const held=[];const requests=[];
function release(next='data'){mode=next;for(const send of held.splice(0))send();}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__qa/api')){
  requests.push(url.pathname+url.search);
  const send=()=>{
   if(res.destroyed)return;
   res.setHeader('Content-Type','application/json');
   if(mode==='error'){res.statusCode=503;res.end(JSON.stringify({success:false,error:'QA service unavailable'}));return;}
   const empty=mode==='empty';let data={users:empty?[]:users,routes:empty?[]:routes,trucks:empty?[]:trucks,reports:empty?[]:reports,loads:empty?[]:loads,logs:[],report:[],count:empty?0:12,totalTonnesEstimate:22.8};
   if(url.pathname.endsWith('/route-history')){const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||7);data={rows:empty?[]:history.slice((page-1)*limit,page*limit),page,limit,count:empty?0:history.length,pages:2};}
   else if(/\/route-history\//.test(url.pathname))data={...history[0],recordSummary:{streetSegment:'Street 0',segmentStatus:'Collected'},documentReference:{},logs:[]};
   else if(url.pathname.endsWith('/tonnage-trend'))data={chartData:empty?[]:[{date:'2026-11-14',tonnage:2},{date:'2026-11-15',tonnage:3}],summary:{truckLoads:empty?0:12}};
   else if(url.pathname.endsWith('/messages'))data=[];
   else if(url.pathname.endsWith('/identity'))data={birthday:'1994-03-14',hasIdPhoto:false,assignedTruck:{plateNumber:'QA-1'}};
   res.end(JSON.stringify({success:true,data}));
  };
  if(mode==='hold')held.push(send);else send();return;
 }
 if(url.pathname==='/app.js'||url.pathname.endsWith('.css')){try{res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(path.join(outDir,path.basename(url.pathname))));}catch{res.statusCode=404;res.end();}return;}
 if(url.pathname.startsWith('/socket.io')){res.statusCode=404;res.end();return;}
 if(url.pathname.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"/>');return;}
 res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;const failures=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 browser=await openBrowser();browser.on('Runtime.exceptionThrown',event=>failures.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
 const wait=async expression=>{for(let n=0;n<200;n++){assert.deepEqual(failures,[]);if(await browser.evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);};
 const click=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const go=async page=>{await browser.send('Page.navigate',{url:base+'/dashboard?view='+page});await wait("!!document.querySelector('.admin-sidebar')");};
 const visible="document.querySelectorAll('tbody.skeleton-visible .skeleton-table-row').length";
 for(const width of [1280,1920]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:width===1280?720:1080,deviceScaleFactor:1,mobile:false});
  for(const page of ['accounts','routes','activity','manage-routes','assignments','trucks']){
   mode='hold';await go(page);await wait(visible+'>0');
   const geometry=await browser.evaluate(`(()=>{const rows=[...document.querySelectorAll('tbody .skeleton-table-row')];return {count:rows.length,height:rows[0].getBoundingClientRect().height,bottom:rows.at(-1).getBoundingClientRect().bottom,viewport:innerHeight,busy:document.querySelector('tbody').getAttribute('aria-busy'),focusable:rows.some(row=>row.querySelector('button,input,[tabindex]'))};})()`);
   assert.ok(geometry.count<=7,JSON.stringify(geometry));assert.equal(geometry.height,70);assert.ok(geometry.bottom<=geometry.viewport-70,JSON.stringify(geometry));assert.equal(geometry.busy,'true');assert.equal(geometry.focusable,false);
   assert.ok(await browser.evaluate("document.querySelector('.table-pagination button').disabled"));
   if(page==='accounts' && width===1280){const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,'accounts-loading.png'),Buffer.from(shot.data,'base64'));}
   release();await wait("document.querySelector('tbody')?.getAttribute('aria-busy')==='false' && !document.querySelector('tbody .skeleton-table-row')");
   assert.ok(await browser.evaluate("document.querySelectorAll('tbody tr').length>0"));
  }
 }
 console.log('PASS: six table skeletons and loaded states at 1280x720 and 1920x1080.');
 // Server pagination preserves the existing page while a new one loads.
 mode='data';await go('routes');await wait("document.querySelector('tbody')?.getAttribute('aria-busy')==='false'");mode='hold';await click('[aria-label="Next page"]');await wait("document.querySelector('tbody.skeleton-refreshing')!==null");assert.equal(await browser.evaluate(visible),0);assert.ok(await browser.evaluate("document.querySelector('tbody').textContent.includes('Street 0')"));release();await wait("document.querySelector('tbody').textContent.includes('Street 7')");
 // A server-side filter refresh retains its rows and does not show initial placeholders.
 mode='hold';await browser.evaluate("const input=document.querySelector('[aria-label=\"Search route history\"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Street');input.dispatchEvent(new Event('input',{bubbles:true}));");await wait("document.querySelector('tbody.skeleton-refreshing')!==null");assert.equal(await browser.evaluate(visible),0);release();await wait("document.querySelector('tbody')?.getAttribute('aria-busy')==='false'");
 // Route details open immediately and keep a real title while the record is pending.
 mode='hold';await click('tbody .actions-col button');await wait("!!document.querySelector('.route-history-modal-body .skeleton-visible')");assert.ok(await browser.evaluate("document.querySelector('.route-history-detail-modal').textContent.includes('Route History Report')"));release('error');await wait("!!document.querySelector('.route-history-modal-body .skeleton-error')");mode='data';await click('.route-history-modal-body .skeleton-error button');await wait("!!document.querySelector('.route-history-modal-body .detail-table-web')");assert.ok(requests.at(-1).includes('/route-history/') && !requests.at(-1).includes('undefined'));await click('[aria-label="Close route history details"]');
 // In-memory dashboard data survives page navigation and browser history.
 await click('[data-page-link][aria-label="Manage Accounts"]');await wait("!!document.querySelector('.accounts-table-card')");assert.equal(await browser.evaluate(visible),0);await click('[data-page-link][aria-label="Staff Activity"]');await browser.evaluate('history.back()');await wait("!!document.querySelector('.accounts-table-card')");assert.equal(await browser.evaluate(visible),0);
 console.log('PASS: old rows remain during pagination; cached dashboard navigation/back does not flash.');
 // Complaint queue keeps its toolbar and disabled composer while loading.
 mode='hold';await go('complaints');await wait("!!document.querySelector('.skeleton-complaint-item') && !!document.querySelector('.skeleton-visible')");assert.equal(await browser.evaluate("document.querySelectorAll('.skeleton-complaint-item').length"),8);assert.ok(await browser.evaluate("document.querySelector('.cq-composer textarea').disabled && document.querySelector('.cq-send').disabled"));
 const queueShot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,'complaints-loading.png'),Buffer.from(queueShot.data,'base64'));
 release('empty');await wait("document.querySelector('.cq-list-scroll').textContent.includes('No complaints') && !document.querySelector('.dashboard-skeleton')");
 // Chart retains all static heading actions and date label.
 mode='hold';await go('overview');await wait("!!document.querySelector('.skeleton-visible .skeleton-chart')");assert.equal(await browser.evaluate("document.querySelectorAll('.skeleton-chart-column').length"),7);assert.ok(await browser.evaluate("document.querySelector('.tonnage-heading-actions').textContent.includes('Export') && document.querySelector('.tonnage-heading-actions').textContent.includes('Select dates')"));
 const chartShot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(directory,'chart-loading.png'),Buffer.from(chartShot.data,'base64'));
 await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.dashboard-skeleton')).animationName"),'none');await browser.send('Emulation.setEmulatedMedia',{features:[]});
 release('empty');await wait("document.querySelector('.tonnage-trend-card').textContent.includes('No truckloads in this date range.') && !document.querySelector('.skeleton-chart')");
 console.log('PASS: complaint queue, chart, empty results and reduced motion.');
 mode='hold';await go('accounts');await wait(visible+'>0');release('error');await wait("!!document.querySelector('tbody .skeleton-error')");assert.equal(await browser.evaluate(visible),0);mode='data';await click('tbody .skeleton-error button');await wait("document.querySelector('tbody').textContent.includes('Driver 1') && !document.querySelector('tbody .skeleton-error')");
 mode='hold';await go('accounts');await wait(visible+'>0');await wait("document.querySelector('tbody .skeleton-error')?.textContent.includes('too long')");assert.equal(await browser.evaluate(visible),0);release('data');await wait("!document.querySelector('tbody .skeleton-error') && document.querySelector('tbody').textContent.includes('Driver 1')");
 console.log('PASS: failure/Retry, timeout, and late successful response.');
 mode='empty';await go('accounts');await wait("document.querySelector('tbody').textContent.includes('No accounts match') && document.querySelector('tbody').getAttribute('aria-busy')==='false'");assert.equal(await browser.evaluate(visible),0);mode='data';await go('accounts');await wait("document.querySelector('tbody').textContent.includes('Driver 1')");
 // Fetched account details open immediately, with known identity fields retained.
 mode='hold';await click('.account-profile-trigger');await wait("!!document.querySelector('.account-profile-dialog .dashboard-skeleton')");assert.ok(await browser.evaluate("document.querySelector('.account-profile-dialog').textContent.includes('Driver 1')"));release();await wait("document.querySelector('.account-profile-dialog').textContent.includes('March 14, 1994') && !document.querySelector('.account-profile-dialog .dashboard-skeleton')");
 assert.deepEqual(failures,[]);console.log('PASS: account details skeleton and runtime checks. Artifacts: '+directory);
 await writeFile(path.join(directory,'result.json'),JSON.stringify({passed:true,requests:requests.length,widths:[1280,1920]},null,2));
} finally {release('empty');if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
