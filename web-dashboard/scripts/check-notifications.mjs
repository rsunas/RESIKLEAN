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
  load(id) { if (id === '\0notifications-fixture') return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {PreferencesProvider} from '/src/components/preferences.jsx';import {I18nProvider} from '@heroui/react';import App from '/src/App.jsx';import '/src/index.css';window.history.replaceState(null,'','?view=activity');sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify({_id:'qa-admin',name:'Super Admin',role:'admin'}));createRoot(document.getElementById('root')).render(React.createElement(PreferencesProvider,null,React.createElement(I18nProvider,{locale:'en-US'},React.createElement(BrowserRouter,null,React.createElement(App)))));`; },
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
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml(req.url, '<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/__notifications.js"></script></body></html>'));
    } else next();
  }); }
}] });
let browser;
try {
  await server.listen(); browser = await openBrowser(); const errors = []; console.log('Browser ready; loading notification fixture');
  browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  browser.on('Runtime.consoleAPICalled', event => { if (event.type === 'warning' || event.type === 'error') errors.push(event.type + ': ' + event.args.map(arg => arg.value || arg.description || '').join(' ')); });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => { for (let n = 0; n < 100; n++) { assert.deepEqual(errors, []); if (await browser.evaluate(expression)) return; await pause(100); } console.log(await browser.evaluate('JSON.stringify({url:location.href,html:document.body.innerHTML.slice(-3000)})')); throw Error('Timeout: ' + expression); };
  const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async key => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key }); };
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: server.resolvedUrls.local[0] + 'dashboard' });
  await wait("!!document.querySelector('.sidebar-notifications') && document.querySelector('.notification-count')?.textContent==='14'");
  await browser.evaluate("document.querySelector('.sidebar-notifications').focus()"); await key('Enter');
  await wait("location.pathname==='/notifications' && document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  assert.equal(await browser.evaluate("document.querySelector('.sidebar-notifications').getAttribute('aria-current')"), 'page');
  const initialActionRects = await browser.evaluate("Array.from(document.querySelectorAll('.notifications-row'), row => { const actions = row.querySelector('.notifications-actions'); const primary = actions.querySelector(':scope > button'); const secondary = actions.querySelector(':scope > .notifications-mark-item, :scope > .notifications-read-label'); const rect = element => { const { width, height, left } = element.getBoundingClientRect(); return { width, height, left }; }; return { primary: rect(primary), secondary: rect(secondary) }; })");
  assert.equal(initialActionRects.length, 4);
  assert.ok(initialActionRects.every(({ primary, secondary }) => primary.width === 184 && primary.height === 44 && secondary.width === 184 && secondary.height === 36));
  assert.ok(initialActionRects.every(({ primary }) => primary.left === initialActionRects[0].primary.left));
  assert.ok(await browser.evaluate("document.body.innerText.includes('Route collection finished')"));
  failSave = true;
  await click('.notifications-row button[aria-label^="Mark"]');
  await wait("document.querySelector('.notifications-error')?.textContent.includes('Please retry')");
  assert.equal(await browser.evaluate("document.querySelector('.notification-count').textContent"), '14');
  failSave = false;
  await click('.notifications-row button[aria-label^="Mark"]');
  await wait("document.querySelector('.notification-count').textContent==='13' && !document.querySelector('.notifications-error')");
  const readRowState = await browser.evaluate("(() => { const row = document.querySelector('.notifications-row:first-child'); const pill = row.querySelector('.notifications-read-label'); const rect = pill.getBoundingClientRect(); return { unread: row.classList.contains('is-unread'), dot: !!row.querySelector('.notifications-unread-dot'), tag: pill.tagName, width: rect.width, height: rect.height }; })()");
  assert.deepEqual(readRowState, { unread: false, dot: false, tag: 'SPAN', width: 184, height: 36 });
  assert.ok(await browser.evaluate("document.querySelector('.notifications-tabs button:nth-child(2)').textContent.includes('13')"));
  await click('.notifications-tabs button:nth-child(2)');
  await wait("document.querySelectorAll('.notifications-row.is-unread').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('button[aria-label="Next page"]');
  await wait("document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  await click('.notifications-mark-page');
  await wait("document.querySelector('.notification-count').textContent==='9' && document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
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
  await click('.notifications-row:nth-child(2) .notifications-actions button');
  await wait("location.search.includes('complaints') && !!document.querySelector('.cq-thread')");
  await click('.sidebar-notifications');
  await wait("location.pathname==='/notifications' && !document.querySelector('.notifications-card [aria-busy=true]')");
  await wait("!!document.querySelector('.notifications-row:first-child .notifications-actions button')");
  console.log('PASS: read controls, pagination, truckload, route, complaint and reply actions');
  await click('.notifications-row:first-child .notifications-actions button');
  await wait("location.search.includes('complaints') && !!document.querySelector('.cq-thread')");
  await click('.sidebar-notifications');
  await wait("location.pathname==='/notifications' && !document.querySelector('.notifications-card [aria-busy=true]')");
  await browser.send('Page.reload', {});
  await wait("document.querySelector('.notification-count')?.textContent==='6' && !!document.querySelector('.notifications-toolbar .app-select') && !document.querySelector('.notifications-card [aria-busy=true]')");
  // Category select remains keyboard accessible using the existing HeroUI picker.
  await browser.evaluate("(()=>{const trigger=document.querySelector('.notifications-category-select [data-slot=select-trigger]');trigger.focus();trigger.click();})()");
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
  const inspectCategory = () => browser.evaluate("(() => { const root=document.querySelector('.notifications-category-select'); const trigger=root.querySelector('[data-slot=select-trigger]'); const value=root.querySelector('[data-slot=select-value]'); const icon=root.querySelector('[data-slot=select-default-indicator]'); const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}}; const triggerBox=box(trigger), valueBox=box(value), iconBox=box(icon), style=getComputedStyle(trigger); return {label:value.textContent.trim(),width:triggerBox.width,height:triggerBox.height,right:triggerBox.right,valueRight:valueBox.right,iconLeft:iconBox.left,valueFits:value.scrollWidth<=value.clientWidth,borderRadius:style.borderRadius,borderColor:style.borderColor,background:style.backgroundColor,boxShadow:style.boxShadow,gap:iconBox.left-valueBox.right}; })()");
  await click('.notifications-category-select [data-slot=select-trigger]');
  await wait("document.querySelectorAll('.notifications-category-popover [role=option]').length===5");
  await browser.evaluate("[...document.querySelectorAll('.notifications-category-popover [role=option]')].find(option=>option.textContent.trim()==='All activity').click()");
  await wait("document.querySelector('.notifications-category-select [data-slot=select-value]')?.textContent.trim()==='All activity' && !document.querySelector('.notifications-card [aria-busy=true]')");  const categoryStart = await inspectCategory();
  assert.deepEqual({ label: categoryStart.label, width: categoryStart.width, height: categoryStart.height, valueFits: categoryStart.valueFits, borderRadius: categoryStart.borderRadius }, { label: 'All activity', width: 220, height: 44, valueFits: true, borderRadius: '12px' });
  assert.ok(categoryStart.gap >= 9, 'Chevron has its own reserved space');
  await click('.notifications-category-select [data-slot=select-trigger]');
  await wait("document.querySelectorAll('.notifications-category-popover [role=option]').length===5");
  await pause(180);
  const openCategory = await browser.evaluate("(() => { const root=document.querySelector('.notifications-category-select'); const trigger=root.querySelector('[data-slot=select-trigger]'); const icon=root.querySelector('[data-slot=select-default-indicator]'); const menu=document.querySelector('.notifications-category-popover'); const selected=[...menu.querySelectorAll('[role=option]')].find(option=>option.getAttribute('aria-selected')==='true'||option.getAttribute('data-selected')==='true'); return {label:selected?.textContent.trim(),triggerLeft:trigger.getBoundingClientRect().left,triggerWidth:trigger.getBoundingClientRect().width,border:getComputedStyle(trigger).borderColor,transform:getComputedStyle(icon).transform,menuLeft:menu.getBoundingClientRect().left,menuWidth:menu.getBoundingClientRect().width}; })()");
  assert.equal(openCategory.label, 'All activity');
  assert.equal(openCategory.border, 'rgb(11, 107, 76)');
  assert.notEqual(openCategory.transform, 'matrix(1, 0, 0, 1, 0, 0)');
  assert.ok(Math.abs(openCategory.menuLeft - openCategory.triggerLeft) < 1, 'Dropdown menu aligns to the control left edge');
  assert.ok(openCategory.menuWidth >= openCategory.triggerWidth, 'Dropdown menu is at least as wide as the control');
  await key('Escape');
  await wait("!document.querySelector('.notifications-category-popover [role=option]')");

  const filterCases = [
    { label: 'New complaints', title: 'New complaint', count: 4 },
    { label: 'Resident replies', title: 'Resident replied', count: 4 },
    { label: 'Truckload submissions', title: 'New truckload submission', count: 3 },
    { label: 'Finished collections', title: 'Route collection finished', count: 3 },
    { label: 'All activity', title: null, count: 4 }
  ];
  const unreadCountBeforeFilters = await browser.evaluate("document.querySelector('.notification-count')?.textContent");
  for (const filterCase of filterCases) {
    await click('.notifications-category-select [data-slot=select-trigger]');
    await wait("document.querySelectorAll('.notifications-category-popover [role=option]').length===5");
    await browser.evaluate("([...document.querySelectorAll('.notifications-category-popover [role=option]')].find(option=>option.textContent.trim()===" + JSON.stringify(filterCase.label) + ")).click()");
    const titleCondition = filterCase.title === null ? 'true' : "[...document.querySelectorAll('.notifications-title h3')].every(title=>title.textContent===" + JSON.stringify(filterCase.title) + ")";
    const filterCondition = "document.querySelector('.notifications-category-select [data-slot=select-value]')?.textContent.trim()===" + JSON.stringify(filterCase.label) + " && !document.querySelector('.notifications-card [aria-busy=true]') && document.querySelectorAll('.notifications-row').length===" + filterCase.count + " && (" + titleCondition + ")";
    await wait(filterCondition);
    const state = await inspectCategory();
    assert.equal(state.width, categoryStart.width, 'Control width remains fixed for ' + filterCase.label);
    assert.ok(state.valueFits, filterCase.label + ' fits without clipping');
    assert.ok(state.gap >= 9, 'Chevron remains separated for ' + filterCase.label);
    assert.equal(await browser.evaluate("document.querySelector('.notification-count')?.textContent"), unreadCountBeforeFilters, 'Unread count is independent of category filtering');
  }

  await click('.notifications-tabs button:nth-child(2)');
  await wait("document.querySelectorAll('.notifications-row.is-unread').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  assert.equal(await browser.evaluate("document.querySelector('.notification-count')?.textContent"), unreadCountBeforeFilters);
  await click('.notifications-tabs button:first-child');
  await wait("document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");

  await click('.notifications-category-select [data-slot=select-trigger]');
  await wait("document.querySelectorAll('.notifications-category-popover [role=option]').length===5");
  await browser.evaluate("[...document.querySelectorAll('.notifications-category-popover [role=option]')].find(option=>option.textContent.trim()==='Truckload submissions').click()");
  await wait("document.querySelector('.notifications-category-select [data-slot=select-value]')?.textContent.trim()==='Truckload submissions' && document.querySelectorAll('.notifications-row').length===3 && !document.querySelector('.notifications-card [aria-busy=true]')");
  for (const [zoom, width] of [[1, 1280], [1.25, 1024], [1.5, 853]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: Math.round(900 / zoom), deviceScaleFactor: zoom, mobile: false });
    await pause(200);
    const zoomState = await inspectCategory();
    assert.equal(zoomState.label, 'Truckload submissions');
    assert.equal(zoomState.width, 220, 'Fixed selector width at ' + zoom * 100 + '% zoom');
    assert.equal(zoomState.height, 44, 'Selector height at ' + zoom * 100 + '% zoom');
    assert.ok(zoomState.valueFits, 'Longest selected label fits at ' + zoom * 100 + '% zoom');
    assert.ok(zoomState.gap >= 9, 'Chevron stays separated at ' + zoom * 100 + '% zoom');
    assert.ok(zoomState.right <= width, 'Selector remains within the viewport at ' + zoom * 100 + '% zoom');
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await click('.notifications-category-select [data-slot=select-trigger]');
  await wait("document.querySelectorAll('.notifications-category-popover [role=option]').length===5");
  await browser.evaluate("[...document.querySelectorAll('.notifications-category-popover [role=option]')].find(option=>option.textContent.trim()==='All activity').click()");
  await wait("document.querySelector('.notifications-category-select [data-slot=select-value]')?.textContent.trim()==='All activity' && document.querySelectorAll('.notifications-row').length===4 && !document.querySelector('.notifications-card [aria-busy=true]')");
  console.log('PASS: HeroUI category selector geometry, menu alignment, all five filters, unread tabs/count, and 100/125/150% zoom layout.');
  const directory = 'D:/RESIKLEAN-QA-TEMP/notifications'; await mkdir(directory, { recursive: true });
  for (const width of [1280, 1920, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
    await pause(250);
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), `No page overflow at ${width}`);
    await writeFile(`${directory}/${width}.png`, Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
  await pause(250);
  const wideActionRects = await browser.evaluate("Array.from(document.querySelectorAll('.notifications-row'), row => { const actions = row.querySelector('.notifications-actions'); const primary = actions.querySelector(':scope > button').getBoundingClientRect(); const secondary = actions.querySelector(':scope > .notifications-mark-item, :scope > .notifications-read-label').getBoundingClientRect(); return { primary: { width: primary.width, height: primary.height, left: primary.left }, secondary: { width: secondary.width, height: secondary.height, left: secondary.left } }; })");
  assert.ok(wideActionRects.length && wideActionRects.every(({ primary, secondary }) => primary.width === 184 && primary.height === 44 && secondary.width === 184 && secondary.height === 36 && primary.left === secondary.left));
  assert.ok(wideActionRects.every(({ primary }) => primary.left === wideActionRects[0].primary.left));
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await pause(250);
  const mobileActionRects = await browser.evaluate("Array.from(document.querySelectorAll('.notifications-row'), row => { const actions = row.querySelector('.notifications-actions'); const primary = actions.querySelector(':scope > button').getBoundingClientRect(); const secondary = actions.querySelector(':scope > .notifications-mark-item, :scope > .notifications-read-label').getBoundingClientRect(); return { direction: getComputedStyle(actions).flexDirection, actionWidth: actions.getBoundingClientRect().width, primary: { width: primary.width, height: primary.height }, secondary: { width: secondary.width, height: secondary.height } }; })");
  assert.ok(mobileActionRects.length && mobileActionRects.every(({ direction, actionWidth, primary, secondary }) => direction === 'row' && primary.height >= 44 && secondary.height >= 44 && Math.abs(primary.width - (actionWidth - 8) / 2) < 0.1 && Math.abs(primary.width - secondary.width) < 0.1));
  assert.ok(writes.length >= 5);
  assert.deepEqual(errors, []);
  console.log('PASS: notification action wiring, unread updates, desktop/mobile button geometry, category filtering and pagination, screenshots at 1280/1920/390, and no browser errors or warnings.');
} finally { if (browser) await browser.close(); await server.close(); }
