// Exercise the actual route editor with local fixture responses; no live API writes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['Abella', 'Bagumbayan Norte', 'Bagumbayan Sur', 'Balatas', 'Calauag', 'Cararayan', 'Carolina', 'Concepcion Pequeña', 'Dayangdang', 'Del Rosario', 'Liboton', 'Mabolo', 'Pacol', 'Peñafrancia', 'Sabang', 'San Francisco', 'San Isidro', 'Triangulo'];
const route = { _id: 'test-route', name: 'Test route', barangay: ['Abella'], schedule: [1], stops: [{ _id: 'stop-1', name: 'Test stop', order: 1, longitude: 123.18, latitude: 13.62 }], routePath: { type: 'LineString', coordinates: [[123.18, 13.62], [123.19, 13.63]] } };
let failLocations = false;
const saved = [];
const assignmentRequests = [];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 },
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__barangay-api'), 'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify('') },
  plugins: [{ name: 'barangay-browser-fixture',
    resolveId(id) { if (id === '/__barangay-check.js') return '\0barangay-check'; },
    load(id) { if (id === '\0barangay-check') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import Panel from '/src/components/RouteManagementPanel.jsx'; import '/src/index.css'; createRoot(document.getElementById('root')).render(React.createElement(Panel, {token:'test'}));`; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
      if (req.url === '/__barangay-check') {
        res.setHeader('Content-Type', 'text/html');
        res.end(await vite.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__barangay-check.js"></script></body></html>'));
      } else if (req.url.startsWith('/__barangay-api/')) {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.includes('collection-locations')) {
          assert.ok(req.url.includes('type=barangay'));
          res.statusCode = failLocations ? 503 : 200;
          res.end(JSON.stringify({ success: !failLocations, data: names.map(name => ({ name, type: 'barangay' })) }));
        } else if (req.method === 'PATCH' || req.method === 'POST') {
          let body = ''; for await (const chunk of req) body += chunk;
          if (req.url.endsWith('/assign')) assignmentRequests.push(JSON.parse(body));
          else saved.push(JSON.parse(body));
          res.end(JSON.stringify({ success: true, data: { ...route, ...JSON.parse(body), _id: req.method === 'POST' ? 'created-route' : route._id } }));
        } else res.end(JSON.stringify({ success: true, data: req.url.endsWith('/users') ? { users: [] } : { routes: [route] } }));
      } else next();
    }); },
  }],
});
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await server.listen();
  browser = await openBrowser();
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${server.resolvedUrls.local[0]}__barangay-check` });
  async function waitFor(expression) {
    for (let i = 0; i < 150; i++) { if (await browser.evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  }
  const click = selector => browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = 'document.querySelector("[role=combobox]")';
  const options = () => browser.evaluate('[...document.querySelectorAll("[role=option]")].map(el=>el.textContent)');
  const type = async value => {
    await browser.evaluate(`${input}.focus(); ${input}.select()`);
    await browser.send('Input.insertText', { text: value });
    await pause(60);
  };
  const key = async (key, code) => {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
    await pause(60);
  };
  await waitFor('!!document.querySelector(".route-row-actions button")');
  await click('.route-add-button');
  await waitFor('document.activeElement?.getAttribute("placeholder")?.startsWith("e.g. Area 1")');
  for (const [width, height] of [[1280, 720], [1920, 1080], [768, 900], [360, 800]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await pause(250);
    const layout = await browser.evaluate(`(()=>{const d=document.querySelector('.route-editor-modal'),r=d.getBoundingClientRect(),f=document.querySelector('.route-editor-footer').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,footer:f.bottom,overflow:d.scrollWidth>d.clientWidth}})()`);
    assert.ok(layout.x >= -1 && layout.y >= -1 && layout.right <= width + 1 && layout.bottom <= height + 1, JSON.stringify(layout));
    assert.ok(!layout.overflow && layout.footer <= height + 1, 'Dialog and footer fit the viewport');
    if (width >= 1024) assert.ok(Math.abs(layout.width - Math.min(1240, width - 48)) < 2, 'Desktop dialog width');
  }
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await browser.evaluate("document.querySelector('.route-editor-footer button[type=submit]').focus()");
  await key('Tab', 9);
  assert.ok(await browser.evaluate("document.querySelector('.route-editor-modal').contains(document.activeElement)"), 'Focus stays inside dialog');
  await click('.route-stops-heading button');
  await key('Escape', 27);
  assert.ok(await browser.evaluate("!!document.querySelector('.route-editor-modal') && document.querySelector('.route-stops-heading button').getAttribute('aria-pressed')==='false'"), 'Escape leaves stop mode first');
  await key('Escape', 27);
  await waitFor("!document.querySelector('.route-editor-modal')");
  await waitFor("document.activeElement?.classList.contains('route-add-button')");
  await click('.route-add-button');
  // Real outside clicks dismiss an untouched form but preserve edited data.
  await pause(250);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await waitFor("!document.querySelector('.route-editor-modal')");
  await click('.route-add-button');
  assert.equal(await browser.evaluate('document.querySelector(".route-editor-form").textContent.includes("Assigned driver")'), false, 'Assignments are managed outside the route editor');
  await type('san');
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 4, y: 4, button: 'left', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  assert.ok(await browser.evaluate("!!document.querySelector('.route-editor-modal')"), 'Dirty form does not dismiss on backdrop click');
  await type('san');
  await waitFor('document.querySelectorAll("[role=option]").length===2');
  assert.deepEqual(await options(), ['San Francisco', 'San Isidro']);
  await key('ArrowDown', 40);
  assert.ok(await browser.evaluate(`${input}.getAttribute('aria-activedescendant')`), 'ArrowDown highlights an option');
  await key('Enter', 13);
  assert.equal(await browser.evaluate(`${input}.value`), 'San Francisco, ');
  assert.equal(saved.length, 0, 'Enter selects a suggestion without submitting the route');
  await type('San Francisco, pen');
  assert.deepEqual(await options(), ['Peñafrancia']);
  await click('[role=option]');
  assert.equal(await browser.evaluate(`${input}.value`), 'San Francisco, Peñafrancia, ');
  await click('.barangay-combobox-toggle');
  assert.ok(!(await options()).includes('San Francisco'), 'Already entered names are excluded');
  assert.ok(await browser.evaluate('document.querySelector("[role=listbox]").scrollHeight > document.querySelector("[role=listbox]").clientHeight'), 'Full list can be scrolled');
  await type('xyz');
  assert.equal((await options()).length, 0);
  await click('.barangay-combobox-toggle');
  assert.equal((await options()).length, names.length, 'Arrow shows all options even with a typed query');
  await key('ArrowUp', 38); await key('Enter', 13);
  assert.equal(await browser.evaluate(`${input}.value`), 'Triangulo, ');
  await type('san, Triangulo');
  await key('Home', 36);
  await waitFor('document.querySelectorAll("[role=option]").length===2');
  await key('ArrowDown', 40); await key('Enter', 13);
  assert.equal(await browser.evaluate(`${input}.value`), 'San Francisco, Triangulo');
  await type('san'); await key('Escape', 27);
  assert.equal(await browser.evaluate(`${input}.getAttribute('aria-expanded')`), 'false');
  await click('[aria-label="Close route editor"]');

  // Keep existing route data intact; accept manually entered names on save.
  await click('[aria-label="Edit Test route"]');
  assert.equal(await browser.evaluate(`${input}.value`), 'Abella');
  await type('Abella, Custom collection area');
  await click('.route-shift-select [data-slot="select-trigger"]');
  await waitFor("!!document.querySelector('.route-shift-popover [role=option]')");
  await browser.evaluate("[...document.querySelectorAll('.route-shift-popover [role=option]')].find(el=>el.textContent==='PM').click()");
  await waitFor("document.querySelector('.route-shift-select [data-slot=select-value]').textContent==='PM'");
  await key('Tab', 9);
  await click('.route-editor-footer button[type=submit]');
  await waitFor('!document.querySelector("[role=combobox]")');
  assert.deepEqual(saved[0].barangay, ['Abella', 'Custom collection area']);
  assert.deepEqual(saved[0].routePath, route.routePath);
  assert.equal(saved[0].shift, 'PM', 'Selected route shift is sent to the backend');

  await click('.route-add-button');
  await browser.evaluate("document.querySelector('.route-name-control input').focus()");
  await browser.send('Input.insertText', { text: 'Imported route' });
  await type('Abella'); await key('Tab', 9);
  await click('.route-day-buttons button');
  await click('.route-editor-footer button[type=submit]');
  await waitFor("document.querySelector('.route-editor-error')?.textContent.includes('route path')");
  const geojson = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: route.routePath, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [123.18, 13.62] }, properties: { name: 'First stop', order: 1 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [123.19, 13.63] }, properties: { name: 'Second stop', order: 2 } },
  ] };
  assert.equal(await browser.evaluate("document.querySelector('.route-advanced-options').open"), false, 'Advanced options start collapsed');
  await click('.route-advanced-options summary');
  assert.equal(await browser.evaluate("document.querySelector('.route-advanced-options').open"), true, 'Advanced options reveal the import button');
  await browser.evaluate(`(()=>{const input=document.querySelector('.route-import-row input'),data=new DataTransfer();data.items.add(new File([${JSON.stringify(JSON.stringify(geojson))}],'route.geojson',{type:'application/geo+json'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("document.querySelectorAll('.route-stop-editor').length===2");
  await click('[aria-label="Move stop down"]');
  assert.equal(await browser.evaluate("document.querySelector('[aria-label=\"Stop 1 name\"]').value"), 'Second stop');
  await click('[aria-label="Remove stop"]');
  assert.equal(await browser.evaluate("document.querySelector('[aria-label=\"Stop 1 name\"]').value"), 'First stop');
  await click('.route-editor-footer button[type=submit]');
  await waitFor("!document.querySelector('.route-editor-modal')");
  assert.equal(saved[1].name, 'Imported route');
  assert.equal(saved[1].stops.length, 1);
  assert.equal(saved[1].stops[0].order, 1);
  assert.equal(saved[1].shift, null, 'New routes may leave the shift unset');
  assert.deepEqual(saved[1].routePath, route.routePath);

  failLocations = true;
  await click('.route-add-button');
  await type('Custom place');
  await waitFor('!!document.querySelector(".barangay-combobox-feedback")');
  assert.equal(await browser.evaluate(`${input}.value`), 'Custom place');
  failLocations = false;
  await click('.barangay-combobox-feedback button');
  await type('san');
  await waitFor('document.querySelectorAll("[role=option]").length===2');
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
  await pause(250);
  assert.ok(await browser.evaluate('(()=>{const r=document.querySelector(".barangay-combobox-popup").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()'), 'Dropdown fits at 360px');
  assert.equal(assignmentRequests.length, 0, 'Route edits must not change collector assignments');
  assert.ok(saved.length > 0 && saved.every(payload => !Object.hasOwn(payload, 'collectorId')), 'Route payloads do not include assignment changes');
  console.log('PASS: responsive modal, focus trap/return, Escape stop mode, dirty backdrop, validation, GeoJSON import, reorder/remove, AM/PM save, unchanged assignment, barangay dropdown and API retry');
} finally { if (browser) await browser.close(); await server.close(); }
