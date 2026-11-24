// Real detector + SQLite statements, with in-memory storage and fake device APIs.
// No GPS, permissions, network requests or user data are touched by these tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const root = path.join(__dirname, '../src/lib');
function load(name, dependencies) {
  const source = fs.readFileSync(path.join(root, name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(key => {
    if (!(key in dependencies)) throw new Error(`Unexpected dependency: ${key}`);
    return dependencies[key];
  }, module, module.exports);
  return module.exports;
}
const filter = load('route-presence-filter', {});
const {withTimeout} = load('async-timeout', {});
let now = Date.UTC(2026, 10, 10, 0, 0, 0);
const realNow = Date.now;
Date.now = () => now;
const fix = (timestamp = now, distance = 0, accuracy = 10) => ({ timestamp, coords: { latitude: 13.62 + distance / 111195, longitude: 123.18, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null } });
const config = { collectorId: 'driver-1', routeId: 'route-1', routeName: 'Test route', routePath: { type: 'LineString', coordinates: [[123.17, 13.62], [123.19, 13.62]] } };
let db;
let running = false;
let foreground = 'granted';
let background = 'granted';
let permissionDeferred = null;
let startFailure = false;
let stopFailure = false;
let startedOptions;
let nativeStarts = 0;
let starts = [];
let points = [];
let finishes = 0;
let tasks = {};
let uuid = 0;
let signedIn = true;
const appState = { currentState: 'active' };
const database = {
  async execAsync(sql) { db.exec(sql); },
  async runAsync(sql, ...args) { return db.prepare(sql).run(...args); },
  async getFirstAsync(sql, ...args) { return db.prepare(sql).get(...args) ?? null; },
  async getAllAsync(sql, ...args) { return db.prepare(sql).all(...args); },
  async withExclusiveTransactionAsync(work) {
    db.exec('BEGIN');
    try { await work(database); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};
const dependencies = {
  '@/lib/notifications': { ensureNotificationPermissionsAsync: async () => true },
  'expo-crypto': { randomUUID: () => `uuid-${++uuid}` },
  'expo-sqlite': { openDatabaseAsync: async () => database },
  'react-native': { AppState: appState, Platform: { OS: 'android' } },
  'expo-task-manager': { isAvailableAsync: async () => true, isTaskDefined: key => Boolean(tasks[key]), defineTask: (key, task) => { tasks[key] = task; } },
  'expo-location': {
    Accuracy: { High: 4 },
    getForegroundPermissionsAsync: async () => ({ status: foreground }),
    getBackgroundPermissionsAsync: async () => ({ status: background }),
    requestForegroundPermissionsAsync: async () => ({ status: foreground }),
    requestBackgroundPermissionsAsync: async () => permissionDeferred ? permissionDeferred : ({ status: background }),
    hasStartedLocationUpdatesAsync: async () => running,
    startLocationUpdatesAsync: async (_, options) => { if (startFailure) throw Error('Native startup failed'); running = true; startedOptions = options; nativeStarts++; },
    stopLocationUpdatesAsync: async () => { if (stopFailure) throw Error('Native stop failed'); running = false; },
    getCurrentPositionAsync: () => new Promise(() => {}),
  },
  '@/lib/driver-trail-queue': {
    startDriverTrailSession: async value => { starts.push(value); },
    recordDriverTrailLocation: async (location, owner) => { points.push({ location, owner }); },
    finishDriverTrailSession: async () => { finishes++; },
  },
  './route-presence-filter': filter,
  '@/lib/session': { getSession: async () => signedIn ? { token: 'fixture', user: { _id: 'driver-1', role: 'collector' } } : null },
};
let service;
function reset() {
  db?.close();
  db = new DatabaseSync(':memory:');
  running = false; foreground = background = 'granted'; appState.currentState = 'active';
  permissionDeferred = null; startFailure = stopFailure = false;
  starts = []; points = []; finishes = nativeStarts = 0; tasks = {};
  signedIn = true;
  service = load('driver-route-proximity', dependencies);
}
function events() { return db.prepare('SELECT * FROM driver_route_presence_events ORDER BY occurred_at').all(); }
async function sample(distance = 0, accuracy = 10, advance = 5000) {
  now += advance;
  await service.processDriverRouteLocation(fix(now, distance, accuracy), config);
}
const tests = [];
function test(name, work) { tests.push([name, work]); }

// Exercise the actual Collector permission/start/stop callbacks, not copies.
const screenSource = ts.createSourceFile('collector.tsx', fs.readFileSync(path.join(__dirname, '../app/collector.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screenDeclarations = new Map();
function visitScreen(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) screenDeclarations.set(node.name.text, node.initializer?.getText(screenSource));
  ts.forEachChild(node, visitScreen);
}
visitScreen(screenSource);
function evaluateScreen(name, context) {
  const code = ts.transpileModule(`const result = ${screenDeclarations.get(name)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${code}\nreturn result;`)(...Object.values(context));
}
function screenFixture(consent = null, pausedDay = null, accept = true, trackingEnabled = consent === true && !pausedDay) {
  let preference = { consent, pausedDay };
  let prompts = 0;
  let claimed = false;
  const calls = [];
  const consentPrompt = { request: async () => { prompts++; return accept; } };
  const context = {
    finishRouteFlowRef: { current: false }, tripStoppedRef: { current: false },
    activeTab: 'map', automaticTripPromptEligible: true, editingProfile: false, claimTripStartPrompt: async () => { if(claimed)return false; claimed=true;return true; },
    withTimeout, loadRouteHistory: async () => {}, useCallback: fn => fn, isTogglingMonitoringRef: { current: false }, monitoringSuspendedRef: { current: false }, monitoringRequestRef: { current: 0 },
    monitoringContextRef: { current: { collectorId: config.collectorId, routeId: config.routeId, eligible: true } },
    collectorId: config.collectorId, assignedRoute: { _id: config.routeId, name: config.routeName, routePath: config.routePath }, mapRouteLine: {}, monitoringEligible: true,
    setIsUpdatingGeofence() {}, setGeofencingMessage() {}, setRoutePresence() {}, setIsGeofencingEnabled() {},
    getRouteMonitoringPreference: async () => preference,
    getRouteProximityStatus: async () => ({ enabled: trackingEnabled, routeId: config.routeId }),
    setRouteMonitoringConsent: async (_, value) => { preference = { consent: value, pausedDay: null }; },
    pauseRouteMonitoringToday: async () => { preference.pausedDay = filter.monitoringDay(); },
    monitoringDay: filter.monitoringDay,
    requestMonitoringConsent: () => consentPrompt.request(), respondToMonitoringConsent() {},
    AppState: { currentState: 'active' }, API_URL: '', geofenceStops: [], session: { token: 'fixture' },
    enableRouteProximityTracking: async (_, options) => { calls.push(['enable', options]); trackingEnabled = true; return { enabled: true }; },
    stopRouteProximityTracking: async () => { calls.push(['stop']); },
    stopDriverGeofencing: async () => { calls.push(['stop-zones']); },
    enableDriverGeofencing: async () => ({ enabled: true }),
    syncRouteLogQueue: async () => {}, applyQueueResult() {}, syncDriverTrailQueue: async () => {}, refreshRoutePresence: async () => {},
    clearCachedAssignedRoute: async () => {}, clearSession: async () => { calls.push(['clear-session']); }, setSession() {}, router: { replace: path => calls.push(['navigate', path]) },
  };
  return { context, consentPrompt, calls, prompts: () => prompts, preference: () => preference, enable: evaluateScreen('enableBackgroundGeofencing', context), stop: evaluateScreen('disableBackgroundGeofencing', context), signOut: evaluateScreen('completeSignOut', context) };
}

test('explicit trip start explains background access, asks consent and then requests OS permission', async () => {
  const screen = screenFixture(); await screen.enable();
  assert.equal(screen.prompts(), 1);
  assert.equal(screen.preference().consent, true);
  assert.deepEqual(screen.calls.find(call => call[0] === 'enable'), ['enable', { requestPermissions: true }]);
});
test('online automatic monitoring cannot interrupt an open Finish route dialog', async () => {
  const screen = screenFixture(true);
  screen.context.finishRouteFlowRef.current = true;
  await screen.enable({ automatic: true });
  assert.equal(screen.prompts(), 0);
  assert.deepEqual(screen.calls, []);
});
test('Finish route opened during a status request prevents further automatic setup', async () => {
  const screen = screenFixture(true);
  let resolveStatus;
  screen.context.getRouteProximityStatus = () => new Promise(resolve => { resolveStatus = resolve; });
  const pending = evaluateScreen('enableBackgroundGeofencing', screen.context)({ automatic: true });
  await Promise.resolve();
  screen.context.finishRouteFlowRef.current = true;
  resolveStatus({ enabled: true, routeId: config.routeId });
  await pending;
  assert.deepEqual(screen.calls, []);
});
test('an online assignment response cannot replace the route during Finish route', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  let requests = 0;
  const writes = [];
  const context = {
    useCallback: fn => fn, API_URL: 'https://fixture',
    finishRouteFlowRef: { current: false }, driverDataRequestRef: { current: 0 },
    NetInfo: { fetch: async () => ({ isConnected: true, isInternetReachable: true }) },
    requestJson: () => { requests++; return response; },
    setLoadError() {}, setIsLoading() {}, setIsOffline() {},
    setAssignedRoute: value => writes.push(value), setDriver: value => writes.push(value),
    setProgress: value => writes.push(value), setLatestCapacityLog: value => writes.push(value),
  };
  const refresh = evaluateScreen('loadDriverData', context);
  const pending = refresh('token', 'driver');
  await Promise.resolve();
  assert.equal(requests, 4);
  context.finishRouteFlowRef.current = true;
  context.driverDataRequestRef.current++;
  release({ response: { ok: true }, payload: { success: true, data: { _id: 'changed-route' } } });
  await pending;
  assert.deepEqual(writes, []);
  await refresh('token', 'driver');
  assert.equal(requests, 4, 'New online refresh must wait until confirmation closes');
});
test('online Finish route waits for local save and completes even while uploads are stalled', async () => {
  let save;
  let visible = true, busy = false, message = null, route = { _id: 'route', name: 'Area 4' };
  const uploads = [];
  const context = {
    session: { token: 'token', user: { _id: 'driver' } }, assignedRoute: route,
    collectorId: 'driver', isSubmittingRoute: false, submittingRouteRef: { current: false },
    setIsSubmittingRoute: value => { busy = value; },
    setIsFinishRouteConfirmVisible: value => { visible = value; },
    setRouteActionMessage: value => { message = value; },
    disableBackgroundGeofencing: async () => {},
    queueRouteCompletion: () => new Promise(resolve => { save = resolve; }),
    monitoringDay: () => '2026-11-21', displayBarangay: () => 'Abella', totalStops: 5, completed: 3,
    getRouteHistoryCache: async () => [], getLocalDriverTrailHistory: async () => [],
    mergeRouteHistory: (a, b) => [...a, ...b], setHistoryGroups() {}, saveRouteHistoryCache: async () => {},
    setAssignedRoute: value => { route = value; }, clearCachedAssignedRoute: async () => {}, clearRouteProximityEvents: async () => {},
    API_URL: 'https://fixture', loadRouteHistory: async () => {},
    syncDriverTrailQueue: () => { uploads.push('trail'); return new Promise(() => {}); },
    syncRouteCompletions: () => { uploads.push('completion'); return new Promise(() => {}); },
  };
  const pending = evaluateScreen('confirmRouteCompletion', context)();
  await Promise.resolve();
  assert.equal(busy, true); assert.equal(visible, true);
  assert.equal(route._id, 'route'); assert.equal(message, null);
  save(); await pending;
  assert.equal(busy, false); assert.equal(visible, false);
  assert.equal(route, null); assert.equal(message.kind, 'success');
  assert.deepEqual(uploads, ['trail', 'completion']);
});
test('failed tracking shutdown never reports a finished route, even offline', async () => {
  for (const apiUrl of ['', 'https://fixture']) {
    let message, saves = 0;
    const context = {
      session: { token: 'token', user: { _id: 'driver' } }, assignedRoute: { _id: 'route' },
      collectorId: 'driver', isSubmittingRoute: false, submittingRouteRef: { current: false },
      setIsSubmittingRoute() {}, setIsFinishRouteConfirmVisible() {},
      setRouteActionMessage: value => { message = value; },
      disableBackgroundGeofencing: async () => { throw Error('Trip monitoring could not be stopped.'); },
      queueRouteCompletion: async () => { saves++; }, API_URL: apiUrl,
    };
    await evaluateScreen('confirmRouteCompletion', context)();
    assert.equal(saves, 0);
    assert.equal(message.kind, 'error');
    assert.equal(message.retryCompletion, true);
  }
});
test('map auto-prompts once and Not now never starts recording', async () => {
  const screen = screenFixture(null, null, false); await screen.enable({ automatic: true });
  await screen.enable({ automatic: true });
  assert.equal(screen.prompts(), 1);
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
});
test('automatic prompt starts only after approval and stays off other tabs', async () => {
  const screen=screenFixture();await screen.enable({automatic:true});
  assert.equal(screen.prompts(),1);
  assert.deepEqual(screen.calls.find(call=>call[0]==='enable'),['enable',{requestPermissions:true}]);
  const other=screenFixture();other.context.activeTab='history';
  await evaluateScreen('enableBackgroundGeofencing',other.context)({automatic:true});
  assert.equal(other.prompts(),0);
});

test('approved automatic setup never prompts again or clears a manual pause', async () => {
  const screen = screenFixture(true); await screen.enable({ automatic: true });
  assert.equal(screen.prompts(), 0);
  assert.deepEqual(screen.calls.find(call => call[0] === 'enable'), ['enable', { requestPermissions: false }]);
  const paused = screenFixture(true, filter.monitoringDay()); await paused.enable({ automatic: true });
  assert.equal(paused.calls.some(call => call[0] === 'enable'), false);
  assert.equal(paused.preference().pausedDay, filter.monitoringDay());
});
test('an unfinished saved trip resumes after reopening without a prompt, even off the map tab', async () => {
  const resumed = screenFixture(true, null, true, false);
  resumed.context.activeTab = 'history';
  resumed.context.automaticTripPromptEligible = false;
  await resumed.enable({ automatic: true });
  assert.equal(resumed.prompts(), 0);
  assert.deepEqual(resumed.calls.find(call => call[0] === 'enable'), ['enable', { requestPermissions: false }]);
});
test('automatic refresh preserves an active off-schedule trip without prompting or starting an idle one', async () => {
  const active = screenFixture(true);
  active.context.automaticTripPromptEligible = false;
  await evaluateScreen('enableBackgroundGeofencing', active.context)({ automatic: true });
  assert.equal(active.prompts(), 0);
  assert.deepEqual(active.calls.find(call => call[0] === 'enable'), ['enable', { requestPermissions: false }]);
  assert.equal(active.calls.some(call => call[0] === 'stop'), false);
  const idle = screenFixture();
  idle.context.automaticTripPromptEligible = false;
  await evaluateScreen('enableBackgroundGeofencing', idle.context)({ automatic: true });
  assert.equal(idle.prompts(), 0);
  assert.equal(idle.calls.some(call => call[0] === 'enable'), false);
});

test('declining automatic setup stops old monitoring and does not request OS permissions', async () => {
  const screen = screenFixture(null, null, false); await screen.enable();
  assert.equal(screen.preference().consent, false);
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
  assert.ok(screen.calls.some(call => call[0] === 'stop'));
});
test('manual switch-on resumes a paused day; switch-off saves the pause', async () => {
  const screen = screenFixture(true, filter.monitoringDay()); await screen.enable();
  assert.equal(screen.preference().pausedDay, null);
  await screen.stop(); assert.equal(screen.preference().pausedDay, filter.monitoringDay());
  assert.ok(screen.calls.some(call => call[0] === 'stop'));
  assert.ok(screen.calls.some(call => call[0] === 'stop-zones'));
});
test('a persisted manual pause overrides a stale active native status', async () => {
  const screen = screenFixture(true, filter.monitoringDay(), true, true);
  await screen.enable({ automatic: true });
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
});
test('finishing locks automatic restarts until an explicit new trip', async () => {
  const screen = screenFixture(true);
  await screen.stop();
  await screen.enable({ automatic: true });
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
  await screen.enable();
  assert.equal(screen.calls.filter(call => call[0] === 'enable').length, 1);
});
test('an automatic status check started before finish cannot restart the trip', async () => {
  const screen = screenFixture(true);
  let release;
  screen.context.getRouteProximityStatus = () => new Promise(resolve => { release = resolve; });
  const starting = evaluateScreen('enableBackgroundGeofencing', screen.context)({ automatic: true });
  await new Promise(resolve => setImmediate(resolve));
  await screen.stop();
  release({ enabled: true, routeId: config.routeId });
  await starting;
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
});
test('a GPS callback awaiting session lookup is cancelled when the trip finishes', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  let release;
  const originalSession = dependencies['@/lib/session'].getSession;
  dependencies['@/lib/session'].getSession = () => new Promise(resolve => { release = resolve; });
  try {
    const sampling = service.processDriverRouteLocation(fix(), config);
    await new Promise(resolve => setImmediate(resolve));
    const stopping = service.stopRouteProximityTracking({ forgetConfiguration: true });
    release({ token: 'fixture', user: { _id: 'driver-1', role: 'collector' } });
    await Promise.all([sampling, stopping]);
    assert.equal(points.length, 0);
    assert.equal(running, false);
  } finally { dependencies['@/lib/session'].getSession = originalSession; }
});
test('sign-out while the opt-in prompt is open cannot start tracking afterwards', async () => {
  const screen = screenFixture(); let approve;
  screen.consentPrompt.request = () => new Promise(resolve => { approve = () => resolve(true); });
  const enabling = screen.enable();
  await new Promise(resolve => setImmediate(resolve));
  await screen.signOut(); approve(); await enabling;
  assert.equal(screen.calls.some(call => call[0] === 'enable'), false);
  assert.ok(screen.calls.some(call => call[0] === 'clear-session'));
});
test('manual trip start accepts assigned routes outside schedule, after an earlier trip, or without geometry', async () => {
  const context = { session: { token: 'fixture' }, assignedRoute: { _id: config.routeId, routePath: config.routePath, schedule: [2], isScheduledToday: true, isCompletedToday: false }, scheduledWeekday: 2, isSubmittingRoute: false };
  assert.equal(evaluateScreen('monitoringEligible', context), true);
  assert.equal(evaluateScreen('monitoringEligible', { ...context, scheduledWeekday: 3 }), true);
  assert.equal(evaluateScreen('monitoringEligible', { ...context, isSubmittingRoute: true }), false);
  assert.equal(evaluateScreen('monitoringEligible', { ...context, assignedRoute: null }), false);
  assert.equal(evaluateScreen('monitoringEligible', { ...context, assignedRoute: { ...context.assignedRoute, routePath: null, isCompletedToday: true } }), true);
  for (const changes of [{isScheduledToday:false},{isCompletedToday:true},{routePath:null}]) {
    const screen=screenFixture();Object.assign(screen.context.assignedRoute,changes);screen.context.mapRouteLine=null;
    await evaluateScreen('enableBackgroundGeofencing',screen.context)();
    assert.ok(screen.calls.some(call=>call[0]==='enable'));
  }
  assert.equal(evaluateScreen('automaticTripPromptEligible',{...context,monitoringEligible:true}),true);
  assert.equal(evaluateScreen('automaticTripPromptEligible',{...context,monitoringEligible:true,scheduledWeekday:3}),false);
  assert.ok(screenDeclarations.get('confirmRouteCompletion').includes('await disableBackgroundGeofencing()'));
});

test('hung map status refresh cannot keep Start trip busy', async () => {
  const screen = screenFixture(); let busy = false;
  screen.context.setIsUpdatingGeofence = value => { busy = value; };
  screen.context.refreshRoutePresence = () => new Promise(() => {});
  await withTimeout(evaluateScreen('enableBackgroundGeofencing', screen.context)(), 200);
  assert.equal(busy, false); assert.equal(screen.context.isTogglingMonitoringRef.current, false);
});
test('background maintenance never shows a blocking Please wait button', async () => {
  const screen = screenFixture(true); const busy = [];
  screen.context.setIsUpdatingGeofence = value => busy.push(value);
  await evaluateScreen('enableBackgroundGeofencing', screen.context)({automatic:true});
  assert.ok(!busy.includes(true));
});
test('active trip identity is available before the first GPS fix', async () => {
  reset();await service.enableRouteProximityTracking(config);
  const status=await service.getRouteProximityStatus();assert.equal(status.enabled,true);assert.equal(status.routeId,config.routeId);
});

test('three good fixes over ten seconds, then one entry event', async () => {
  reset();
  assert.equal((await service.enableRouteProximityTracking(config)).enabled, true);
  assert.equal(starts.length, 0);
  assert.equal(startedOptions.distanceInterval, 0, 'Stationary drivers must still receive confirmation samples');
  assert.ok(startedOptions.foregroundService.notificationBody.includes('outside the assigned route'));
  await sample(0, 10, 0);
  await sample();
  assert.equal(events().length, 0);
  assert.equal(points.length, 2);
  await sample();
  assert.deepEqual(events().map(event => event.event_type), ['entered']);
  assert.equal(points.length, 3);
  assert.equal((await service.getRouteProximityStatus()).state, 'on_route');
  await sample();
  assert.equal(events().length, 1);
});
test('accuracy uncertainty near the boundary cannot trigger entry', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  for (let index = 0; index < 5; index++) await sample(35, 20);
  assert.equal(events().length, 0); assert.equal(points.length, 5);
  assert.equal((await service.getRouteProximityStatus()).state, 'unknown');
});
test('poor/null accuracy, mocked fixes, stale/future timestamps and invalid coordinates are rejected', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  const bad = [fix(now, 0, 100), fix(now, 0, null), { ...fix(), mocked: true }, fix(now - 120000), fix(now + 60000), fix(NaN), { ...fix(), coords: { latitude: 91, longitude: 123, accuracy: 5 } }];
  for (const location of bad) await service.processDriverRouteLocation(location, config);
  assert.equal(events().length, 0); assert.equal(points.length, 0);
});
test('duplicates and out-of-order delivery do not add confirmation samples', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(0, 10, 0);
  for (let index = 0; index < 5; index++) await service.processDriverRouteLocation(fix(), config);
  now += 5000; await service.processDriverRouteLocation(fix(), config);
  await service.processDriverRouteLocation(fix(now - 1000), config);
  assert.equal(events().length, 0);
  await sample(); assert.equal(events().length, 1);
});
test('poor samples and long gaps reset confirmation rather than accumulate sparse fixes', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample(0, 80); await sample();
  assert.equal(events().length, 0);
  await sample(0, 10, 40000); await sample(); assert.equal(events().length, 0);
  await sample(); assert.equal(events().length, 1);
});
test('outside the route records the trip without a false entry or exit', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  await sample(120); await sample(120); await sample(120);
  const status = await service.getRouteProximityStatus();
  assert.equal(status.state, 'off_route'); assert.equal(status.hasEntered, false);
  assert.equal(events().length, 0); assert.equal(points.length, 3);
});
test('exit requires confirmation; boundary jitter does not flicker; re-entry is recorded once', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  await sample(); await sample(); await sample();
  for (const distance of [55, 66, 70, 60]) await sample(distance);
  assert.equal(events().length, 1);
  await sample(100); await sample(100); await sample(100);
  assert.deepEqual(events().map(event => event.event_type), ['entered', 'left']);
  await sample(); await sample(); await sample();
  assert.deepEqual(events().map(event => event.event_type), ['entered', 'left', 'entered']);
});
test('implausible GPS jump cannot trigger an exit', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  await sample(); await sample(); await sample();
  await sample(2000); await sample(2000); await sample(2000);
  assert.equal(events().length, 1);
});
test('background batch is sorted and uses the same detector while minimized', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  const first = now; now += 10000; appState.currentState = 'background';
  await tasks[service.DRIVER_ROUTE_PROXIMITY_TASK]({ data: { locations: [fix(first + 10000), fix(first), fix(first + 5000)] } });
  assert.equal(events().length, 1); assert.equal(points.length, 3);
});
test('delayed screen-off batches preserve capture times and report stale live status', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  const first = now; now += 5 * 60_000; appState.currentState = 'background';
  await tasks[service.DRIVER_ROUTE_PROXIMITY_TASK]({ data: { locations: [fix(first + 10000), fix(first), fix(first + 5000)] } });
  assert.equal(points.length, 3);
  assert.equal(events().length, 1);
  assert.equal((await service.getRouteProximityStatus()).signal, 'stale');
  await tasks[service.DRIVER_ROUTE_PROXIMITY_TASK]({ data: { locations: [fix(first), { ...fix(first + 15000), mocked: true }, fix(now + 60000)] } });
  assert.equal(points.length, 3);
});
test('confirmation survives a headless JS restart with the same local database', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  tasks = {}; service = load('driver-route-proximity', dependencies);
  await sample(); assert.equal(events().length, 1);
});
test('reopening after a force-close restarts GPS without ending the saved trip', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  const completedBeforeRestart = finishes;
  running = false; tasks = {}; service = load('driver-route-proximity', dependencies);
  assert.equal((await service.enableRouteProximityTracking(config, { requestPermissions: false })).enabled, true);
  assert.equal(finishes, completedBeforeRestart);
  await sample(); assert.equal(events().length, 1);
});
test('registered GPS task rebinds its foreground service without ending the saved trip', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample();
  const completedBeforeRestart = finishes;
  tasks = {}; service = load('driver-route-proximity', dependencies);
  assert.equal(running, true, 'registration can survive process recreation');
  await service.enableRouteProximityTracking(config, { requestPermissions: false });
  assert.equal(nativeStarts, 2, 'refresh options so native code can restore the notification service');
  assert.equal(finishes, completedBeforeRestart);
});

