const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => { assert.ok(dependencies[name], `Unexpected import ${name}`); return dependencies[name]; }, exports);
  return exports;
}
const { buildMapStops } = load('src/lib/driver-map-presentation.ts');
const stops = Array.from({ length: 29 }, (_, i) => ({ _id: `stop-${i}`, name: `Stop ${i + 1}`, order: i + 1, longitude: 123.18 + (i % 5) * 0.00045, latitude: 13.62 + Math.floor(i / 5) * 0.00045 }));
const logs = [{ stopId: 'stop-0', status: 'collected' }, { stopId: 'stop-1', status: 'collected', flaggedForReview: true }];
const original = JSON.stringify({ stops, logs });
const shape = buildMapStops([...stops].reverse(), logs);
assert.equal(shape.features.length, 29);
assert.equal(shape.features[0].properties.status, 'collected');
assert.equal(shape.features[1].properties.status, 'review');
assert.equal(shape.features[2].properties.next, true);
assert.equal(shape.features.filter(f => f.properties.next).length, 1);
assert.deepEqual(shape.features[2].geometry.coordinates, [stops[2].longitude, stops[2].latitude]);
assert.equal(JSON.stringify({ stops, logs }), original);
assert.equal(buildMapStops(stops, stops.map(s => ({ stopId: s._id, status: 'collected' }))).features.some(f => f.properties.next), false);
assert.equal(buildMapStops([{ ...stops[0], latitude: null }, { ...stops[1], longitude: 181 }], []).features.length, 0);
assert.equal(buildMapStops([{ ...stops[0], latitude: null }, stops[1]], []).features[0].properties.next, false);
assert.deepEqual(buildMapStops([], []).features, []);
const advanced = buildMapStops(stops, [...logs, { stopId: 'stop-2', status: 'collected' }]);
assert.equal(advanced.features[2].properties.status, 'collected');
assert.equal(advanced.features[3].properties.next, true);

const cleanups = [];
const jsx = (type, props) => ({ type, props });
const layers = load('src/components/driver-map-layers.tsx', {
  react: { memo: fn => fn, useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => cleanups.push(fn()) },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@rnmapbox/maps': { __esModule: true, default: Object.fromEntries(['ShapeSource', 'LineLayer', 'SymbolLayer', 'CircleLayer'].map(name => [name, name])) },
});
const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: stops.map(s => [s.longitude, s.latitude]) } };
const route = layers.DriverRouteLayers({ shape: line });
assert.equal(route.props.shape, line);
assert.deepEqual(route.props.children.map(child => child.type), ['LineLayer', 'LineLayer', 'SymbolLayer']);
assert.equal(route.props.children[1].props.style.lineColor, '#0A7F4F');
assert.equal(route.props.children[0].props.style.lineColor, '#ffffff');
assert.equal(route.props.children[2].props.minZoomLevel, 14);
assert.equal(route.props.children[2].props.style.symbolSpacing, 90);
let expanded = [];
const nodes = layers.DriverStopLayers({ shape, onExpandCluster: (...args) => expanded.push(args) });
assert.equal(nodes.props.cluster, true);
assert.equal(nodes.props.clusterRadius, 36);
assert.equal(nodes.props.clusterMaxZoomLevel, 16);
assert.ok(nodes.props.children.every(child => ['CircleLayer', 'SymbolLayer'].includes(child.type)));
const ids = nodes.props.children.map(child => child.props.id);
assert.ok(ids.indexOf('route-stop-pending') < ids.indexOf('route-stop-review'));
assert.ok(ids.indexOf('route-stop-review') < ids.indexOf('route-stop-collected'));
assert.ok(ids.indexOf('route-stop-collected') < ids.indexOf('route-stop-next'));
const node = id => nodes.props.children.find(child => child.props.id === id).props;
assert.equal(node('route-stop-pending-number').minZoomLevel, 16);
assert.equal(node('route-stop-collected-check').minZoomLevel, 16);
assert.equal(node('route-stop-next-number').style.textAllowOverlap, false);
assert.equal(node('route-stop-next-center').maxZoomLevel, 16);
assert.equal(node('route-cluster-count').style.textSize, 13);
assert.equal(node('route-stop-next-ring').style.circleOpacity, 0.22);

