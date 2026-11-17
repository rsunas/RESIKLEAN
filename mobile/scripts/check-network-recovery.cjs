const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(name, deps, globals = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', ...Object.keys(globals), js)(key => { assert.ok(key in deps, key); return deps[key]; }, exports, ...Object.values(globals));
  return exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  let nativeListener, appListener, tick, refreshed = 0, recovered = 0, cleaned = 0, now = 0;
  let nativeState = { isConnected: false, isInternetReachable: false, type: 'wifi' };
  const AppState = { currentState: 'active', addEventListener: (_, listener) => { appListener = listener; return { remove() { cleaned++; } }; } };
  const net = { addEventListener(listener) { nativeListener = listener; listener(nativeState); return () => { cleaned++; }; }, refresh: async () => { refreshed++; nativeListener(nativeState); return nativeState; } };
  const recovery = load('network-recovery', { '@react-native-community/netinfo': { default: net }, 'react-native': { AppState } }, { Date: { now: () => now }, setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleaned++; } });
  const unsubscribe = recovery.subscribeToNetworkRecovery(() => recovered++);
  const stop = recovery.startNetworkRecovery(); await flush(); assert.equal(refreshed, 1); assert.equal(recovered, 0);
  // Cached offline state, no native event: periodic refresh discovers restored Wi-Fi.
  nativeState = { isConnected: true, isInternetReachable: true, type: 'wifi' }; now += 15000; tick(); await flush(); assert.equal(recovered, 1);
  now += 15000; tick(); await flush(); assert.equal(recovered, 1, 'healthy checks do not reload screens');
  recovery.requestNetworkRetry(); now += 15000; tick(); await flush(); assert.equal(recovered, 2, 'failed reads retry even if Wi-Fi never disconnected');
  now += 15000; AppState.currentState = 'background'; const before = refreshed; tick(); await flush(); assert.equal(refreshed, before);
  AppState.currentState = 'active'; appListener('active'); await flush(); assert.equal(recovered, 3);
  now += 15000; nativeState = { ...nativeState, type: 'cellular' }; nativeListener(nativeState); assert.equal(recovered, 4);
  unsubscribe(); stop(); now += 15000; tick(); await flush(); assert.equal(recovered, 4); assert.equal(cleaned, 3);

  const timeout = load('async-timeout', {});
  let requests = 0, retries = 0, capturedSignal, mode = 'timeout';
  const request = load('network-request', { './async-timeout': timeout, './network-recovery': { requestNetworkRetry: () => retries++ } }, { fetch: async (_, options) => {
    requests++; capturedSignal = options.signal;
    if (mode === 'timeout') return new Promise(() => {});
    if (mode === 'body-timeout') return { json: () => new Promise(() => {}) };
    return { ok: mode === 'ok', status: mode === 'ok' ? 200 : 503, json: async () => ({ success: mode === 'ok' }) };
  } }).requestJson;
  await assert.rejects(request('https://fixture', {}, 10), /timed out/); assert.equal(capturedSignal.aborted, true); assert.equal(retries, 1);
  await assert.rejects(request('https://fixture', { method: 'POST' }, 10), /timed out/); assert.equal(requests, 2); assert.equal(retries, 1, 'mutation is not automatically retried');
  mode = 'body-timeout'; await assert.rejects(request('https://fixture', {}, 10), /timed out/); assert.equal(capturedSignal.aborted, true);
  mode = 'error'; const failed = await request('https://fixture'); assert.equal(failed.response.status, 503);
  mode = 'ok'; assert.equal((await request('https://fixture')).payload.success, true);
  console.log('PASS: stale Wi-Fi refresh, reconnect, foreground recovery, server failure retry, network switching, background pause and cleanup; bounded request/body, abort and no mutation replay.');
})().catch(error => { console.error(error); process.exitCode = 1; });
