import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const loads = [
 { _id:'normal', routeId:{name:'Area 6'}, staffId:{name:'Peter Parker'}, truckNumber:'TR-101', truckPlate:'SEA-2342', length:3.8,width:2.2,height:1.2,slope:1,tonnesEstimate:3.24,arrivedAt:'2026-11-11T04:37:00Z',sidePhotoUrl:'/swmo-resiklean-logo.svg',backPhotoUrl:'/swmo-resiklean-logo.svg',notes:'Dakul udo' },
 { _id:'large', routeId:{name:'Area 7'}, staffId:{name:'Peter Parker'}, truckNumber:'TR-101', truckPlate:'SEA-2342',length:20000,width:18000,height:2,slope:1,tonnesEstimate:216000000.3,arrivedAt:'2026-11-10T04:37:00Z',sidePhotoUrl:'/missing-qa-photo.jpg' },
 { _id:'small', routeId:{name:'Area 8'}, staffId:{name:'Peter Parker'},truckNumber:'TR-101', truckPlate:'SEA-2342',length:0.0001,width:0.002,height:0.03,slope:0,tonnesEstimate:0.0000000018,arrivedAt:'2026-11-09T04:37:00Z' },
 { _id:'missing', routeId:{name:'Area 9'}, staffId:{name:'Long staff name '.repeat(8)},truckNumber:'TR-101', truckPlate:'SEA-2342',length:3.8,width:2.2,height:1.2,slope:0,tonnesEstimate:3.01,notes:'Long notes '.repeat(300) },
];
const server=await createServer({root,server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_API_URL':JSON.stringify('/__load-api'),'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN':JSON.stringify('')},plugins:[{
 name:'truckload-fixture',resolveId(id){if(id==='/__load.js')return '\0load-fixture';},
 load(id){if(id==='\0load-fixture')return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Dashboard from '/src/pages/Dashboard.jsx';import {PreferencesProvider} from '/src/components/preferences.jsx';import {I18nProvider} from '@heroui/react';import '/src/index.css';window.history.replaceState(null,'','?view=activity');sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Admin',role:'admin'}));createRoot(document.getElementById('root')).render(React.createElement(PreferencesProvider,null,React.createElement(I18nProvider,{locale:'en-US'},React.createElement(BrowserRouter,null,React.createElement(Dashboard)))));`;},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url.startsWith('/__load-api')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data:{loads,users:[],routes:[],reports:[],rows:[],report:[],trucks:[]}}));}
  else if(req.url==='/__load'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__load.js"></script></body></html>'));}
  else if(req.url==='/missing-qa-photo.jpg'){res.statusCode=404;res.end();} else next();
 });}
}]});
let browser;const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 await server.listen();browser=await openBrowser();const errors=[];
 browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async expression=>{for(let n=0;n<600;n++){if(await browser.evaluate(expression))return;await pause(100);}throw new Error(`Timeout ${expression}: ${errors}`);};
 const click=s=>browser.evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);
 const key=async(name,code,shift=false)=>{await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,windowsVirtualKeyCode:code,modifiers:shift?8:0});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,windowsVirtualKeyCode:code});};
 const open=async area=>{await browser.evaluate(`document.querySelector('[aria-label="View truckload from Area ${area}"]').focus()`);await click(`[aria-label="View truckload from Area ${area}"]`);await wait("!!document.querySelector('.tls-dialog')");await pause(250);};
 const close=async area=>{await key('Escape',27);await wait("!document.querySelector('.tls-dialog')");await pause(100);assert.equal(await browser.evaluate("document.activeElement.getAttribute('aria-label')"),`View truckload from Area ${area}`,'Return focus to View details button');};
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__load'});
 await wait("!!document.querySelector('[data-page-link]')");await click('[data-page-link][aria-label="Waste Generation"]');
 await wait("document.querySelectorAll('.activity-row').length===4");
 assert.equal(await browser.evaluate("document.querySelector('.activity-row td strong').textContent"),'TR-101');
 const tableBefore=await browser.evaluate("document.querySelector('.staff-activity-card table').innerText");
 assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.staff-activity-card th')].map(el=>el.textContent)"),['Truck number','Date submitted','Area','Slope','Tonnage','Actions']);

 await click('.activity-row td');await pause(200);
 assert.equal(await browser.evaluate("!!document.querySelector('.tls-dialog')"),false,'Clicking row does not open details');
 assert.ok(await browser.evaluate("[...document.querySelectorAll('.activity-row')].every(el=>el.tabIndex===-1)"),'Only buttons are focusable');
 await browser.evaluate("document.querySelector('.activity-actions button').focus()");await key('Enter',13);await wait("!!document.querySelector('.tls-dialog')");await close(6);

 for(const [width,height] of [[1280,720],[1920,1080],[800,720],[360,740]]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(250);
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'Table stays inside page');
  if(width>=1280)assert.ok(await browser.evaluate("document.querySelector('.staff-activity-card .table-scroll').scrollWidth<=document.querySelector('.staff-activity-card .table-scroll').clientWidth+1"),'All six columns fit desktop');
  await open(6);
  assert.equal(await browser.evaluate("document.querySelector('.tls-details > div:nth-child(3) dt').textContent"),'Truck number');
  assert.equal(await browser.evaluate("document.querySelector('.tls-details > div:nth-child(3) dd').textContent"),'TR-101');
  assert.equal(await browser.evaluate("document.activeElement.getAttribute('aria-label')"),'Close truckload details');
  assert.equal(await browser.evaluate("document.querySelector('.tls-dialog').getAttribute('aria-modal')"),'true');
  assert.equal(await browser.evaluate("document.querySelector('.tls-dialog').getAttribute('aria-labelledby')"),'truckload-submission-title');
  const layout=await browser.evaluate(`(()=>{const d=document.querySelector('.tls-dialog'),b=document.querySelector('.tls-body'),h=document.querySelector('.tls-header'),f=document.querySelector('.tls-footer'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,bodyScroll:b.scrollHeight-b.clientHeight,overflow:d.scrollWidth-d.clientWidth,header:h.getBoundingClientRect().top,footer:f.getBoundingClientRect().bottom,photos:document.querySelector('.tls-evidence').getBoundingClientRect().top,summary:document.querySelector('.tls-summary').getBoundingClientRect().top};})()`);
  assert.ok(layout.left>=0&&layout.right<=width+1&&layout.top>=0&&layout.bottom<=height+1,JSON.stringify(layout));
  assert.ok(layout.overflow<=1,'No horizontal overflow');
  if(width>=900){assert.equal(layout.width,960);assert.ok(layout.bodyScroll<=1,'Desktop body fits without scrolling: '+JSON.stringify(layout));assert.equal(layout.photos,layout.summary);}
  else {assert.ok(layout.summary>layout.photos);assert.ok(layout.bodyScroll>0);}
  assert.ok(await browser.evaluate("[document.documentElement,document.body].some(el=>getComputedStyle(el).overflow==='hidden')"),'Page scroll locked');
  assert.equal(await browser.evaluate("document.querySelector('.tls-details > div:last-child dd').textContent"),'Nov 11, 2026 \u00b7 12:37 PM');
  assert.equal(await browser.evaluate("document.querySelector('.tls-volume dd').textContent"),'10.03 m\u00b3');
  assert.equal(await browser.evaluate("document.querySelector('.tls-measurements > div:last-child dd').textContent"),'+1.0 m\u00b3');
  assert.equal(await browser.evaluate("document.querySelector('.tls-tonnage-value strong').textContent"),'3.2');
  assert.equal(await browser.evaluate("document.querySelector('.tls-notes p').textContent"),'Dakul udo');
  await key('Tab',9,true);assert.ok(await browser.evaluate("!!document.activeElement.closest('.tls-dialog')"),'Shift+Tab trapped');
  for(let n=0;n<6;n++){await key('Tab',9);assert.ok(await browser.evaluate("!!document.activeElement.closest('.tls-dialog')"),'Tab trapped');}
  if(width>=900){const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(browser.directory,`truckload-${width}.png`),Buffer.from(shot.data,'base64'));}
  await click('[aria-label="View front photo"]');await wait("!!document.querySelector('.tls-viewer')");await pause(200);
  await click('[aria-label="Zoom in"]');assert.equal(await browser.evaluate("document.querySelector('.tls-viewer [role=status]').textContent"),'200%');
  assert.ok(await browser.evaluate("document.querySelector('.tls-viewer-stage').scrollWidth>document.querySelector('.tls-viewer-stage').clientWidth"));
  await key('Escape',27);await wait("!document.querySelector('.tls-viewer')");await pause(300);assert.ok(await browser.evaluate("!!document.querySelector('.tls-dialog')"));
  await close(6);
 }
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await open(7);await wait("document.querySelectorAll('.tls-photo-placeholder').length===2");
 assert.equal(await browser.evaluate("!!document.querySelector('.tls-notes')"),false);
 assert.equal(await browser.evaluate("document.querySelector('.tls-volume dd').textContent"),'720,000,000.00 m\u00b3');
 assert.ok(await browser.evaluate("document.querySelector('.tls-measurements').textContent.includes('20,000 m')"));
 assert.ok(await browser.evaluate("document.querySelector('.tls-body').scrollHeight<=document.querySelector('.tls-body').clientHeight+1"),'Large values fit at 720px');
 await close(7);
 await open(8);assert.ok(await browser.evaluate("document.querySelector('.tls-measurements').textContent.includes('0.0001 m')"),'Small raw measurements are not rounded to zero');await close(8);
 await open(9);assert.equal(await browser.evaluate("document.querySelector('.tls-details > div:last-child dd').textContent"),'Not recorded');
 const fixed=await browser.evaluate("[document.querySelector('.tls-header'),document.querySelector('.tls-footer')].map(el=>el.getBoundingClientRect().top)");
 await browser.evaluate("document.querySelector('.tls-body').scrollTop=10000");
 assert.deepEqual(await browser.evaluate("[document.querySelector('.tls-header'),document.querySelector('.tls-footer')].map(el=>el.getBoundingClientRect().top)"),fixed,'Header/footer fixed during long-body scrolling');
 await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:4,y:4,button:'left',clickCount:1});await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:4,y:4,button:'left',clickCount:1});await wait("!document.querySelector('.tls-dialog')");
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:480,deviceScaleFactor:1,mobile:false});await open(6);
 assert.ok(await browser.evaluate("document.querySelector('.tls-body').scrollHeight>document.querySelector('.tls-body').clientHeight"),'Short viewports scroll only dialog body');await close(6);
 await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await open(6);
 assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.tls-container')).animationName"),'none');await click('.tls-close');await wait("!document.querySelector('.tls-dialog')");
 assert.equal(await browser.evaluate("document.querySelector('.staff-activity-card table').innerText"),tableBefore,'Table data unchanged');
 // Exercise pagination with multiple pages, then filter from the final page.
 loads.push(...Array.from({length:20},(_,i)=>({...loads[0],_id:`page-${i}`,staffId:{name:`Pagination staff ${i}`},routeId:{name:`Area ${i+10}`},arrivedAt:'2026-11-01T04:37:00Z'})));
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await browser.evaluate("[...document.querySelectorAll('button')].find(el=>el.textContent==='Refresh data').click()");
 await wait("document.querySelector('.table-page-count')?.textContent==='1\u20137 of 24'");
 assert.equal(await browser.evaluate("document.querySelectorAll('.activity-row').length"),7);
 const firstPage=await browser.evaluate("document.querySelector('.staff-activity-card tbody').innerText");
 await click('[aria-label="Next page"]');await wait("document.querySelector('.table-page-input').value==='2'");
 assert.notEqual(await browser.evaluate("document.querySelector('.staff-activity-card tbody').innerText"),firstPage);
 await click('[aria-label="Last page"]');await wait("document.querySelector('.table-page-input').value==='4'");
 assert.equal(await browser.evaluate("document.querySelectorAll('.activity-row').length"),3);
 assert.ok(await browser.evaluate("document.querySelector('[aria-label=\"Next page\"]').disabled"));
 const fill=async(selector,value)=>browser.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await browser.evaluate("document.querySelector('.table-page-input').focus()");await fill('.table-page-input','2');await key('Enter',13);await wait("document.querySelector('.table-page-input').value==='2'");
 await click('.table-page-size .select__trigger');await wait("!!document.querySelector('[role=option]')");
 await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent==='10').click()");
 await wait("document.querySelectorAll('.activity-row').length===10 && document.querySelector('.table-page-input').value==='1'");
 await click('[aria-label="Last page"]');await fill('[aria-label="Search waste generation"]','Peter Parker');
 await wait("document.querySelectorAll('.activity-row').length===3 && document.querySelector('.table-page-input').value==='1'");
 await fill('[aria-label="Search waste generation"]','no matching submission');await wait("document.querySelector('.table-page-count').textContent==='0 results'");
 assert.ok(await browser.evaluate("[...document.querySelectorAll('.table-page-controls button')].every(el=>el.disabled)"));
 await click('[aria-label="Clear waste generation filters"]');await wait("document.querySelectorAll('.activity-row').length===10");
 for(const width of [1280,390]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(250);
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'Pagination does not overflow page');
  const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(browser.directory,`pagination-${width}.png`),Buffer.from(shot.data,'base64'));
 }
 console.log('PASS: pagination next/last/page input, page size, filter reset, empty results and mobile layout');
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile/short viewport layouts, raw volume, timestamp, notes, missing/failed photos, large/small measurements, zoom, focus trap/return, Escape/backdrop/Close, scroll locking and reduced motion. Screenshots: '+browser.directory);
}finally{if(browser)await browser.close();await server.close();}
