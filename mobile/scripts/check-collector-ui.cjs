// UI fixtures only: no API, location, sync, download or native Mapbox side effects.
// RN Web layout is a proxy; device GPS/keyboard/native rendering still need device QA.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');
const raw = fs.readFileSync(path.join(__dirname, '../app/collector.tsx'), 'utf8');
const source = ts.createSourceFile('collector.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const functions = new Map();
let report;
let header;
let mapCamera;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer?.getText(source));
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source));
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Modal' && node.openingElement.getText(source).includes('isHistoryDetailVisible')) report = node.getText(source);
  if (ts.isJsxElement(node) && node.openingElement.getText(source).includes('styles.header, { paddingTop: insets.top }')) header = node.getText(source);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'Mapbox.Camera' && node.getText(source).includes('INITIAL_MAP_CAMERA')) mapCamera = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn result;`)(...Object.values(context));
}
const styles = evaluate(declarations.get('styles'), { StyleSheet: RN.StyleSheet });
assert.equal(styles.navIconPill.width, 56);
assert.equal(styles.navIconPill.height, 32);
assert.equal(styles.navIconPill.borderRadius, 16);
assert.equal(styles.segmentTrailMapWrap.height, 190);
assert.equal(styles.historyCardMap.width, 96);
assert.ok(report.includes('presentationStyle="fullScreen"'));
assert.ok(report.indexOf('historyDetailSegment') < report.indexOf('historyDetailTwoCol'));
assert.ok(!report.includes(' transparent '));
assert.ok(raw.includes('logoEnabled attributionEnabled'));
const MAP_CENTER = evaluate(declarations.get('MAP_CENTER'), {});
const INITIAL_MAP_CAMERA = evaluate(declarations.get('INITIAL_MAP_CAMERA'), { MAP_CENTER });
for (const count of [0, 1, 3, 4, 29]) {
  const historyGroups = Array.from({ length: count }, (_, id) => ({ id }));
  for (const showAllPastCollections of [false, true]) {
    const visible = evaluate(declarations.get('visibleHistoryGroups'), { historyGroups, showAllPastCollections });
    assert.deepEqual(visible, historyGroups.slice(0, showAllPastCollections ? count : 3));
    assert.equal(historyGroups.length, count);
  }
}
assert.deepEqual(INITIAL_MAP_CAMERA.centerCoordinate, [123.1815, 13.6192]);
assert.equal(INITIAL_MAP_CAMERA.zoomLevel, 12);
assert.equal(INITIAL_MAP_CAMERA.animationDuration, 0);
assert.equal(INITIAL_MAP_CAMERA.animationMode, 'none');
const HistoryMapCamera = evaluate(functions.get('HistoryMapCamera'), { React, Mapbox: { Camera: () => null }, MAP_CENTER });
for (const center of [null, [123.19, 13.63]]) {
  for (const zoom of [15, 16]) {
    const camera = HistoryMapCamera({ center, zoom });
    assert.deepEqual(camera.props.centerCoordinate, center ?? MAP_CENTER);
    assert.equal(camera.props.zoomLevel, center ? zoom : 12);
    assert.deepEqual(camera.props.defaultSettings.centerCoordinate, camera.props.centerCoordinate);
    assert.equal(camera.props.defaultSettings.zoomLevel, camera.props.zoomLevel);
    assert.equal(camera.props.defaultSettings.animationMode, 'none');
    assert.equal(camera.props.defaultSettings.animationDuration, 0);
    assert.equal(camera.props.animationMode, 'none');
    assert.equal(camera.props.animationDuration, 0);
  }
}
for (const driverLocation of [null, { longitude: 123.19, latitude: 13.63 }]) {
  const cameraCenter = evaluate(declarations.get('cameraCenter'), { driverLocation, mapCenter: MAP_CENTER });
  const camera = evaluate(mapCamera, { React, Mapbox: { Camera: () => null }, INITIAL_MAP_CAMERA, cameraCenter, driverLocation, hasMapFocus: false });
  assert.equal(camera.props.defaultSettings, INITIAL_MAP_CAMERA);
  assert.deepEqual(camera.props.centerCoordinate, driverLocation ? [123.19, 13.63] : MAP_CENTER);
  assert.equal(camera.props.animationMode, 'easeTo');
  assert.equal(camera.props.animationDuration, 500);
  assert.equal(camera.props.zoomLevel, driverLocation ? 15 : 12);
}
const named = new Map(Object.entries(styles).map(([name, value]) => [value, name]));
const tested = new Set(['brandHeader', 'progressCard', 'streetCard', 'historyCard', 'collectorProfileCard', 'profileSyncCard', 'accountRow', 'detailTable', 'historyDetailHeader', 'bottomNav']);
function fixture(count, fontScale, offline, expanded = false) {
  const clicks = [];
  const action = name => (...args) => clicks.push({ name, args });
  function View({ style, ...props }) {
    const first = Array.isArray(style) ? style[0] : style;
    return React.createElement(RN.View, { ...props, style, dataSet: { qa: named.get(first) || '' } });
  }
  function Text({ style, ...props }) {
    const flat = RN.StyleSheet.flatten(style) || {};
    return React.createElement(RN.Text, { ...props, style: [style, { fontSize: (flat.fontSize || 14) * 1.1 * fontScale }] });
  }
  const Icon = ({ size = 20 }) => React.createElement(RN.View, { style: { width: size, height: size, flexShrink: 0 } });
  const MapView = ({ style }) => React.createElement(View, { style });
  const group = { id: 'fixture', date: '2026-10-19', routeName: 'A very long collection route name across several neighbourhoods', barangay: 'Abella, Triangulo, San Francisco', distanceMi: 1.2, elevationGainFt: 10, elevationLossFt: 12, stopLogs: [], collected: 0, totalStops: 1, flagged: 0 };
  const streets = Array.from({ length: count }, (_, index) => ({ id: String(index), name: index ? 'A very long stop name that must ellipsize without hiding its status' : 'Start – Krispy Kreme', barangay: 'C.C.A.T. - South', status: index % 3 === 1 ? 'Collected' : 'Pending', flaggedForReview: index % 3 === 2, time: index % 3 ? '9:20 AM' : undefined }));
  const ctx = { React, View, Text, ProfileSettingsRow: () => null, completeSignOut: action('settings-signout'), Card: View, ScrollView: View, SafeAreaView: View, Modal: View, Pressable: RN.Pressable, Image: RN.Image, Feather: Icon, LinearGradient: View, Svg: View, Circle: () => null, styles, HistoryMapCamera, useSafeAreaInsets: () => ({ bottom: 0 }), Mapbox: { MapView, StyleURL: { Light: '' } }, MAPBOX_ACCESS_TOKEN: 'mock',
    SkeletonRegion: ({ children }) => children, SkeletonBlock: () => null, SkeletonRows: () => null, ActivityIndicator: () => null, routeSkeleton: { pending: false }, historySkeleton: {}, profileSkeleton: {},
    RevealRow: ({ children }) => children, MotionChevron: View, useSlidingTabPill: () => ({ indicator: null, itemLayout() {}, iconLayout() {} }), revealStops: false, revealHistory: false,
    completed: Math.floor(count / 3), totalStops: count, pending: count - Math.floor(count / 3), reviewCount: Math.floor(count / 3), progressPercent: count ? Math.floor(count / 3) / count * 100 : 0,
    assignedRoute: { name: group.routeName, isScheduledToday: true, assignedTruck: { truckNumber: '58', plateNumber: 'SNH-1145' } }, todayStreets: streets,
    isSubmittingRoute: false, submitRoute: action('finish'), routePresence: { state: offline ? 'off_route' : 'unknown' }, routePresenceEvents: [],
    offlineMap: { downloaded: offline, downloading: false, completedSizeBytes: 1000 }, offlineMapMessage: '', isUpdatingOfflineMap: false, toggleOfflineMap: action('download'),
    historyLoading: false, historyGroups: count ? [group] : [], historyLoadError: '', openHistoryDetail: action('report'), historyGroupLastLocation: () => null, routeLineFeature: () => null, firstRouteCoordinate: () => null, lastRouteCoordinate: () => null,
    profile: { email: 'driver@gmail.com', shift: 'day' }, initial: 'D', collectorName: 'A very long driver name', barangay: 'C.C.A.T. - South', pendingRouteLogs: offline ? 3 : 0,
    isOffline: offline, loadError: '', isLoading: false, session: { token: 'fixture' }, collectorId: 'fixture', loadDriverData: action('refresh'), signOut: action('signout'),
    isHistoryDetailVisible: true, selectedHistoryGroup: group, setIsHistoryDetailVisible: action('close'),
    displayShift: () => 'Day Shift', displayBarangay: value => Array.isArray(value) ? value.join(', ') : value, formatStorage: () => '1 KB', formatTime: () => '9:20 AM',
  };
  for (const name of ['CollectorGradient', 'ProgressRing', 'StreetRow', 'AccountDetail', 'BottomNavigation']) ctx[name] = evaluate(functions.get(name), ctx);
  function elements(node, results = []) {
    if (!node || typeof node !== 'object') return results;
    if (Array.isArray(node)) { node.forEach(child => elements(child, results)); return results; }
    results.push(node);
    elements(node.props?.children, results);
    return results;
  }
  ctx.assignedRoute._id = 'route-fixture';
  ctx.expandedStopsRouteId = expanded ? ctx.assignedRoute._id : null;
  ctx.showAllStops = evaluate(declarations.get('showAllStops'), ctx);
  ctx.visibleTodayStreets = evaluate(declarations.get('visibleTodayStreets'), ctx);
  ctx.setExpandedStopsRouteId = action('toggle-stops');
  // Exercise the actual list slicing and toggle, preserving ordering and records.
  ctx.historyGroups = Array.from({ length: count }, (_, index) => ({ ...group, id: `history-${index}` }));
  ctx.showAllPastCollections = expanded;
  ctx.visibleHistoryGroups = evaluate(declarations.get('visibleHistoryGroups'), ctx);
  ctx.setShowAllPastCollections = update => action('toggle-history')(update(expanded));
  ctx.awaitingEntry = evaluate(declarations.get('awaitingEntry'), ctx);
  ctx.weakRouteSignal = evaluate(declarations.get('weakRouteSignal'), ctx);
  const history = evaluate(declarations.get('historyScreen'), ctx);
  const profile = evaluate(declarations.get('profileScreen'), ctx);
  const detail = evaluate(report, ctx);
  for (const tree of [history, profile, detail]) {
    for (const item of elements(tree)) if (item.props?.onPress && !item.props.disabled) item.props.onPress();
  }
  for (const expected of ['finish', 'download', 'refresh', 'signout', 'close', ...(count ? ['report'] : [])]) assert.ok(clicks.some(click => click.name === expected), `Missing ${expected} action`);
  const historyHtml = renderToStaticMarkup(history);
  assert.equal((historyHtml.match(/data-qa="streetCard"/g) || []).length, expanded ? count : Math.min(count, 5));
  const toggle = elements(history).find(item => item.props?.testID === 'collector-stops-toggle');
  assert.equal(Boolean(toggle), count > 5);
  if (toggle) {
    assert.equal(toggle.props.accessibilityState.expanded, expanded);
    assert.equal(clicks.find(click => click.name === 'toggle-stops').args[0], expanded ? null : 'route-fixture');
    const toggledContext = { ...ctx, expandedStopsRouteId: expanded ? null : 'route-fixture' };
    toggledContext.showAllStops = evaluate(declarations.get('showAllStops'), toggledContext);
    assert.equal(evaluate(declarations.get('visibleTodayStreets'), toggledContext).length, expanded ? 5 : count);
    const changedRoute = { ...ctx, assignedRoute: { _id: 'different-route' } };
    assert.equal(evaluate(declarations.get('showAllStops'), changedRoute), false);
  }
  assert.equal(ctx.todayStreets.length, count, 'Full checklist is preserved');
  assert.equal((historyHtml.match(/data-qa="historyCard"/g) || []).length, expanded ? count : Math.min(count, 3));
  assert.deepEqual(ctx.visibleHistoryGroups.map(item => item.id), ctx.historyGroups.slice(0, expanded ? count : 3).map(item => item.id));
  const historyToggle = elements(history).find(item => item.props?.testID === 'collector-history-toggle');
  assert.equal(Boolean(historyToggle), count > 3);
  if (historyToggle) {
    assert.equal(historyToggle.props.accessibilityState.expanded, expanded);
    assert.equal(clicks.find(click => click.name === 'toggle-history').args[0], !expanded);
    assert.equal(evaluate(declarations.get('visibleHistoryGroups'), { ...ctx, showAllPastCollections: !expanded }).length, expanded ? 3 : count);
  }
  if (count === 29) { assert.ok(historyHtml.includes('Collected · Review')); assert.ok(historyHtml.includes('Pending')); assert.ok(historyHtml.includes('Flagged')); }
  const profileHtml = renderToStaticMarkup(profile);
  assert.ok(profileHtml.includes(offline ? 'Offline mode (using saved route)' : 'Driver data is up to date'));
  const headerTree = evaluate(header, { ...ctx, insets: { top: 0 }, BrandMark: ({ width, height }) => React.createElement(View, { style: { width, height, flexShrink: 0 } }) });
  const tabs = ctx.BottomNavigation({ activeTab: 'history', onChange: action('tab') });
  for (const tab of elements(tabs).filter(item => item.props?.accessibilityRole === 'tab')) tab.props.onPress();
  assert.deepEqual(clicks.filter(click => click.name === 'tab').map(click => click.args[0]), ['map', 'history', 'profile']);
  const sections = [['header', renderToStaticMarkup(headerTree)], ['history', historyHtml], ['profile', profileHtml], ['report', renderToStaticMarkup(detail)], ['tabs', renderToStaticMarkup(tabs)]];
  return sections.map(([screen, html]) => `<section data-screen="${screen}" data-count="${count}" data-scale="${fontScale}" style="width:360px">${html}</section>`).join('');
}
const cases = [0, 1, 5, 6, 29].flatMap(count => [1, 2].flatMap(scale => [false, true].flatMap(offline => [false, true].map(expanded => fixture(count, scale, offline, expanded)))));
console.log('PASS: Naga initial camera/current-location transition; 3-collection limit; 40 fixtures covering expand/collapse, states, offline, action bindings, report order and attribution.');
if (process.argv.includes('--logic-only')) process.exit(0);
function browserCheck() {
  const failures = [];
  const tested = new Set(TESTED);
  const sections = [...document.querySelectorAll('section')];
  for (const section of sections) {
    const frame = section.getBoundingClientRect();
    for (const item of section.querySelectorAll('[data-qa]')) {
      if (!tested.has(item.dataset.qa)) continue;
      const rect = item.getBoundingClientRect();
      if (rect.left < frame.left - 1 || rect.right > frame.right + 1 || item.scrollWidth > item.clientWidth + 1) failures.push(`${section.dataset.screen}/${section.dataset.count}/${section.dataset.scale}: ${item.dataset.qa} overflow`);
    }
  }
  document.querySelector('#result').textContent = JSON.stringify({ sections: sections.length, failures });
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-collector-qa-'));
const file = path.join(dir, 'collector.html');
fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}</style><body style="margin:0">${cases.join('')}<pre id="result"></pre><script>(${browserCheck.toString().replace('TESTED', JSON.stringify([...tested]))})();</script>`);
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dom = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'browser')}`, '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const result = JSON.parse(dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1] || '{}');
console.log(JSON.stringify({ ...result, fixture: file }, null, 2));
assert.deepEqual(result.failures, []);
