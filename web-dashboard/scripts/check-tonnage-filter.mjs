import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
import { tonnagePreset, tonnageRangeError } from '../src/components/tonnageDates.js';
import { parseDate, today } from '@internationalized/date';
const root = fileURLToPath(new URL('../', import.meta.url));
let requests = [], fail = false, empty = false;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__trend-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'trend-fixture',
 resolveId(id) { if (id === '/__trend.js') return '\0trend-fixture'; },
 load(id) { if (id === '\0trend-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import Dashboard from '/src/pages/Dashboard.jsx'; import '/src/index.css'; sessionStorage.setItem('resiklean_admin_token','fixture'); sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Admin',role:'admin'})); createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`; },
 configureServer(vite) { vite.middlewares.use(async (req,res,next) => {
  if(req.url.startsWith('/__trend-api')) {
   res.setHeader('Content-Type','application/json');
   if(req.url.includes('/reports/tonnage-trend')) {
    assert.equal(req.headers.authorization,'Bearer fixture');
    const query = new URL(req.url,'http://fixture').searchParams;
    const start = query.get('start'), end = query.get('end'); requests.push({start,end});
    if(fail) { res.statusCode=503; res.end(JSON.stringify({success:false,error:'Test service unavailable'})); return; }
    const days = Math.round((new Date(end)-new Date(start))/86400000)+1;
    const chartData = Array.from({length:days},(_,index)=>({date:new Date(new Date(start).getTime()+index*86400000).toISOString().slice(0,10),tonnage:empty?0:index+1}));
    res.end(JSON.stringify({success:true,data:{chartData,summary:{truckLoads:empty?0:days}}}));
   } else res.end(JSON.stringify({success:true,data:{users:[],routes:[],reports:[],loads:[],report:[],rows:[],trucks:[]}}));
  } else if(req.url==='/__trend') {res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__trend.js"></script></body></html>'));} else next();
 }); }
}] });
let browser; const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 assert.ok(tonnageRangeError({start:parseDate('2024-02-02'),end:parseDate('2024-02-01')}));
 assert.ok(tonnageRangeError({start:parseDate('2024-01-01'),end:parseDate('2024-04-02')}));
 assert.equal(tonnageRangeError({start:parseDate('2024-01-01'),end:parseDate('2024-04-01')}),'');
 assert.ok(tonnageRangeError({start:parseDate('2999-01-01'),end:parseDate('2999-01-02')}));
 await server.listen(); browser=await openBrowser(); const errors=[];
 browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 await browser.send('Log.enable'); browser.on('Log.entryAdded',e=>{if(e.entry.level==='error') console.error(e.entry.text);});
 const wait=async expression=>{for(let i=0;i<600;i++){if(await browser.evaluate(expression))return;await pause(100);}throw new Error(`Timeout ${expression}: ${errors}; body=${await browser.evaluate("document.body.innerText.slice(0,1500)")}`);};
 const click=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const preset=async label=>{
  if(!await browser.evaluate("!!document.querySelector('.tonnage-date-presets')")) await click('[aria-label="Choose collection dates"]');
  await wait("!!document.querySelector('.tonnage-date-presets button')");
  await browser.evaluate(`[...document.querySelectorAll('.tonnage-date-presets button')].find(el=>el.textContent===${JSON.stringify(label)}).click()`);
  await wait("!document.querySelector('.tonnage-calendar-popover')");
 };
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__trend'});
 await wait("!!document.querySelector('.tonnage-trend-card .tonnage-chart')");
 const week=tonnagePreset(); assert.deepEqual(requests.at(-1),{start:week.start.toString(),end:week.end.toString()});
 await wait("document.querySelector('.tonnage-summary-card strong').textContent.includes('4 t')");
 await preset('Last 30 days'); await wait("document.querySelector('.tonnage-summary-card strong').textContent.includes('15.5 t')");
 const thirty=tonnagePreset('thirty'); assert.deepEqual(requests.at(-1),{start:thirty.start.toString(),end:thirty.end.toString()});
 await click('.chart-export-button'); await wait("document.querySelectorAll('.tonnage-export-content .app-date-picker').length===2");
 assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.tonnage-export-content .app-date-picker')].map(el=>['year','month','day'].map(part=>el.querySelector('[data-type='+part+']').textContent.padStart(part==='year'?4:2,'0')).join('-'))"),[thirty.start.toString(),thirty.end.toString()]);
 await click('[aria-label="Choose Start date"]');
 await wait("!!document.querySelector('.app-calendar-popover [role=grid]')");
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
 await wait("!document.querySelector('.app-calendar-popover')");
 assert.ok(await browser.evaluate("!!document.querySelector('.tonnage-export-content')"),'Closing nested calendar keeps export dialog open');
 await click('.chart-export-button'); await wait("document.querySelectorAll('.tonnage-export-content .app-date-picker').length===0");
 await click('[aria-label="Choose collection dates"]'); await wait("!!document.querySelector('.tonnage-calendar-popover [role=grid]')");
 // Select a single day in the current calendar using the actual calendar cells.
 const available=await browser.evaluate("[...document.querySelectorAll('.tonnage-calendar-popover [role=button]')].filter(el=>!el.hasAttribute('data-disabled') && !el.hasAttribute('data-outside-month')).map(el=>({label:el.getAttribute('aria-label'),text:el.textContent}))");
 const day=available.find(item=>item.label); assert.ok(day,'selectable calendar day');
 const selectDay=()=>browser.evaluate(`[...document.querySelectorAll('.tonnage-calendar-popover [role=button]')].find(el=>el.textContent===${JSON.stringify(day.text)} && !el.hasAttribute('data-disabled') && !el.hasAttribute('data-outside-month')).click()`);
 await selectDay(); await selectDay(); await pause(250); await click('.tonnage-apply');
 await wait("document.querySelector('.tonnage-summary-card strong').textContent.includes('1 t')"); assert.equal(requests.at(-1).start,requests.at(-1).end);
 empty=true; await preset('This month'); await wait("document.querySelector('.tonnage-trend-card').textContent.includes('No truckloads in this date range.')");
 fail=true; await preset('Last 7 days'); await wait("!!document.querySelector('.tonnage-trend-card [role=alert]')");
 assert.equal(await browser.evaluate("document.querySelector('.tonnage-summary-card strong').textContent"),'\u2014');
 fail=false;empty=false;await browser.evaluate("[...document.querySelectorAll('.tonnage-trend-card button')].find(el=>el.textContent==='Retry').click()");await wait("!!document.querySelector('.tonnage-trend-card .tonnage-chart')");
 // Keyboard editing rejects future dates before applying the filter.
 const requestCount=requests.length;
 const endYearSelector="[...document.querySelectorAll('.tonnage-date-picker [data-type=year]')].at(-1)";
 await browser.evaluate(`${endYearSelector}.focus()`);
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',windowsVirtualKeyCode:38});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',windowsVirtualKeyCode:38});
 await pause(150);
 await wait("!!document.querySelector('#tonnage-date-error')");
 assert.equal(await browser.evaluate("document.querySelector('.tonnage-apply').disabled"),true);
 assert.equal(requests.length,requestCount,'invalid dates do not fetch');
 await preset('Last 7 days'); await wait("!document.querySelector('#tonnage-date-error')");
 for(const width of [1920,1280,390,360]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});await pause(250);
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'page does not overflow at '+width);
  const bounds=await browser.evaluate("(()=>{const r=document.querySelector('.tonnage-date-controls').getBoundingClientRect();const d=document.querySelector('.tonnage-date-picker').getBoundingClientRect();return {left:d.left,right:d.right,max:r.right};})()");assert.ok(bounds.left>=0&&bounds.right<=bounds.max+1,JSON.stringify(bounds));
  const layout=await browser.evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {form:rect('.tonnage-date-filter'),controls:rect('.tonnage-date-controls'),apply:rect('.tonnage-apply')};})()`);
  assert.ok(layout.apply.height<=41,'Apply stays compact');
  assert.ok(layout.apply.right<=layout.form.right+1,'Apply remains inside toolbar');
  assert.ok(layout.controls.right<=layout.form.right+1,'Date controls stay inside toolbar');
 }
 await browser.evaluate("document.querySelector('[aria-label=\"Choose collection dates\"]').focus()");
 await click('[aria-label="Choose collection dates"]');await wait("!!document.querySelector('.tonnage-calendar-popover')");
 const tomorrow=today('Asia/Manila').add({days:1});
 if(tomorrow.month===today('Asia/Manila').month) {
  assert.ok(await browser.evaluate(`[...document.querySelectorAll('.tonnage-calendar-popover [role=button]')].filter(el=>el.textContent==='${tomorrow.day}'&&!el.hasAttribute('data-outside-month')).every(el=>el.hasAttribute('data-disabled'))`),'Future collection dates are disabled inside the calendar');
 }
 const bounds=await browser.evaluate("(()=>{const r=document.querySelector('.tonnage-calendar-popover').getBoundingClientRect();return {left:r.left,right:r.right};})()"); assert.ok(bounds.left>=0&&bounds.right<=391,JSON.stringify(bounds));
 await pause(300);
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});await pause(250);
 await wait("!!document.activeElement.closest('.tonnage-date-picker')");
 assert.deepEqual(errors,[]);
 console.log('PASS: HeroUI calendar, custom single-day range, presets, chart/summary values, export dates, date validation, keyboard editing/Escape focus, empty/error/retry, and 390/1280/1920 layouts.');
} finally {if(browser)await browser.close();await server.close();}
