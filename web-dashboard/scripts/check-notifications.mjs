import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const id = '507f1f77bcf86cd799439011';
const report = { _id: id, description: 'Missed collection in Dinaga', barangay: 'Dinaga', status: 'pending', createdAt: '2026-11-17T04:00:00Z', residentId: { name: 'Maria Resident' } };
const load = { _id: id, staffId: { name: 'Peter Parker' }, truckPlate: 'SEA-2342', routeId: { name: 'Dinaga' }, arrivedAt: '2026-11-17T04:00:00Z', tonnesEstimate: 3.24, length: 3.8, width: 2.2, height: 1.2, slope: 1 };
const titles = { complaint: 'New complaint', reply: 'Resident replied', truckload: 'New truckload submission', route: 'Route collection finished' };
const items = Array.from({ length: 14 }, (_, i) => { const type = ['complaint', 'reply', 'truckload', 'route'][i % 4]; return { id: `${type}:${i.toString(16).padStart(24, '0')}`, type, title: titles[type], description: type === 'route' ? 'Peter Parker finished Route A: 27 of 29 stops recorded as collected.' : type === 'truckload' ? 'Peter Parker submitted 3.24 t for SEA-2342.' : 'Maria Resident reported uncollected waste in Dinaga.', remaining: type === 'route' ? 2 : 0, date: '2026-11-17T04:00:00Z', targetId: type === 'route' ? `${id}|${id}|2026-11-17` : id }; });
const read = new Set(); let failSave = false, failLoad = false;
const writes = [];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__notifications-api'), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(''), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{ name: 'notifications-fixture',
  resolveId(id) { if (id === '/__notifications.js') return '\0notifications-fixture'; },
  load(id) { if (id === '\0notifications-fixture') return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import App from '/src/App.jsx';import '/src/index.css';sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({_id:'qa-admin',name:'Super Admin',role:'admin'}));createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(App)));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__notifications-api')) {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname;
      let data = { users: [], routes: [], reports: [report], loads: [load], rows: [], count: 0 }, success = true, error = '';
      if (route.endsWith('/notifications/read')) {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); writes.push(body);
        if (failSave) { success = false; error = 'Could not mark notifications as read. Please retry.'; res.statusCode = 503; }
        else body.ids.forEach(id => read.add(id));
      } else if (route.endsWith('/notifications')) {
        if (failLoad) { success = false; error = 'Notifications are unavailable. Please retry.'; res.statusCode = 503; }
        const type = url.searchParams.get('type'), unread = url.searchParams.get('unread') === 'true', page = Number(url.searchParams.get('page')), limit = Number(url.searchParams.get('limit'));
        const rows = items.map(item => ({ ...item, read: read.has(item.id) })).filter(item => (type === 'all' || item.type === type) && (!unread || !item.read));
        data = { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, unread: items.length - read.size, page, limit };
      } else if (route.endsWith('/target')) data = { record: route.includes('truckload') ? load : report };
      else if (route.endsWith('/messages')) data = [];
      else if (route.includes('/route-history/')) data = { id: `${id}|${id}|2026-11-17`, route: { name: 'Route A', stops: [] }, recordSummary: { routeName: 'Route A' }, logs: [], trailPoints: [], sessions: [] };
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success, data, error }));
    } else if (['/notifications', '/dashboard', '/settings', '/login'].includes(req.url.split('?')[0])) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__notifications.js"></script></body></html>'));
    } else next();
  }); }
}] });
let browser;
try {
  await server.listen(); browser = await openBrowser(); const errors = []; console.log('Browser ready; loading notification fixture');
  browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let n = 0; n < 1200; n++) { assert.deepEqual(errors, []); if (await browser.evaluate(expression)) return; await pause(100); } console.log(await browser.evaluate('JSON.stringify({url:location.href,html:document.body.innerHTML.slice(-3000)})')); throw Error('Timeout: ' + expression); };
  const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async key => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key }); };
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: server.resolvedUrls.local[0] + 'dashboard' });
  await wait("!!document.querySelector('.sidebar-notifications') && document.querySelector('.notification-count')?.textContent==='14'");
  await browser.evaluate("document.querySelector('.sidebar-notifications').focus()"); await key('Enter');
  await wait("location.pathname==='/notifications' && document.querySelectorAll('.notifications-row').length===10 && !document.querySelector('.notifications-card [aria-busy=true]')");
  assert.equal(await browser.evaluate("document.querySelector('.sidebar-notifications').getAttribute('aria-current')"), 'page');
  assert.ok(await browser.evaluate("document.body.innerText.includes('Route collection finished')"));
  failSave = true;
  await click('.notifications-row button[aria-label^="Mark"]');
  await wait("document.querySelector('.notifications-error')?.textContent.includes('Please retry')");
  assert.equal(await browser.evaluate("document.querySelector('.notification-count').textContent"), '14');
  failSave = false;
  await click('.notifications-row button[aria-label^="Mark"]');
  await wait("document.querySelector('.notification-count').textContent==='13' && !document.querySelector('.notifications-error')");
  await click('.notifications-tabs button:nth-child(2)');
  await wait("document.querySelectorAll('.notifications-row.is-unread').length===10 && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('button[aria-label="Next page"]');
  await wait("document.querySelectorAll('.notifications-row').length===3 && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('.notifications-mark-page');
  await wait("document.querySelector('.notification-count').textContent==='10' && document.querySelectorAll('.notifications-row').length===10 && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('.notifications-tabs button:first-child');
  await wait("!document.querySelector('.notifications-card [aria-busy=true]')");
  await click('.notifications-row:nth-child(3) .notifications-actions button');
  await wait("!!document.querySelector('.tls-dialog')");
  assert.ok(await browser.evaluate("document.querySelector('.tls-dialog').innerText.includes('3.2')"));
  await key('Escape'); await wait("!document.querySelector('.tls-dialog')");
  await click('.notifications-row:nth-child(4) .notifications-actions button');
  await wait("!!document.querySelector('.route-history-detail-modal')");
  await click('.route-history-detail-modal .modal-header button:last-child');
  await wait("!document.querySelector('.route-history-detail-modal')");
  console.log('PASS: read controls, pagination, truckload and route dialogs');
  await click('.notifications-row:first-child .notifications-actions button');
  await wait("location.search.includes('complaints') && !!document.querySelector('.cq-thread')");
  await click('.sidebar-notifications');
  await wait("location.pathname==='/notifications' && !document.querySelector('.notifications-card [aria-busy=true]')");
  await browser.send('Page.reload', {});
  await wait("document.querySelector('.notification-count')?.textContent==='8' && !!document.querySelector('.notifications-toolbar .app-select') && !document.querySelector('.notifications-card [aria-busy=true]')");
  // Category select remains keyboard accessible using the existing HeroUI picker.
  await browser.evaluate("(()=>{const trigger=document.querySelector('[aria-label=\"Notification category\"]');trigger.focus();trigger.click();})()");
  await wait("!!document.querySelector('[role=option]')");
  await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes('Resident replies')).click()");
  await wait("document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  assert.ok(await browser.evaluate("[...document.querySelectorAll('.notifications-title h3')].every(el=>el.textContent==='Resident replied')"));
  await click('.notifications-mark-page');
  await wait("!document.querySelector('.notifications-card [aria-busy=true]') && !document.querySelector('.notifications-row.is-unread')");
  await click('.notifications-tabs button:nth-child(2)');
  await wait("!!document.querySelector('.notifications-empty')");
  failLoad = true;
  await browser.evaluate("window.dispatchEvent(new Event('focus'))");
  await wait("!!document.querySelector('.notifications-error')");
  failLoad = false;
  await click('.notifications-error button');
  await wait("!document.querySelector('.notifications-error') && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('.notifications-tabs button:first-child');
  await wait("document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  const directory = 'D:/RESIKLEAN-QA-TEMP/notifications'; await mkdir(directory, { recursive: true });
  for (const width of [1280, 1920, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
    await pause(250);
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), `No page overflow at ${width}`);
    await writeFile(`${directory}/${width}.png`, Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  assert.ok(writes.length >= 5);
  console.log('PASS: dedicated route, keyboard entry, unread badge, failed save, per-page read and pagination clamp, category filter, persistent reads after reload, complaint/truckload/route targets, empty/error/retry, 1280/1920/390 widths.');
} finally { if (browser) await browser.close(); await server.close(); }
