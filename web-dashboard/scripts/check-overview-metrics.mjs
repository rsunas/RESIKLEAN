// Isolated UI fixtures only. Production components always request the admin API.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { openBrowser } from './browser-check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const requests = [];
let mode = 'data';
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/__overview-api') }, plugins: [{ name: 'overview-qa',
  resolveId(id) { if (id === '/__overview.js') return '\0overview-qa'; },
  load(id) { if (id === '\0overview-qa') return `import React from 'react';import {createRoot} from 'react-dom/client';import OverviewMetrics from '/src/components/overview/OverviewMetrics.jsx';import '/src/index.css';createRoot(document.getElementById('root')).render(React.createElement(OverviewMetrics,{token:'qa-only'}));`; },
  configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
    if (req.url.startsWith('/__overview-api')) {
      const url = new URL(req.url, 'http://localhost'); requests.push(url);
      const empty = mode === 'empty';
      const base = { start: '2026-11-12', end: '2026-11-18', lastSyncedAt: empty ? null : '2026-11-18T02:42:00Z', incomplete: false };
      let data;
      if (url.pathname.endsWith('/coverage')) data = { ...base, scheduled: 14, completed: 9, remaining: 5, rate: 64.3, areas: ['Dayangdang', 'Tinago'], routes: empty ? [] : [{ key: 'actual-route-id', name: 'Area 4 Collection Route', scheduled: 14, completed: 9, remaining: 5, rate: 64.3 }] };
      if (url.pathname.endsWith('/daily-completion')) data = { ...base, average: 64.3, best: 64.3, todayRate: 64.3, delta: 3.2, days: Array.from({ length: url.searchParams.get('range') === '14d' ? 14 : 7 }, (_, i) => ({ date: `2026-11-${String(18 - i).padStart(2, '0')}`, rate: empty ? null : 64.3, completed: empty ? 0 : 9, scheduled: empty ? 0 : 14 })).reverse() };
      if (url.pathname.endsWith('/complaints-by-status')) data = { ...base, range: url.searchParams.get('range'), total: empty ? 0 : 4, statuses: ['pending', 'verified', 'resolved', 'rejected'].map(status => ({ status, count: empty ? 0 : 1, percent: empty ? 0 : 25 })) };
      if (url.pathname.endsWith('/stops-by-hour')) data = { ...base, total: empty ? 0 : 9, peakHour: empty ? null : 6, hours: empty ? [] : [{ hour: 5, count: 3 }, { hour: 6, count: 6 }] };
      if (url.pathname.endsWith('/frequently-uncompleted')) data = { ...base, stops: empty ? [] : [{ key: 'stop-id', name: 'Blumentritt', route: 'Area 4 Collection Route', missed: 3 }] };
      res.statusCode = mode === 'error' ? 503 : 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: mode !== 'error', data, error: 'Metrics test service unavailable' }));
    } else if (req.url === '/__overview') {
      res.setHeader('Content-Type', 'text/html');
      res.end(await vite.transformIndexHtml(req.url, '<html><body style="margin:0;padding:24px;background:#eef1f0"><div id="root"></div><script type="module" src="/__overview.js"></script></body></html>'));
    } else next();
  }); },
}] });
let browser;
try {
  await server.listen(); browser = await openBrowser();
  const errors = [];
  browser.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.text));
  const wait = async expression => {
    for (let i = 0; i < 600; i++) { assert.deepEqual(errors, []); if (await browser.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error(`Timed out: ${expression}`);
  };
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/__overview` });
  await wait("document.querySelectorAll('.om-card').length === 5 && !document.querySelector('.om-skeleton') && !!document.querySelector('.om-route-row')");
  assert(await browser.evaluate("document.querySelector('.om-route-row').textContent.includes('Area 4 Collection Route')"));
  await browser.evaluate("document.querySelector('.om-card[aria-labelledby=\"om-complaints-title\"] .app-select button').click()");
  await wait("[...document.querySelectorAll('[role=option]')].some(option => option.textContent.trim() === 'Last 7 days')");
  await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(option => option.textContent.trim() === 'Last 7 days').click()");
  await wait("document.querySelector('.om-card[aria-labelledby=\"om-complaints-title\"] p').textContent.includes('Last 7 days')");
  await wait("!document.querySelector('.om-card[aria-labelledby=\"om-complaints-title\"] .om-skeleton')");
  assert(requests.some(url => url.pathname.endsWith('complaints-by-status') && url.searchParams.get('range') === '7d'));
  const screenshot = async name => {
    await mkdir(`${root}/dist/qa`, { recursive: true });
    const result = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(`${root}/dist/qa/${name}.png`, Buffer.from(result.data, 'base64'));
  };
  await screenshot('overview-desktop');
  await browser.evaluate("document.querySelectorAll('.om-segmented button')[1].click()");
  await wait("!document.querySelector('.om-skeleton') && document.querySelectorAll('.om-segmented button')[1].getAttribute('aria-pressed') === 'true'");
  for (const endpoint of ['coverage', 'stops-by-hour']) assert(requests.some(url => url.pathname.endsWith(endpoint) && url.searchParams.get('range') === '7d'));
  assert(requests.some(url => url.pathname.endsWith('complaints-by-status') && url.searchParams.get('range') === 'all'));
  await browser.evaluate("document.querySelector('.om-data summary').click()");
  assert(await browser.evaluate("document.querySelector('.om-data[open] table').textContent.includes('64.3%')"));
  // Recharts keyboard navigation must expose an exact tooltip value.
  await browser.evaluate("document.querySelector('.om-chart [tabindex=\"0\"]').focus()");
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await wait("[...document.querySelectorAll('.recharts-tooltip-wrapper')].some(el => getComputedStyle(el).visibility === 'visible' && el.textContent.includes('64.3'))");
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Narrow-screen overflow check:', await browser.evaluate("JSON.stringify({width:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('.overview-metrics *')].filter(el=>el.getBoundingClientRect().right>390).slice(0,12).map(el=>({tag:el.tagName,class:el.getAttribute('class'),right:el.getBoundingClientRect().right}))})"));
  await screenshot('overview-mobile');
  await wait("document.documentElement.scrollWidth <= 390");
  assert(await browser.evaluate("getComputedStyle(document.querySelector('.om-grid')).gridTemplateColumns.split(' ').length === 1"));
  await screenshot('overview-mobile');
  await browser.evaluate("document.documentElement.dataset.theme='dark'");
  assert.equal(await browser.evaluate("getComputedStyle(document.querySelector('.om-card')).backgroundColor"), 'rgb(26, 36, 32)');
  await screenshot('overview-dark');
  mode = 'empty'; await browser.send('Page.reload');
  await wait("document.querySelectorAll('.om-empty').length === 4");
  assert(await browser.evaluate("!!document.querySelector('.om-pie-empty[aria-label*=\"Empty complaint status\"]')"));
  assert(await browser.evaluate("document.body.textContent.includes('No scheduled stops for this range')"));
  mode = 'error'; await browser.send('Page.reload');
  await wait("document.querySelectorAll('.om-empty[role=alert]').length === 5");
  mode = 'data'; await browser.evaluate("document.querySelector('.om-empty button').click()");
  await wait("!!document.querySelector('.om-route-row')");
  assert.deepEqual(errors, []);
  console.log('PASS: five cards, real-name rendering, shared range requests, keyboard tooltip, exact values, narrow layout, dark colors, empty/error/retry states. Screenshots: dist/qa/overview-*.png');
} finally { if (browser) await browser.close(); await server.close(); }