test('notification permission dialog cannot start the service while the app is inactive', async () => {
  reset();
  const original = dependencies['@/lib/notifications'].ensureNotificationPermissionsAsync;
  dependencies['@/lib/notifications'].ensureNotificationPermissionsAsync = async () => { appState.currentState = 'background'; return true; };
  try {
    assert.equal((await service.enableRouteProximityTracking(config)).enabled, false);
    assert.equal(nativeStarts, 0);
  } finally { dependencies['@/lib/notifications'].ensureNotificationPermissionsAsync = original; }
});

test('a different owner/route cannot feed fixes into this session', async () => {
  reset(); await service.enableRouteProximityTracking(config);
  for (let index = 0; index < 3; index++) { now += 5000; await service.processDriverRouteLocation(fix(), { collectorId: 'other', routeId: config.routeId }); }
  assert.equal(events().length, 0); assert.equal(points.length, 0);
});
test('route/geometry change resets pending confirmation', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  const next = { ...config, routeId: 'route-2' };
  await service.enableRouteProximityTracking(next);
  now += 5000; await service.processDriverRouteLocation(fix(), next);
  assert.equal(events().length, 0);
  assert.equal(finishes, 2);
});
test('denied permissions and background startup cannot pretend to be enabled', async () => {
  reset(); background = 'denied';
  assert.equal((await service.enableRouteProximityTracking(config)).enabled, false);
  assert.equal((await service.getRouteProximityStatus()).enabled, false);
  assert.equal(nativeStarts, 0);
  background = 'granted'; appState.currentState = 'background';
  assert.equal((await service.enableRouteProximityTracking(config)).enabled, false);
  assert.equal(nativeStarts, 0);
});
test('native startup failure rolls back live configuration', async () => {
  reset(); startFailure = true;
  assert.equal((await service.enableRouteProximityTracking(config)).enabled, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM driver_route_tracking_config').get().count, 0);
  assert.equal(starts.length, 0);
});
test('revoking background permission stops an already running detector', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  background = 'denied';
  assert.equal((await service.enableRouteProximityTracking(config, { requestPermissions: false })).enabled, false);
  assert.equal(running, false);
  await sample(); assert.equal(events().length, 0); assert.equal(points.length, 2);
});
test('manual stop invalidates queued fixes and status reads never restart monitoring', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  await service.stopRouteProximityTracking({ forgetConfiguration: true });
  await sample(); await sample(); await sample();
  assert.equal(events().length, 0); assert.equal(points.length, 2);
  assert.equal((await service.getRouteProximityStatus()).enabled, false);
  assert.equal(nativeStarts, 1);
  assert.equal(await service.updateRouteProximityTracking(config), false);
  assert.equal(nativeStarts, 1);
});
test('signed-out sessions cannot save trail points even if a native batch arrives', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample();
  signedIn = false;
  await sample(); await sample();
  assert.equal(events().length, 0); assert.equal(points.length, 2);
});
test('stop during a permission prompt cancels startup', async () => {
  reset(); background = 'denied';
  let release;
  permissionDeferred = new Promise(resolve => { release = resolve; });
  const starting = service.enableRouteProximityTracking(config);
  await new Promise(resolve => setImmediate(resolve));
  const stopping = service.stopRouteProximityTracking({ forgetConfiguration: true });
  release({ status: 'granted' });
  assert.equal((await starting).enabled, false);
  await stopping; assert.equal(nativeStarts, 0);
});
test('even failed native shutdown removes configuration and prevents new trail writes', async () => {
  reset(); await service.enableRouteProximityTracking(config); await sample(); await sample(); await sample();
  const count = points.length; stopFailure = true;
  await assert.rejects(service.stopRouteProximityTracking({ forgetConfiguration: true }));
  await sample(); assert.equal(points.length, count);
  assert.equal((await service.getRouteProximityStatus()).enabled, false);
});
test('consent and Manila-day pause survive restart and stay isolated by driver', async () => {
  reset();
  assert.equal((await service.getRouteMonitoringPreference('driver-1')).consent, null);
  await service.setRouteMonitoringConsent('driver-1', true);
  assert.equal(filter.mayAutoArm(await service.getRouteMonitoringPreference('driver-1'), filter.monitoringDay()), true);
  await service.pauseRouteMonitoringToday('driver-1');
  tasks = {}; service = load('driver-route-proximity', dependencies);
  const preference = await service.getRouteMonitoringPreference('driver-1');
  assert.equal(filter.mayAutoArm(preference, filter.monitoringDay()), false);
  assert.equal(filter.mayAutoArm(preference, '2099-01-01'), true);
  assert.equal((await service.getRouteMonitoringPreference('driver-2')).consent, null);
  await service.setRouteMonitoringConsent('driver-1', true);
  assert.equal(filter.mayAutoArm(await service.getRouteMonitoringPreference('driver-1'), filter.monitoringDay()), true);
  assert.equal(filter.monitoringDay(new Date('2026-11-09T15:59:59Z')), '2026-11-09');
  assert.equal(filter.monitoringDay(new Date('2026-11-09T16:00:00Z')), '2026-11-10');
});
test('prompt suppression survives restart offline and is isolated by assignment, driver and Manila date', async () => {
  reset();
  assert.equal(await service.claimTripStartPrompt('driver-1','route-1'),true);
  assert.equal(await service.claimTripStartPrompt('driver-1','route-1'),false);
  tasks={};service=load('driver-route-proximity',dependencies);
  assert.equal(await service.claimTripStartPrompt('driver-1','route-1'),false);
  assert.equal(await service.claimTripStartPrompt('driver-1','route-2'),true);
  assert.equal(await service.claimTripStartPrompt('driver-2','route-1'),true);
  service=load('driver-route-proximity',{...dependencies,'./route-presence-filter':{...filter,monitoringDay:()=> '2099-01-01'}});
  assert.equal(await service.claimTripStartPrompt('driver-1','route-1'),true);
});

