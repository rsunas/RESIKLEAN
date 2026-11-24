import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const reports = [{ _id: 'qa-report', barangay: 'Abella', description: 'Missed collection', status: 'pending', createdAt: '2026-11-12T04:00:00Z' }];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__shell-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'shell-fixture',
  resolveId(id) { if (id === '/__shell.js') return '\0shell-fixture'; },
  load(id) { if (id === '\0shell-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import {PreferencesProvider} from '/src/components/preferences.jsx'; import {I18nProvider} from '@heroui/react'; import Dashboard from '/src/pages/Dashboard.jsx'; import '/src/index.css'; sessionStorage.setItem('resiklean_admin_token','fixture'); sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Super Admin 2',role:'admin'})); createRoot(document.getElementById('root')).render(React.createElement(PreferencesProvider,null,React.createElement(I18nProvider,{locale:'en-US'},React.createElement(BrowserRouter,null,React.createElement(Dashboard)))));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__shell-api')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({success:true,data:{users:[],days:[],statuses:[],hours:[],routes:[{_id:'active-route',key:'active-route',name:'Active QA route',isActive:true,barangay:['Abella'],schedule:[1],stops:[]},{_id:'archived-route',key:'archived-route',name:'Archived QA route',isActive:false,barangay:['Abella'],schedule:[1],stops:[]}],reports,loads:[],report:[],rows:[],trucks:[]}})); }
    else if (req.url.startsWith('/__shell') && !req.url.startsWith('/__shell.js')) { res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__shell.js"></script></body></html>')); }
    else next();
  }); }
}] });
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
 await server.listen(); browser = await openBrowser();
 const errors=[]; browser.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description||e.exceptionDetails.text));
 const click=s=>browser.evaluate(`document.querySelector(${JSON.stringify(s)}).click()`);
 await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'__shell'});
 for(let n=0;n<600;n++){if(await browser.evaluate("!!document.querySelector('[data-page-link]')"))break;await pause(100);}
 assert.deepEqual(errors, [], 'Dashboard initial render must succeed');
 await click('[data-page-link][aria-label="Complaints"]');
 // Wait for fetched complaints, not just the initial placeholder render.
 for(let n=0;n<600;n++) {
  assert.deepEqual(errors, [], 'Dashboard must not crash when populated API data arrives');
  if(await browser.evaluate("document.body.innerText.includes('Missed collection')")) break;
  await pause(100);
 }
 assert.deepEqual(errors, [], 'Dashboard must render populated complaints without runtime errors');
 assert.ok(await browser.evaluate("document.body.innerText.includes('Missed collection')"), 'Fetched complaint must appear in the complaint queue');
 await click('[data-page-link][aria-label="Manage Routes"]');
 for(let n=0;n<600;n++){if(await browser.evaluate("!!document.querySelector('.route-management-table tbody tr strong')"))break;await pause(100);}
 const routeNames=()=>browser.evaluate("[...document.querySelectorAll('.route-management-table tbody tr strong')].map(el=>el.textContent)");
 assert.deepEqual(await routeNames(),['Active QA route']);
 await browser.evaluate("document.querySelector('.route-filter-tabs [role=tab][aria-selected=true]').focus()");
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',windowsVirtualKeyCode:39});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',windowsVirtualKeyCode:39});await pause(200);
 assert.deepEqual(await routeNames(),['Archived QA route'],'Arrow key selects Archived tab and updates rows');
 await browser.evaluate("[...document.querySelectorAll('.route-filter-tabs [role=tab]')].find(el=>el.textContent==='All').click()");await pause(200);
 assert.deepEqual(await routeNames(),['Active QA route','Archived QA route']);
 await click('[data-page-link][aria-label="Waste Generation"]');await pause(200);
 await click('[aria-label="Choose From date submitted"]');
 for(let n=0;n<100;n++){if(await browser.evaluate("!!document.querySelector('.app-calendar-popover [role=grid]')"))break;await pause(100);}
 assert.ok(await browser.evaluate("!!document.querySelector('.app-calendar-popover [role=grid]')"),'Staff date filter opens HeroUI calendar');
 await browser.evaluate("document.querySelector('.app-calendar-popover [role=button]:not([data-disabled]):not([data-outside-month])').click()");await pause(200);
 assert.ok(await browser.evaluate("!!document.querySelector('[aria-label=\"Clear From date submitted\"]')"),'Selected date is stored');
 await click('[aria-label="Clear From date submitted"]');await pause(100);
 assert.ok(!await browser.evaluate("!!document.querySelector('[aria-label=\"Clear From date submitted\"]')"),'Clear resets date filter');
 for(const width of [1280,1920,1024,390]) {
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await pause(300);
  for(const label of ['Overview','Route History','Complaints','Waste Generation','Manage Routes','Driver Assignments','Manage Accounts','Manage Trucks']) {
   await click(`[data-page-link][aria-label="${label}"]`);await pause(250);
   const sizes=[];
   for(const collapsed of [false,true]) {
    if(width>850){const current=await browser.evaluate("document.body.classList.contains('sidebar-is-collapsed')");if(current!==collapsed)await click('.sidebar-collapse-toggle');}
    await pause(300);
    const bounds=await browser.evaluate(`(()=>{const c=document.querySelector('.dashboard-content'),r=c.getBoundingClientRect(),w=document.querySelector('.admin-workspace').getBoundingClientRect(),p=document.querySelector('.truck-management-panel,.route-management-panel');return {width:r.width,workspace:w.width,page:document.documentElement.scrollWidth,viewport:innerWidth,panel:p?.getBoundingClientRect().width,inner:r.width-parseFloat(getComputedStyle(c).paddingLeft)-parseFloat(getComputedStyle(c).paddingRight)};})()`);
    assert.ok(Math.abs(bounds.width-bounds.workspace)<2,`${label} fills workspace ${JSON.stringify(bounds)}`);
    assert.ok(bounds.page<=width+1,`${label} page overflow at ${width}: ${JSON.stringify(bounds)}`);
    if(bounds.panel)assert.ok(Math.abs(bounds.panel-bounds.inner)<2,`${label} panel fills content`);
    sizes.push(bounds.width);
   }
   if(width>850)assert.ok(sizes[1]>sizes[0]+100,`${label} expands at ${width}: ${sizes}`);
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: all 8 pages fill workspace, expand with collapsed sidebar, no page overflow at 1920/1280/1024/390; route and truck panels align with content.');
}finally{if(browser)await browser.close();await server.close();}