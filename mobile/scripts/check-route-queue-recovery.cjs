const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
const database = { execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args), getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args) };
let online = false, hang = true, calls = 0, id = 0;
function load(name, deps, globals = {}) {
 const out = {};
 const code = ts.transpileModule(fs.readFileSync(__dirname + '/../src/lib/' + name + '.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 new Function('require', 'exports', ...Object.keys(globals), code)(key => { assert.ok(deps[key], key); return deps[key]; }, out, ...Object.values(globals)); return out;
}
const timeout = load('async-timeout', {});
const requests = load('network-request', { './async-timeout': timeout, './network-recovery': { requestNetworkRetry() {} } }, { fetch: async (_, options) => {
 calls++; if (hang) return new Promise(() => {});
 const body = JSON.parse(options.body);
 return { ok: true, status: 200, json: async () => ({ success: true, data: { syncedIds: (body.logs || []).map(log => log.clientId) } }) };
} });
const deps = { './network-request': { requestJson: (url, options) => requests.requestJson(url, options, 10) }, '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: online, isInternetReachable: online }), addEventListener: () => () => {} } }, 'expo-sqlite': { openDatabaseAsync: async () => database }, 'expo-crypto': { randomUUID: () => 'id-' + ++id } };
(async () => {
 const logs = load('driver-route-log-queue', deps), completions = load('driver-route-completion', deps);
 const context = { apiUrl: 'https://fixture', token: 'token', collectorId: 'driver' };
 const updates = [], otherUpdates = [];
 const unsubscribe = logs.subscribeToRouteLogSync(context, result => updates.push(result));
 const unsubscribeOther = logs.subscribeToRouteLogSync({ ...context, collectorId: 'another-driver' }, result => otherUpdates.push(result));
 await logs.syncRouteLogQueue(context);
 await logs.queueRouteLog({ collectorId: 'driver', stopId: 'stop', collectedAt: '2026-11-16T01:00:00Z', exitedAt: '2026-11-16T01:01:00Z', latitude: 13.6, longitude: 123.2 });
 assert.equal((await logs.syncRouteLogQueue(context)).pending, 1); assert.equal(calls, 0);
 online = true; await logs.syncRouteLogQueue(context); assert.equal((await logs.getRouteLogQueueStats('driver')).pending, 1);
 hang = false; assert.equal((await logs.syncRouteLogQueue(context)).synced, 1); assert.equal((await logs.getRouteLogQueueStats('driver')).pending, 0);
 assert.equal(updates.filter(result => result.synced === 1).length, 1, 'Direct geofence upload should notify the visible checklist once');
 assert.equal(otherUpdates.length, 0, 'Do not update another driver');
 unsubscribe(); unsubscribeOther();
 const updateCount = updates.length; await logs.syncRouteLogQueue(context); assert.equal(updates.length, updateCount);
 await completions.queueRouteCompletion('route', 'driver'); hang = true;
 assert.equal(await completions.syncRouteCompletions(context.apiUrl, context.token, 'driver'), 0); assert.equal(await completions.isRouteCompletionQueued('route', 'driver'), true);
 hang = false; assert.equal(await completions.syncRouteCompletions(context.apiUrl, context.token, 'driver'), 1); assert.equal(await completions.isRouteCompletionQueued('route', 'driver'), false);
 console.log('PASS: pending stop logs and route completions survive offline/timeouts, release sync locks, and upload successfully on retry.');
 db.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
