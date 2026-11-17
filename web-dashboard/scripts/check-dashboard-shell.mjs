import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const reports = [{ _id: 'qa-report', barangay: 'Abella', description: 'Missed collection', status: 'pending', createdAt: '2026-11-12T04:00:00Z' }];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__shell-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'shell-fixture',
  resolveId(id) { if (id === '/__shell.js') return '\0shell-fixture'; },
  load(id) { if (id === '\0shell-fixture') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import Dashboard from '/src/pages/Dashboard.jsx'; import '/src/index.css'; sessionStorage.setItem('resiklean_admin_token','fixture'); sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Super Admin 2',role:'admin'})); createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(Dashboard)));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__shell-api')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({success:true,data:{users:[],routes:[],reports,loads:[],report:[],rows:[],trucks:[]}})); }
    else if (req.url.startsWith('/__shell') && !req.url.startsWith('/__shell.js')) { res.setHeader('Content-Type','text/html'); res.end(await vite.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__shell.js"></script></body></html>')); }
    else next();
  }); }
}] });
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await server.listen(); browser = await openBrowser();
  const errors = []; browser.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  const waitFor = async expression => { for (let n=0;n<200;n++) { if (await browser.evaluate(expression)) return; await pause(100); } throw new Error(`Timed out: ${expression}; ${errors.join('\n')}`); };
  const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:`${server.resolvedUrls.local[0]}__shell`});
  await waitFor("document.querySelector('.notification-count')?.textContent === '1'");
  assert.equal(await browser.evaluate("!!document.querySelector('.topbar')"),false);
  for (const label of ['Overview','Route History','Complaints','Staff Activity','Manage Routes','Driver Assignments','Manage Accounts','Manage Trucks']) {
    await click(`[data-page-link][aria-label="${label}"]`); await pause(250);
    const bounds = await browser.evaluate(`(() => {const h=document.querySelector('.dashboard-content > .page-header');const r=h.getBoundingClientRect();return {y:r.y,bottom:r.bottom,visible:getComputedStyle(h).display !== 'none',next:h.nextElementSibling?.getBoundingClientRect().top};})()`);
    assert.ok(bounds.visible && bounds.y >= 16 && bounds.y <= 28, `${label}: heading at top ${JSON.stringify(bounds)}`);
    assert.ok(bounds.next >= bounds.bottom && bounds.next-bounds.bottom <= 24, `${label}: no content gap ${JSON.stringify(bounds)}`);
  }
  await click('.sidebar-notifications'); await waitFor("!!document.querySelector('.notification-panel [role=dialog]')"); await pause(200);
  assert.equal(await browser.evaluate("document.querySelectorAll('.notification-item').length"),1);
  assert.ok(await browser.evaluate("document.querySelector('.notification-panel').getBoundingClientRect().left >= document.querySelector('.admin-sidebar').getBoundingClientRect().right"));
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27}); await pause(200);
  await click('.sidebar-account'); await waitFor("!!document.querySelector('.account-signout')"); await click('.account-signout'); await waitFor("!!document.querySelector('.logout-confirm-modal')");
  await click('[aria-label="Close sign-out confirmation"]');
  await click('.sidebar-collapse-toggle'); await pause(350);
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.sidebar-account-copy')).display"),'none');
  assert.ok(await browser.evaluate("document.querySelector('.notification-count').getBoundingClientRect().width > 0"));
  await click('.sidebar-notifications'); await waitFor("!!document.querySelector('.notification-panel')"); await pause(200);
  await click('[aria-label="Close notifications"]'); await pause(200);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false}); await pause(200);
  await click('.mobile-sidebar-toggle'); await pause(200);
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.sidebar-account-copy')).display"),'grid');
  await click('.sidebar-notifications'); await waitFor("!!document.querySelector('.notification-panel')"); await pause(200);
  assert.ok(await browser.evaluate("document.querySelector('.notification-panel').getBoundingClientRect().right <= innerWidth"));
  assert.deepEqual(errors,[]);
  console.log('PASS: all eight page headings/content spacing, header removal, live report badge, right-side notifications, account/sign-out, collapsed sidebar, mobile panels.');
} finally { if(browser) await browser.close(); await server.close(); }