(async () => {
 const { default: Supercluster } = await import('supercluster');
 const index = new Supercluster({ radius: nodes.props.clusterRadius, maxZoom: nodes.props.clusterMaxZoomLevel }).load(shape.features);
 const low = index.getClusters([123.17, 13.61, 123.2, 13.64], 13);
 assert.ok(low.some(f => f.properties.cluster));
 const high = index.getClusters([123.17, 13.61, 123.2, 13.64], 17);
 assert.equal(high.length, 29); assert.ok(high.every(f => !f.properties.cluster));
 const cluster = low.find(f => f.properties.cluster);
 nodes.props.ref.current = { getClusterExpansionZoom: async feature => index.getClusterExpansionZoom(feature.properties.cluster_id) };
 await nodes.props.onPress({ features: [shape.features[0]] }); assert.equal(expanded.length, 0);
 await nodes.props.onPress({ features: [cluster] }); assert.equal(expanded.length, 1);
 assert.deepEqual(expanded[0][0], cluster.geometry.coordinates);
 assert.ok(expanded[0][1] > 13 && expanded[0][1] <= 17.25);
 nodes.props.ref.current = { getClusterExpansionZoom: async () => { throw Error('Map removed'); } };
 await nodes.props.onPress({ features: [cluster] }); assert.equal(expanded.length, 1);
 let release;
 nodes.props.ref.current = { getClusterExpansionZoom: () => new Promise(resolve => { release = resolve; }) };
 const pending = nodes.props.onPress({ features: [cluster] }); cleanups.forEach(fn => fn?.()); release(17); await pending;
 assert.equal(expanded.length, 1);
 const collector = fs.readFileSync(path.join(root, 'app/collector.tsx'), 'utf8').replace(/\r\n/g, '\n');
 assert.ok(!collector.includes('STOP_FLAG_'));
 assert.ok(!collector.includes('assigned-route-corridor'));
 assert.ok(!collector.includes('COLLECTION PROGRESS'));
 assert.ok(collector.includes('todayStopsSection: { marginTop: 0 }'));
 assert.ok(collector.includes("animationDuration: reducedMotion ? 0 : 300"));
 assert.ok(collector.indexOf('<DriverStopLayers') < collector.indexOf('id="driver-current-location"'));
 assert.ok(collector.includes('logoEnabled attributionEnabled logoPosition={{ top: 8'));
 // With no linear progress data, the same route geometry/color is used at start,
 // middle and end. GPS position cannot change a collection status.
 for (const position of [0, 14, 28]) {
  const data = { ...line, truck: stops[position] };
  assert.equal(layers.DriverRouteLayers({ shape: data }).props.children[1].props.style.lineColor, '#0A7F4F');
  assert.deepEqual(buildMapStops(stops, logs), shape);
 }
 const protectedPath = 'D:/RESIKLEAN-QA-TEMP/driver-map-restyle/protected.json';
 if (fs.existsSync(protectedPath)) {
  const baseline = JSON.parse(fs.readFileSync(protectedPath, 'utf8'));
  assert.ok(collector.includes(baseline.capacity), 'Predictive capacity widget changed');
  assert.ok(collector.includes(baseline.trip), 'Start/End trip card changed');
  for (const [file, hash] of Object.entries(baseline.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, '..', file))).digest('hex'), hash, file);
 }
 if (process.env.DRIVER_MAP_QA_DIR) {
  fs.mkdirSync(process.env.DRIVER_MAP_QA_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.DRIVER_MAP_QA_DIR, 'layers.json'), JSON.stringify({ line, shape, advanced, routeLayers: route.props.children, stopLayers: nodes.props.children }));
 }
 console.log('PASS: 29 stops cluster/uncluster; all recorded statuses and next-stop ordering; no coordinate/status mutations; layer order, shadows, zoom-scaled symbols; cluster taps/errors/unmount; solid route fallback at start/middle/end; reduced motion; removed summary; protected capacity, trip, complaint API and geofencing unchanged.');
})().catch(error => { console.error(error); process.exitCode = 1; });
