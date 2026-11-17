// Render the actual native layer styles through the installed Mapbox GL engine.
// This catches expression/style errors and provides a visual proxy, not native FPS QA.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { openBrowser } from '../../web-dashboard/scripts/browser-check.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = process.env.DRIVER_MAP_QA_DIR || 'D:/RESIKLEAN-QA-TEMP/driver-map-restyle';
const require = createRequire(import.meta.url);
const { parse } = require('../../backend/node_modules/dotenv');
let token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
if (!token) { try { token = parse(await readFile(path.join(root, '.env'))).EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN; } catch {} }
if (!token) throw Error('Map preview requires the existing public Mapbox token; no native device preview was run.');
const fixture = JSON.parse(await readFile(path.join(directory, 'layers.json'), 'utf8'));
const kebab = value => value.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const paintSymbol = new Set(['textColor', 'textHaloColor', 'textHaloWidth']);
function convert(node, source) {
 const { id, style, filter, minZoomLevel, maxZoomLevel } = node.props;
 const type = node.type.replace('Layer', '').toLowerCase();
 const layer = { id, type, source, layout: {}, paint: {} };
 if (filter) layer.filter = filter;
 if (minZoomLevel != null) layer.minzoom = minZoomLevel;
 if (maxZoomLevel != null) layer.maxzoom = maxZoomLevel;
 for (const [key, value] of Object.entries(style)) {
  const layout = type === 'symbol' ? !paintSymbol.has(key) : ['lineCap', 'lineJoin'].includes(key);
  layer[layout ? 'layout' : 'paint'][kebab(key)] = value;
 }
 return layer;
}
const style = { version: 8, glyphs: 'http://127.0.0.1/glyphs/{fontstack}/{range}.pbf', sources: { route: { type: 'geojson', data: fixture.line }, stops: { type: 'geojson', data: fixture.shape, cluster: true, clusterRadius: 36, clusterMaxZoom: 16 } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#E9E8E3' } }, ...fixture.routeLayers.map(layer => convert(layer, 'route')), ...fixture.stopLayers.map(layer => convert(layer, 'stops'))] };
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/map.css"><style>body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div><script src="/map.js"></script><script>window.errors=[];mapboxgl.accessToken=${JSON.stringify(token)};window.map=new mapboxgl.Map({container:'map',style:${JSON.stringify(style)},center:[123.1809,13.6211],zoom:14,localFontFamily:'Arial',fadeDuration:0,logoPosition:'top-left',attributionControl:{compact:false},preserveDrawingBuffer:true});map.on('error',e=>window.errors.push(e.error.message.split(mapboxgl.accessToken).join('[redacted]')));map.on('load',()=>window.ready=true);</script>`;
const server = createServer(async (req, res) => {
 if (req.url === '/map.js' || req.url === '/map.css') { res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await readFile(path.join(root, 'node_modules/mapbox-gl/dist', req.url.endsWith('.js') ? 'mapbox-gl.js' : 'mapbox-gl.css'))); }
 else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
 browser = await openBrowser();
 const wait = async expression => { for (let i = 0; i < 100; i++) { const errors = await browser.evaluate('window.errors||[]'); assert.deepEqual(errors, []); if (await browser.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error('Timed out: ' + expression); };
 await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
 await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
 await wait('window.ready && map.loaded()');
 assert.ok(await browser.evaluate("map.queryRenderedFeatures({layers:['route-cluster']}).length>0"));
 await browser.evaluate("new Promise(resolve=>{map.once('render',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));map.triggerRepaint();})");
 await writeFile(path.join(directory, 'map-zoom-14.png'), Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
 await browser.evaluate('void map.jumpTo({zoom:17})'); await wait('map.loaded()');
 assert.equal(await browser.evaluate("map.queryRenderedFeatures({layers:['route-cluster']}).length"), 0);
 assert.ok(await browser.evaluate("map.queryRenderedFeatures({layers:['route-stop-collected-check']}).length>0"));
 assert.ok(await browser.evaluate("map.queryRenderedFeatures({layers:['route-stop-next-number']}).length>0"));
 await browser.evaluate("new Promise(resolve=>{map.once('render',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));map.triggerRepaint();})");
 await writeFile(path.join(directory, 'map-zoom-17.png'), Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
 await browser.evaluate(`void map.getSource('stops').setData(${JSON.stringify(fixture.advanced)})`); await wait('map.loaded()');
 assert.ok(await browser.evaluate("map.queryRenderedFeatures({layers:['route-stop-collected']}).some(f=>f.properties.stopId==='stop-2')"));
 await browser.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
 await browser.evaluate('map.resize();void map.jumpTo({zoom:16})'); await wait('map.loaded()');
 assert.ok(await browser.evaluate("!!document.querySelector('.mapboxgl-ctrl-logo')"));
 assert.ok(await browser.evaluate("!!document.querySelector('.mapboxgl-ctrl-attrib')"));
 await browser.evaluate("new Promise(resolve=>{map.once('render',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))));map.triggerRepaint();})");
 await writeFile(path.join(directory, 'map-360.png'), Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
 console.log('PASS: real Mapbox GL accepts native-layer expressions; clustered zoom 14 and individual zoom 17; checkmarks/next numbers; collected updates; 360px viewport and attribution. Native Android smoothness still needs device QA.');
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
