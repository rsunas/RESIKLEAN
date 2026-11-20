const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
const database = {
  execAsync: async sql => db.exec(sql),
  runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
  getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
  getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
};
let online = false, status = 200, requests = 0, release;
const dependencies = {
  'expo-sqlite': { openDatabaseAsync: async () => database },
  '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: online, isInternetReachable: online }) } },
  './async-timeout': { withTimeout: promise => promise },
  './network-request': { requestJson: async () => {
    requests++;
    if (release) await new Promise(resolve => { release.resolve = resolve; });
    return { response: { ok: status === 200, status }, payload: { success: status === 200 } };
  } },
};
const mod = { exports: {} };
const source = fs.readFileSync(__dirname + '/../src/lib/driver-route-completion.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function('require', 'module', 'exports', code)(key => dependencies[key], mod, mod.exports);
const queue = mod.exports;
(async () => {
  await queue.queueRouteCompletion('route', 'driver');
  assert.equal(await queue.syncRouteCompletions('https://mock', 'token', 'driver'), 0);
  assert.equal(requests, 0);
  online = true; status = 400;
  await queue.syncRouteCompletions('https://mock', 'token', 'driver');
  assert.equal((await queue.getQueuedRouteCompletions('driver')).length, 1);
  status = 200; release = {};
  const first = queue.syncRouteCompletions('https://mock', 'token', 'driver');
  assert.equal(queue.syncRouteCompletions('https://mock', 'token', 'driver'), first);
  while (!release.resolve) await new Promise(resolve => setImmediate(resolve));
  // A second completion saved during upload must survive the older response.
  db.prepare("UPDATE driver_route_completions SET queued_at = 'newer'").run();
  release.resolve(); await first; release = null;
  assert.equal((await queue.getQueuedRouteCompletions('driver')).length, 1);
  assert.equal(await queue.syncRouteCompletions('https://mock', 'token', 'driver'), 1);
  assert.equal((await queue.getQueuedRouteCompletions('driver')).length, 0);
  console.log('PASS: offline completion, rejected-response retention, concurrent upload deduplication and newer-record protection.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
