// Real dashboard interactions with local API fixtures; no production writes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const id = '507f1f77bcf86cd799439011';
const created = { _id: id, name: 'New Admin', email: 'admin@example.test', role: 'admin' };
let saved = false, requests = [], identityRequests = 0;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__accounts-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'accounts-fixture',
 resolveId(id) { if (id === '/__accounts.js') return '\0accounts-fixture'; },
 load(id) { if (id === '\0accounts-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import Dashboard from '/src/pages/Dashboard.jsx'; import '/src/index.css'; sessionStorage.setItem('resiklean_admin_token','fixture'); sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Existing admin',role:'admin'})); createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`; },
 configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
   if (req.url.startsWith('/__accounts-api')) {
     res.setHeader('Content-Type', 'application/json');
     if (req.method === 'POST' && req.url.endsWith('/users')) {
       let body = ''; for await (const chunk of req) body += chunk;
       requests.push({ body, contentType: req.headers['content-type'], auth: req.headers.authorization });
       if (requests.length === 1) { res.statusCode = 503; res.end(JSON.stringify({ success: false, error: 'Test upload unavailable. Retry.' })); }
       else { saved = true; res.end(JSON.stringify({ success: true, data: created })); }
     } else if (req.url.endsWith('/identity')) {
       identityRequests++; assert.equal(req.headers.authorization, 'Bearer fixture');
       res.end(JSON.stringify({ success: true, data: { birthday: '2000-02-29', hasIdPhoto: false, assignedTruck: null } }));
     } else res.end(JSON.stringify({ success: true, data: { users: saved ? [created] : [], routes: [], reports: [], loads: [], report: [], rows: [], trucks: [] } }));
   } else if (req.url === '/__accounts') { res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__accounts.js"></script></body></html>')); }
   else next();
 }); }
}] });
let browser; const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
 await server.listen(); browser = await openBrowser();
 const errors = []; browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
 const wait = async expression => { for(let i=0;i<600;i++) { if(await browser.evaluate(expression)) return; await pause(100); } throw new Error(`Timeout: ${expression}; ${errors}`); };
 const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await browser.send('Emulation.setDeviceMetricsOverride', { width:1280, height:720, deviceScaleFactor:1, mobile:false });
 await browser.send('Page.navigate', { url:server.resolvedUrls.local[0]+'__accounts' });
 await wait("!!document.querySelector('[data-page-link]')"); await click('[data-page-link][aria-label="Manage Accounts"]'); await wait("!!document.querySelector('.accounts-action-button')"); await click('.accounts-action-button');
 await wait("!!document.querySelector('#account-name')");
 for (const [selector,text] of [['#account-name','New Admin'],['#account-email','admin@example.test'],['#account-password','testing123']]) { await browser.evaluate(`document.querySelector('${selector}').focus()`); await browser.send('Input.insertText',{text}); }
 for(const [segment,value] of [['month','02'],['day','29'],['year','2000']]) {
  await browser.evaluate(`document.querySelector('#account-birthday [data-type="${segment}"]').focus()`);
  for(const digit of value) {
   await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:digit,text:digit,windowsVirtualKeyCode:digit.charCodeAt(0)});
   await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:digit,windowsVirtualKeyCode:digit.charCodeAt(0)});
  }
 }

 await click('[aria-label="Choose Birthday (optional)"]');
 await wait("!!document.querySelector('.app-calendar-popover [role=grid]')");
 await click('.app-calendar-popover [data-slot="calendar-year-picker-trigger"]');
 await wait("!!document.querySelector('.app-calendar-popover [data-slot=calendar-year-picker-grid]')");
 assert.ok(await browser.evaluate("[...document.querySelectorAll('.app-calendar-popover [data-slot=calendar-year-picker-year-cell]')].filter(el=>!el.hasAttribute('data-disabled')).every(el=>Number(el.textContent)<=new Date().getFullYear())"),'Birthday year picker excludes future years');
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
 await wait("!document.querySelector('.app-calendar-popover')");
 await click('#account-role'); await wait("!!document.querySelector('[role=option]')"); await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent==='Admin').click()");
 for(const selector of ['#account-photo','#account-id-photo']) await browser.evaluate(`(()=>{const input=document.querySelector('${selector}');const files=new DataTransfer(); files.items.add(new File(['test image'],'test.jpg',{type:'image/jpeg'})); input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await click('.account-create'); await wait("!!document.querySelector('.account-form-error')");
 assert.equal(await browser.evaluate("document.querySelector('#account-name').value"),'New Admin');
 assert.ok(await browser.evaluate("!!document.querySelector('.account-id-preview img')"),'failed save keeps ID preview');
 await click('.account-create'); await wait("!document.querySelector('.account-dialog')");
 assert.equal(requests.length,2);
 for(const request of requests) {
   assert.match(request.contentType,/multipart\/form-data/); assert.equal(request.auth,'Bearer fixture');
   for(const field of ['avatar','idPhoto','birthday','role']) assert.ok(request.body.includes(`name="${field}"`),field);
   assert.ok(request.body.includes('2000-02-29')); assert.ok(request.body.includes('admin'));
 }
 await wait("[...document.querySelectorAll('tbody tr')].some(row=>row.textContent.includes('New Admin'))");
 for (const width of [1920,1513,1280,390]) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height:720, deviceScaleFactor:1, mobile:false });
  for (const collapsed of (width>850 ? [false,true] : [true])) {
   if(width>850 && await browser.evaluate("document.body.classList.contains('sidebar-is-collapsed')")!==collapsed) await click('.sidebar-collapse-toggle');
   await pause(350);
   for (const scroll of [0,10000]) {
    await browser.evaluate(`document.querySelector('.accounts-table-card .table-scroll').scrollLeft=${scroll}`);
    await pause(50);
    const bounds=await browser.evaluate(`(()=>{const button=document.querySelector('.accounts-table-card .account-profile-trigger'),r=button.getBoundingClientRect(),s=document.querySelector('.accounts-table-card .table-scroll').getBoundingClientRect();return {left:r.left,right:r.right,containerLeft:s.left,containerRight:s.right,viewport:innerWidth,visible:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})()`);
    assert.ok(bounds.left>=bounds.containerLeft && bounds.right<=bounds.containerRight && bounds.right<=bounds.viewport && bounds.visible, `View profile must be visible and clickable at ${width}, collapsed=${collapsed}, scroll=${scroll}: ${JSON.stringify(bounds)}`);
   }
  }
 }
 const point=await browser.evaluate(`(()=>{const r=document.querySelector('.accounts-table-card .account-profile-trigger').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await browser.send('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
 await browser.send('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
 await wait("!!document.querySelector('.account-profile-grid') && document.querySelector('.account-profile-grid').textContent.includes('February 29, 2000')");
 assert.equal(identityRequests,1); assert.deepEqual(errors,[]);
 console.log('PASS: Admin creation sends birthday and both images; upload failure preserves fields/preview; retry succeeds; View profile remains visible at 1920/1513/1280/390 with sidebar toggles and table scrolling; a real pointer click opens protected details.');
} finally { if(browser) await browser.close(); await server.close(); }