test('missing or malformed route geometry records valid trails without false route events, including after restart', async () => {
  for(const routePath of [null, {type:'LineString',coordinates:[]}, {type:'LineString',coordinates:[[0,95],[1,96]]}]) {
    reset();assert.equal((await service.enableRouteProximityTracking({...config,routePath})).enabled,true);
    await sample();await sample();await sample();assert.equal(points.length,3);assert.equal(events().length,0);
    assert.equal((await service.getRouteProximityStatus()).state,'unknown');
    tasks={};service=load('driver-route-proximity',dependencies);await sample();assert.equal(points.length,4);
    await service.processDriverRouteLocation({...fix(now+5000),mocked:true},config);assert.equal(points.length,4);
    await service.stopRouteProximityTracking();assert.equal((await service.getRouteProximityStatus()).enabled,false);
  }
});
test('missing driver or assignment cannot start recording',async()=>{
 reset();assert.equal((await service.enableRouteProximityTracking({...config,collectorId:undefined})).enabled,false);
 assert.equal((await service.enableRouteProximityTracking({...config,routeId:''})).enabled,false);assert.equal(nativeStarts,0);
});

(async () => {
  try {
    for (const [name, work] of tests) { await work(); console.log(`PASS ${name}`); }
    console.log(`Passed ${tests.length} route-monitoring tests.`);
  } finally { Date.now = realNow; db?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
