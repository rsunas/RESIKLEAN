import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const categoryValues = ['biodegradable','non-biodegradable','recyclable','hazardous',undefined];
const categoryLabels = ['Biodegradable','Non-biodegradable','Recyclable','Hazardous','Not specified'];
const reports = Array.from({length:60},(_,i)=>({_id:'report-'+i,wasteCategory:categoryValues[i%categoryValues.length],photoUrl:'/swmo-resiklean-logo.svg',photoMetadata:{width:3060,height:4080,latitude:13.62313,longitude:123.17673,capturedAt:'2026-11-12T04:00:00Z'},barangay:'Abella',description:'Missed collection '+i+' with a very long subject '.repeat(5),status:'pending',createdAt:'2026-11-12T04:00:00Z',residentId:{name:'Richard',email:'richard@example.com'}}));
let sent=[];let failSend=false;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__shell-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'shell-fixture',
  resolveId(id) { if (id === '/__shell.js') return '\0shell-fixture'; },
  load(id) { if (id === '\0shell-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import Dashboard from '/src/pages/Dashboard.jsx'; import '/src/index.css'; sessionStorage.setItem('resiklean_admin_token','fixture'); sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Super Admin 2',role:'admin'})); createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if(req.url.includes('/messages')) {res.setHeader('Content-Type','application/json');if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;sent.push(JSON.parse(body));res.statusCode=failSend?500:200;res.end(JSON.stringify({success:!failSend,error:failSend?'Could not send reply':undefined,data:{_id:'sent-'+sent.length,body:JSON.parse(body).body,senderRole:'admin',createdAt:new Date().toISOString()}}));}else res.end(JSON.stringify({success:true,data:Array.from({length:60},(_,i)=>({_id:'msg-'+i,body:'Message '+i+' long text '.repeat(20),senderRole:i%2?'admin':'resident',createdAt:'2026-11-12T04:00:00Z'}))}));}
    else if (req.url.startsWith('/__shell-api')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({success:true,data:{users:[],routes:[],reports,loads:[],report:[],rows:[],trucks:[]}})); }
    else if (req.url.startsWith('/__shell') && !req.url.startsWith('/__shell.js')) { res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__shell.js"></script></body></html>')); }
    else next();
  }); }
}] });
let browser;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 await server.listen();
 // Prepare Vite's HTML transform before starting the browser navigation timeout.
 await fetch(server.resolvedUrls.local[0]+'__shell?view=complaints');
 browser=await openBrowser();
 const errors=[];browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const wait=async exp=>{for(let n=0;n<300;n++){if(await browser.evaluate(exp))return;await pause(100);}throw Error('Timeout: '+exp+' '+errors.join(' '));};
 const click=selector=>browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__shell?view=complaints'});
 await wait("!!document.querySelector('[data-page-link][aria-label=Complaints]')"); await click('[data-page-link][aria-label=Complaints]'); await wait("document.querySelectorAll('.cq-item').length===60");
 for(let i=0;i<categoryLabels.length;i++) {
  await browser.evaluate(`document.querySelectorAll('.cq-item')[${i}].click()`);
  await wait(`Array.from(document.querySelectorAll('.cq-details strong')).some(el=>el.textContent===${JSON.stringify(categoryLabels[i])})`);
  assert.ok(await browser.evaluate(`document.querySelectorAll('.cq-item')[${i}].textContent.includes(${JSON.stringify('Waste category: '+categoryLabels[i])})`));
 }
 for(const [width,height] of [[1280,720],[1920,1080],[390,844]]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await pause(250);
  await click('.cq-item');await wait("document.querySelectorAll('.cq-message').length===60");await pause(200);
  const geometry=await browser.evaluate(`(()=>{const t=document.querySelector('.cq-thread'),c=document.querySelector('.cq-composer').getBoundingClientRect();return {page:document.documentElement.scrollHeight,viewport:innerHeight,bottom:c.bottom,thread:t.scrollHeight>t.clientHeight,list:document.querySelector('.cq-list-scroll').scrollHeight>document.querySelector('.cq-list-scroll').clientHeight};})()`);
  assert.ok(geometry.page<=height,JSON.stringify(geometry));assert.ok(geometry.bottom<=height,JSON.stringify(geometry));assert.ok(geometry.thread);
  if(width>=1100)assert.ok(geometry.list);
  else {await click('.cq-back');assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.cq-list')).display"),'flex');await click('.cq-item');}
 }
 await browser.evaluate("document.querySelector('.cq-composer textarea').focus()");await browser.send('Input.insertText',{text:'Keyboard reply'});
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',windowsVirtualKeyCode:13,modifiers:8,text:'\r'});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',windowsVirtualKeyCode:13,modifiers:8});
 await pause(100);assert.equal(sent.length,0);
 await browser.send('Input.insertText',{text:'Second line'});
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',windowsVirtualKeyCode:13,text:'\r'});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',windowsVirtualKeyCode:13});
 await wait("document.querySelector('.cq-composer textarea').value===''");assert.equal(sent.length,1);assert.ok(sent[0].body.includes('Second line'));
 failSend=true;await browser.send('Input.insertText',{text:'Keep this failed reply'});await click('.cq-send');await wait("!!document.querySelector('.cq-error')");assert.equal(await browser.evaluate("document.querySelector('.cq-composer textarea').value"),'Keep this failed reply');
  await click('[aria-label="Expand complaint photo"]');await wait("!!document.querySelector('.cq-lightbox')");
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('.cq-lightbox')");
 await click('.cq-status [data-slot="select-trigger"]');await wait("document.querySelectorAll('[role=option]').length===4");
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 assert.deepEqual(errors,[]);console.log('PASS: viewport sizing at 1280x720/1920/390, 60 complaints, long thread, internal scrolling, mobile back, Shift+Enter, Enter send, failed reply retention.');
} finally {if(browser)await browser.close();await server.close();}
