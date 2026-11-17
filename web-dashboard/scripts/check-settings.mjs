import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';

let user = { _id: 'qa-admin', name: 'Super Admin 2', email: 'admin@example.test', role: 'admin', phone: '09123456789', authProvider: 'local', isPasswordSet: true };
let settings = { theme: 'system', language: 'en', notifications: { pushEnabled: true } };
let failSave = false, failLoad = false, profileFailure = false;
const writes = [];
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__settings-api'), 'import.meta.env.VITE_SOCKET_URL': JSON.stringify(''), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') }, plugins: [{
  name: 'settings-fixture', resolveId(id) { if (id === '/__settings.js') return '\0settings-fixture'; },
  load(id) { if (id === '\0settings-fixture') return `import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import App from '/src/App.jsx';import '/src/index.css';if(!sessionStorage.getItem('qa-seeded')){sessionStorage.setItem('resiklean_admin_token','fixture');sessionStorage.setItem('resiklean_admin_user',JSON.stringify(${JSON.stringify(user)}));sessionStorage.setItem('qa-seeded','1');}createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(App)));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__settings-api')) {
      const route = req.url.split('?')[0]; let data = { users: [], routes: [], trucks: [], loads: [], reports: [], rows: [], count: 0, pages: 1 };
      let success = true, error = '';
      if (req.method === 'PATCH') {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = req.headers['content-type'].includes('application/json') ? JSON.parse(raw) : raw;
        writes.push({ route, body });
        if (failSave || (route.endsWith('/me') && profileFailure)) { success = false; error = 'Test save failed. Please retry.'; res.statusCode = 503; }
        else if (route.endsWith('/settings')) { settings = { ...settings, ...body, notifications: { ...settings.notifications, ...body.notifications } }; data = { settings }; }
        else if (route.endsWith('/me')) { const name = raw.match(/name="name"\r\n\r\n([^\r]+)/)?.[1]; user = { ...user, name: name || user.name }; data = { user }; }
      } else if (route.endsWith('/auth/settings')) {
        if (failLoad) { success = false; error = 'Settings are unavailable.'; res.statusCode = 503; }
        data = { ...user, settings };
      } else if (route.endsWith('/auth/me')) data = user;
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success, data, error }));
    } else if (['/settings', '/dashboard', '/login'].includes(req.url.split('?')[0])) {
      res.setHeader('Content-Type', 'text/html');res.end(await vite.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__settings.js"></script></body></html>'));
    } else next();
  }); }
}] });
let browser;
try {
  await server.listen(); browser = await openBrowser(); const errors = [];
  browser.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const wait = async expr => { for (let n = 0; n < 300; n++) { assert.deepEqual(errors, []); if (await browser.evaluate(expr)) return; await pause(100); } console.log(await browser.evaluate("JSON.stringify({url:location.href,text:document.body.innerText.slice(-3000),focus:document.activeElement.outerHTML.slice(0,300),switches:[...document.querySelectorAll('[role=switch]')].map(el=>el.outerHTML),menus:[...document.querySelectorAll('[role=menu]')].map(el=>el.outerHTML)})")); throw new Error('Timeout: ' + expr); };
  const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const textClick = label => browser.evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)});el.focus();el.click()})()`);
  const fill = (id, value) => browser.evaluate(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const key = async (key, code = key, modifiers = 0) => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers }); };
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: server.resolvedUrls.local[0] + 'dashboard' }); await wait("!!document.querySelector('.sidebar-account')");
  await browser.evaluate("document.querySelector('.sidebar-account').focus()"); await key('Enter');
  await wait("!!document.querySelector('[role=menu]')");
  assert.ok(await browser.evaluate("(()=>{const m=document.querySelector('.account-menu').getBoundingClientRect(),t=document.querySelector('.sidebar-account').getBoundingClientRect();return m.bottom<t.top})()"), 'Menu opens above the card');
  await key('ArrowDown'); await wait("document.activeElement?.getAttribute('role')==='menuitem'");
  await key('End'); assert.equal(await browser.evaluate('document.activeElement.textContent.trim()'), 'Sign out');
  await key('Home'); assert.equal(await browser.evaluate('document.activeElement.textContent.trim()'), 'Settings');
  await key('Escape'); await wait("!document.querySelector('[role=menu]')"); await pause(300);
  assert.ok(await browser.evaluate("document.activeElement.matches('.sidebar-account')"), 'Menu returns focus');
  await key('Enter'); await wait("!!document.querySelector('[role=menu]')"); await key('Home'); await key('Enter');
  await wait("location.pathname==='/settings' && document.querySelector('[role=switch]')?.checked===true");
  console.log('PASS: account menu and settings route');
  assert.ok(await browser.evaluate("document.querySelector('.sidebar-account').classList.contains('is-active')"));
  assert.ok(await browser.evaluate("!document.body.innerText.includes('Density factor') && !document.querySelector('#settings-operations')"), 'A name containing Super Admin never grants Operations');
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for (const width of [1280, 1920, 390]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }); await pause(300);
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Settings fits at ' + width);
    if(width===390) assert.ok(await browser.evaluate("document.querySelector('.settings-heading').getBoundingClientRect().top>=60"),'Mobile menu does not cover the page title');
    assert.ok(await browser.evaluate("(()=>{const t=document.querySelector('[data-slot=switch-thumb]').getBoundingClientRect(),c=document.querySelector('[data-slot=switch-control]').getBoundingClientRect();return t.left>=c.left&&t.right<=c.right})()"),'Switch thumb remains inside its track');
    const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(path.join(browser.directory, `settings-${width}.png`), Buffer.from(shot.data, 'base64'));
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.ok(await browser.evaluate("[...document.querySelectorAll('.settings-unavailable')].every(el=>el.getAttribute('aria-disabled')==='true')"),'Unsupported theme and language choices stay disabled');
  await click('a[href="#settings-notifications"]'); await wait("document.querySelector('.settings-section-nav [aria-current]')?.textContent==='Notifications'"); await pause(600);
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.settings-section-nav')).position"), 'sticky');
  await browser.evaluate("document.querySelector('[aria-label=\"Push notifications\"]').focus()"); await key(' ', 'Space');
  await wait("document.querySelector('.settings-toast')?.textContent==='Saved' && document.querySelector('[role=switch]').checked===false");
  assert.equal(settings.notifications.pushEnabled, false);
  failSave = true; await click('[role=switch]');
  await wait("!!document.querySelector('.settings-toast.error')");
  assert.equal(await browser.evaluate("document.querySelector('[role=switch]').checked"), false, 'Failed save rolls back');
  failSave = false;
  console.log('PASS: push preference save and rollback');
  assert.ok(await browser.evaluate("[...document.querySelectorAll('[role=switch]')].slice(1).every(el=>el.disabled||el.getAttribute('aria-disabled')==='true')"));
  await browser.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)'); await wait("document.querySelector('.settings-section-nav [aria-current]')?.textContent==='Security'");
  await textClick('Change password'); await wait("!!document.querySelector('.settings-dialog')"); await pause(300);
  await wait("document.activeElement.getAttribute('aria-label')==='Close change password'");
  assert.equal(await browser.evaluate("document.querySelector('.settings-dialog').getAttribute('aria-modal')"), 'true');
  for (let i = 0; i < 12; i++) { await key('Tab'); assert.ok(await browser.evaluate("!!document.activeElement.closest('.settings-dialog')"), 'Dialog traps keyboard focus'); }
  await fill('settings-currentPassword', 'old-secret'); await fill('settings-newPassword', 'short'); await fill('settings-confirmPassword', 'short'); await textClick('Save password');
  await wait("document.querySelector('.settings-error')?.textContent.includes('6 characters')");
  await fill('settings-newPassword', 'new-secret'); await fill('settings-confirmPassword', 'different'); await textClick('Save password'); await wait("document.querySelector('.settings-error')?.textContent.includes('do not match')");
  await fill('settings-confirmPassword', 'new-secret'); await click('[aria-label="Show new password"]'); assert.equal(await browser.evaluate("document.getElementById('settings-newPassword').type"), 'text');
  failSave = true; await textClick('Save password'); await wait("document.querySelector('.settings-error')?.textContent.includes('Test save failed')");
  assert.equal(await browser.evaluate("document.getElementById('settings-newPassword').value"), 'new-secret');
  failSave = false; await textClick('Save password'); await wait("!document.querySelector('.settings-dialog') && document.querySelector('.settings-toast')?.textContent==='Password changed'");
  assert.ok(writes.some(write => write.route.endsWith('change-password') && write.body.currentPassword === 'old-secret'));
  await textClick('Edit profile'); await wait("!!document.querySelector('#settings-profile-name')");
  await fill('settings-profile-name', 'Updated Admin'); profileFailure = true; await textClick('Save changes'); await wait("document.querySelector('.settings-error')?.textContent.includes('Test save failed')");
  assert.equal(await browser.evaluate("document.getElementById('settings-profile-name').value"), 'Updated Admin');
  profileFailure = false; await textClick('Save changes'); await wait("!document.querySelector('.settings-dialog') && document.querySelector('.sidebar-account-copy strong').textContent==='Updated Admin'");
  assert.equal(await browser.evaluate("JSON.parse(sessionStorage.getItem('resiklean_admin_user')).name"), 'Updated Admin');
  await textClick('Edit profile'); await wait("!!document.querySelector('.settings-dialog')"); await key('Escape'); await wait("!document.querySelector('.settings-dialog')");
  await pause(300); assert.equal(await browser.evaluate('document.activeElement.textContent.trim()'), 'Edit profile');
  await click('.sidebar-account'); await wait("!!document.querySelector('[role=menu]')");
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 30, button: 'left', clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 30, button: 'left', clickCount: 1 });
  await wait("!document.querySelector('[role=menu]')");
  await click('[data-page-link][aria-label="Manage Accounts"]'); await wait("location.pathname==='/dashboard' && location.search.includes('accounts')");
  failLoad = true; await browser.send('Page.navigate', { url: server.resolvedUrls.local[0] + 'settings' }); await wait("!!document.querySelector('.settings-load-error')");
  failLoad = false; await textClick('Retry'); await wait("!document.querySelector('.settings-load-error') && !document.querySelector('[role=switch]').disabled");
  await click('.sidebar-account'); await wait("!!document.querySelector('[role=menu]')"); await key('End'); await key('Enter'); await wait("document.body.innerText.includes('Sign out of your account') || !!document.querySelector('.logout-confirm-modal') || !!document.querySelector('.logout-modal')");
  await browser.evaluate("sessionStorage.setItem('resiklean_admin_user',JSON.stringify({name:'Staff',role:'staff'}))");
  await browser.send('Page.navigate',{url:server.resolvedUrls.local[0]+'settings'});await wait("location.pathname==='/login'");
  assert.deepEqual(errors, []);
  console.log('PASS: keyboard account menu, /settings routing, 1280/1920/mobile layout, scroll spy, role gating, push save + rollback, password validation/retry, profile save/retry, focus trap/return, load retry, sign-out confirmation. Screenshots: ' + browser.directory);
} finally { if (browser) await browser.close(); await server.close(); }
