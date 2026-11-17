import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const users=Array.from({length:23},(_,i)=>({_id:`user-${i}`,name:`Collector ${String(i+1).padStart(2,'0')}`,role:'collector',email:`driver${i}@example.test`,phone:'09123456789'}));
const routes=users.map((user,i)=>({_id:`route-${i}`,name:`Area ${String(i+1).padStart(2,'0')}`,barangay:['Abella'],collectorId:user,stops:[],schedule:[1],isActive:true}));
const trucks=users.map((_,i)=>({_id:`truck-${i}`,truckNumber:String(i+1).padStart(2,'0'),plateNumber:`QA-${i}`,length:3,width:2,height:1,availability:i%2?'unavailable':'available',isActive:true}));
const history=users.map((user,i)=>({id:`history-${i}`,area:routes[i].name,collector:user.name,routeName:routes[i].name,street:`Street ${i}`,date:'2026-11-15',truck:{plateNumber:`QA-${i}`},rowStatus:i%2?'partial':'collected'}));
const requests=[];
const root=fileURLToPath(new URL('../',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_API_URL':JSON.stringify('/__pagination-api'),'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN':JSON.stringify('')},plugins:[{
 name:'pagination-fixture',resolveId(id){if(id==='/__pagination.js')return '\0pagination-fixture';},
 load(id){if(id==='\0pagination-fixture')return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Dashboard from '/src/pages/Dashboard.jsx';import '/src/index.css';sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'QA Admin',role:'admin'}));createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`;},
 configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
  if(req.url.startsWith('/__pagination-api')) {
   const url=new URL(req.url,'http://localhost');let data={users,routes,trucks,logs:[],loads:[],reports:[]};
   if(url.pathname.endsWith('/route-history')) {
    requests.push(Object.fromEntries(url.searchParams));
    const q=(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status');
    const rows=history.filter(row=>(!q||[row.area,row.collector,row.street].some(v=>v.toLowerCase().includes(q)))&&(!status||row.rowStatus===status));
    const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||7);
    data={rows:rows.slice((page-1)*limit,page*limit),page,limit,count:rows.length,pages:Math.ceil(rows.length/limit)};
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data}));
  } else if(req.url==='/__pagination'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__pagination.js"></script></body></html>'));} else next();
 });}
}]});
let browser;
try {
 await server.listen();browser=await openBrowser();const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async expr=>{for(let n=0;n<600;n++){assert.deepEqual(errors,[]);if(await browser.evaluate(expr))return;await pause(100);}throw new Error('Timeout: '+expr);};
 const click=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const fill=(selector,value)=>browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__pagination'});await wait("!!document.querySelector('[data-page-link]')");
 for(const [label,table,search,match] of [
  ['Route History','.route-history-table','Search route history','Collector 23'],
  ['Manage Routes','.route-management-table','Search routes','Area 23'],
  ['Driver Assignments','.route-assignment-table','Search drivers','Collector 23'],
  ['Manage Accounts','.accounts-table-card table','Search accounts','Collector 23'],
  ['Manage Trucks','.truck-table','Search trucks','23'],
 ]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await click(`[data-page-link][aria-label="${label}"]`);
  const count=`document.querySelectorAll('${table} tbody tr:not(:has(td[colspan]))').length`;
  await wait(`${count}===7 && document.querySelector('.table-page-count')?.textContent.endsWith('of 23') && !document.querySelector('[aria-label="Next page"]').disabled`);
  const first=await browser.evaluate(`document.querySelector('${table} tbody').innerText`);
  await click('[aria-label="Next page"]');await wait(`document.querySelector('.table-page-input').value==='2' && !document.querySelector('[aria-label="Next page"]').disabled`);
  assert.notEqual(await browser.evaluate(`document.querySelector('${table} tbody').innerText`),first);
  await click('[aria-label="Last page"]');await wait(`${count}===2 && document.querySelector('.table-page-input').value==='4'`);
  await fill(`[aria-label="${search}"]`,match);await wait(`${count}===1 && document.querySelector('.table-page-input').value==='1' && document.querySelector('.table-page-count').textContent.endsWith('of 1')`);
  await fill(`[aria-label="${search}"]`,'missing-result');await wait(`document.querySelector('.table-page-count').textContent==='0 results'`);
  assert.ok(await browser.evaluate("[...document.querySelectorAll('.table-page-controls button')].every(el=>el.disabled)"));
  await fill(`[aria-label="${search}"]`,'');await wait(`${count}===7 && document.querySelector('.table-page-input').value==='1'`);
  await click('.table-page-size .select__trigger');await wait("!!document.querySelector('[role=option]')");await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent==='10').click()");await wait(`${count}===10 && document.querySelector('.table-page-input').value==='1'`);
  await click('[aria-label="Last page"]');await wait(`${count}===3`);
  await click('[aria-label="First page"]');await wait(`${count}===10 && document.querySelector('.table-page-input').value==='1'`);
  for(const width of [1920,1280,390]) {
   await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(300);
   assert.ok(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),label+' page has no horizontal overflow');
   assert.ok(await browser.evaluate(`(()=>{const wrap=document.querySelector('${table}').parentElement;return wrap.scrollHeight<=wrap.clientHeight+1})()`),label+' table has no inner vertical scrolling');
   if(width>=1280)assert.ok(await browser.evaluate(`(()=>{const wrap=document.querySelector('${table}').parentElement;return wrap.scrollWidth<=wrap.clientWidth+1})()`),label+' fits desktop without horizontal scrollbar');
   const footer=await browser.evaluate(`(()=>{const f=document.querySelector('.table-pagination').getBoundingClientRect(),t=document.querySelector('${table}').getBoundingClientRect();return {top:f.top,bottom:t.bottom,left:f.left,right:f.right}})()`);
   assert.ok(footer.top>=footer.bottom-1&&footer.left>=0&&footer.right<=width+1,JSON.stringify({label,width,footer}));
   if(width===1280){await browser.evaluate("document.querySelector('.table-pagination').scrollIntoView({block:'end'})");const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(browser.directory,label.replaceAll(' ','-')+'.png'),Buffer.from(shot.data,'base64'));}
  }
  console.log('PASS '+label+': page navigation, filters, empty results, row count, footer, responsive layout');
 }
 assert.ok(requests.some(r=>r.page==='4'&&r.limit==='7'));
 assert.ok(requests.some(r=>r.q==='Collector 23'&&r.page==='1'));
 assert.ok(requests.some(r=>r.limit==='10'));
 console.log('PASS: route-history server requests; no runtime errors. Screenshots: '+browser.directory);
} finally {if(browser)await browser.close();await server.close();}
