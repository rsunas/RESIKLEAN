// Browser fixtures are isolated from the real API; no notices are sent to users.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const AREA = '000000000000000000000002', TRUCK = '000000000000000000000003';
let items = [], uploads = [], apiError = false;
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__ann-api') }, plugins: [{ name: 'announcements-qa',
  resolveId(id) { if (id === '/__ann.js') return '\0ann-qa'; },
  load(id) { if (id === '\0ann-qa') return `import React from 'react';import {createRoot} from 'react-dom/client';import AnnouncementsPage from '/src/pages/AnnouncementsPage.jsx';import '/src/index.css';createRoot(document.getElementById('root')).render(React.createElement(AnnouncementsPage,{token:'qa-only'}));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__ann-api')) {
      res.setHeader('Content-Type', 'application/json');
      if (apiError) { res.statusCode = 503; res.end(JSON.stringify({ success: false, error: 'Test service unavailable' })); return; }
      const url = new URL(req.url, 'http://localhost');
      let data;
      if (url.pathname.endsWith('/options')) data = { areas: [{ _id: AREA, name: 'Area 4 Collection Route' }], trucks: [{ _id: TRUCK, truckNumber: '57', plateNumber: 'SNA-1478' }] };
      else if (req.method === 'POST' || req.method === 'PATCH') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
        const values = Object.fromEntries(form);
        const existing = req.method === 'PATCH' ? items.find(item => url.pathname.endsWith(item._id)) : null;
        const file = form.get('image'); if (file) uploads.push({ size: file.size, type: file.type });
        data = { ...existing, ...values, _id: existing?._id || '000000000000000000000004', __v: (existing?.__v ?? -1) + 1 };
        if (values.areaId) data.areaId = values.areaId === 'all' ? null : { _id: AREA, name: 'Area 4 Collection Route' };
        data.areaLabel = data.areaId ? 'Area 4 Collection Route' : 'All areas';
        if (values.affectedTruckId !== undefined) data.affectedTruckId = values.affectedTruckId ? { _id: TRUCK, truckNumber: '57' } : null;
        if (values.date) data.scheduledFor = new Date(`${values.date}T${values.time}:00+08:00`).toISOString();
        if (file) data.imageUrl = '/src/assets/announcement-bg-blurred.jpg';
        delete data.image; items = [data, ...items.filter(item => item._id !== data._id)];
      } else if (req.method === 'DELETE') { items = items.filter(item => !url.pathname.endsWith(item._id)); data = { deleted: true }; }
      else data = { items, total: items.length, page: 1, limit: 10 };
      res.end(JSON.stringify({ success: true, data }));
    } else if (req.url === '/__announcements') {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<html><body style="padding:28px;background:#eef1f0"><div id="root"></div><script type="module" src="/__ann.js"></script></body></html>'));
    } else next();
  }); },
}] });
let browser;
try {
  await server.listen(); browser = await openBrowser();
  const errors = [];
  browser.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.text));
  const wait = async expression => {
    for (let i = 0; i < 300; i++) { assert.deepEqual(errors, []); if (await browser.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error(`Timed out: ${expression}\n${await browser.evaluate("document.body.innerText.slice(0, 2500)")}`);
  };
  const button = (text, parent = 'document') => browser.evaluate(`(() => { const button = [...${parent}.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}); button.focus(); button.click(); })()`);
  const select = async (label, option) => {
    await browser.evaluate(`document.querySelector('button[aria-label=${JSON.stringify(`Show ${label} suggestions`)}]').click()`);
    await wait("!!document.querySelector('[role=option]')");
    await browser.evaluate(`[...document.querySelectorAll('[role=option]')].find(item => item.textContent.trim() === ${JSON.stringify(option)}).click()`);
    await wait("!document.querySelector('[role=option]')");
  };
  const screenshot = async name => {
    await mkdir(`${root}/dist/qa`, { recursive: true });
    const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(`${root}/dist/qa/${name}.png`, Buffer.from(result.data, 'base64'));
  };
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/__announcements` });
  await wait("!!document.querySelector('.ann-composer fieldset:not(:disabled)') && !document.querySelector('.ann-skeleton')");
  assert(await browser.evaluate("document.querySelector('.ann-recent').textContent.includes('No announcements yet')"));
  await browser.evaluate("window.downloadCount = 0; HTMLAnchorElement.prototype.click = function() { if (this.download) window.downloadCount++; }; ");
  const enter = async (label, value) => {
    await browser.evaluate(`(() => { const input = document.getElementById([...document.querySelectorAll('label')].find(label => label.textContent === ${JSON.stringify(label)}).htmlFor); input.focus(); input.select(); })()`);
    await browser.send('Input.insertText', { text: value });
  };
  await enter('Type', 'Local advisory');
  await enter('Reason', 'Vehicle inspection');
  await enter('Impact', 'Collection starts two hours later');
  assert(await browser.evaluate("document.querySelector('#ann-message').value.includes('Vehicle inspection') && document.querySelector('#ann-message').value.includes('Collection starts two hours later')"));
  await enter('Area', 'Area 4');
  await wait("!!document.querySelector('[role=option]')");
  await wait("document.querySelectorAll('[role=option]').length > 0 && [...document.querySelectorAll('[role=option]')].every(item => item.textContent.includes('Area 4'))");
  await browser.evaluate("document.querySelector('[role=option]').click()");
  await select('Area', 'Area 4 Collection Route');
  await select('Affected truck (internal only)', 'Truck 57 · SNA-1478');
  assert(await browser.evaluate("document.querySelector('#ann-message').value.includes('Area 4 Collection Route')"));
  assert(await browser.evaluate("!document.querySelector('.announcement-canvas').textContent.includes('Truck')"));
  await browser.evaluate("const textarea = document.querySelector('#ann-message'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Please keep your waste secured.'); textarea.dispatchEvent(new Event('input', {bubbles:true}));");
  await button('Bad weather');
  assert.equal(await browser.evaluate("document.querySelector('#ann-message').value"), 'Please keep your waste secured.');
  await button('↻ Regenerate');
  assert(await browser.evaluate("document.querySelector('#ann-message').value.includes('bad weather')"));
  await screenshot('announcements-desktop');
  await browser.evaluate("const originalCreateURL = URL.createObjectURL; URL.createObjectURL = function(blob) { window.lastDownload = blob; return originalCreateURL.call(URL, blob); };");
  await button('↓ Download image');
  await wait("!!window.lastDownload && !document.querySelector('.ann-composer fieldset').disabled");
  const image = await browser.evaluate("(async () => { const bytes = new Uint8Array(await window.lastDownload.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return { data: btoa(binary), size: window.lastDownload.size, type: window.lastDownload.type }; })()");
  assert.equal(image.type, 'image/jpeg'); assert(image.size < 1024 * 1024); assert(image.size > 20000);
  const buffer = Buffer.from(image.data, 'base64');
  const metadata = await sharp(buffer).metadata(); assert.equal(metadata.width, 2400); assert.equal(metadata.height, 1350);
  await writeFile(`${root}/dist/qa/announcement-export.jpg`, buffer);
  await button('Save draft');
  await wait("document.querySelector('.ann-status')?.textContent === 'Draft' && !document.querySelector('.ann-composer fieldset').disabled");
  assert.equal(items.length, 1); assert.equal(items[0].areaLabel, 'Area 4 Collection Route'); assert.equal(items[0].affectedTruckId.truckNumber, '57'); assert.equal(uploads.length, 0);
  await button('Publish announcement');
  await wait("document.querySelector('.ann-status')?.textContent === 'Published' && !document.querySelector('.ann-composer fieldset').disabled");
  assert.equal(uploads.length, 1); assert(uploads[0].size < 1024 * 1024);
  assert.equal(await browser.evaluate('window.downloadCount'), 1, 'Only the explicit Download image action downloads a file');
  await button('View', "document.querySelector('.ann-recent')");
  await wait("!!document.querySelector('.ann-view-image')");
  await button('Close', "document.querySelector('.ann-dialog')");
  await button('Unpublish');
  await wait("!!document.querySelector('.ann-dialog')");
  await button('Confirm', "document.querySelector('.ann-dialog')");
  await wait("document.querySelector('.ann-status')?.textContent === 'Draft' && !document.querySelector('.ann-dialog')");
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await wait("!document.querySelector('.ann-composer fieldset').disabled");
  await screenshot('announcements-narrow');
  assert(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'));
  assert(await browser.evaluate("[...document.querySelectorAll('.ann-form-actions button')].every(button => button.getBoundingClientRect().right <= document.querySelector('.ann-composer').getBoundingClientRect().right - 15)"));
  await browser.evaluate("document.documentElement.dataset.theme = 'dark'; document.body.style.background = '#101815'");
  await screenshot('announcements-dark');
  await button('Delete'); await wait("!!document.querySelector('.ann-dialog')");
  await button('Confirm', "document.querySelector('.ann-dialog')");
  await wait("document.querySelector('.ann-recent').textContent.includes('No announcements yet')");
  apiError = true; await button('Refresh');
  await wait("document.querySelector('.ann-recent').textContent.includes('Could not load announcements')");
  apiError = false; await button('Retry', "document.querySelector('.ann-recent')");
  await wait("document.querySelector('.ann-recent').textContent.includes('No announcements yet')");
  assert.deepEqual(errors, []);
  console.log(`Announcements browser checks passed; JPEG ${metadata.width}×${metadata.height}, ${Math.round(image.size / 1024)} KB. Screenshots: dist/qa.`);
} finally { await browser?.close(); await server.close(); }
