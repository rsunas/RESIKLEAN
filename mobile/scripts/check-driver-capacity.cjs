const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
function load(name, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = {};
  new Function('exports', 'require', code)(output, key => {
    assert.ok(key in imports, `Unexpected import ${key}`);
    return imports[key];
  });
  return output;
}
async function main() {
  const { countLoadedStops, truckCapacityTonnes } = load('driver-capacity');
  const before = '2026-11-18T01:00:00Z';
  const after = '2026-11-18T03:00:00Z';
  const cutoff = Date.parse('2026-11-18T02:00:00Z');
  assert.equal(truckCapacityTonnes({ length: 5, width: 2, height: 1 }), 2.94);
  for (const truck of [null, {}, { length: -1, width: 2, height: 1 }, { length: NaN, width: 2, height: 1 }]) assert.equal(truckCapacityTonnes(truck), 0);
  const logs = [{ stopId: 'a', collectedAt: before }, { stopId: 'b', collectedAt: before, exitedAt: after }, { stopId: 'b', collectedAt: before, exitedAt: after }, { stopId: 'other-route', collectedAt: after }];
  assert.equal(countLoadedStops(logs, ['a', 'b'], cutoff), 1, 'exclude before-reset and other routes, deduplicate synced/queued copies, use completion time');
  assert.equal(countLoadedStops(logs, ['a', 'b'], Date.parse(after)), 0, 'empty all existing stops');
  assert.equal(countLoadedStops(logs, ['a', 'b'], 0, cutoff), 1, 'exclude earlier shift');

  const sql = new DatabaseSync(':memory:');
  let reply;
  let fail = false;
  let sent = [];
  const imports = {
    'expo-sqlite': { openDatabaseAsync: async () => ({
      execAsync: async statement => sql.exec(statement),
      runAsync: async (statement, ...values) => sql.prepare(statement).run(...values),
      getFirstAsync: async (statement, ...values) => sql.prepare(statement).get(...values),
      getAllAsync: async (statement, ...values) => sql.prepare(statement).all(...values),
    }) },
    './network-request': { requestJson: async (_url, options) => {
      sent = JSON.parse(options.body).logs;
      if (fail) throw new Error('offline');
      return { response: { ok: true }, payload: { success: true, data: { syncedIds: reply } } };
    } },
  };
  process.env.EXPO_PUBLIC_API_URL = 'https://example.invalid';
  let queue = load('driver-capacity-queue', imports);
  const context = { collectorId: 'one', cycleLogId: 'cycle', truckId: 'truck', routeId: 'route' };
  const record = { ...context, type: 'reset', fillLevelPct: 0, loggedAt: after, clientId: 'first' };
  await queue.queueCapacityLog(record);
  await queue.queueCapacityLog(record);
  await queue.queueCapacityLog({ ...record, clientId: 'second', loggedAt: before });
  await queue.queueCapacityLog({ ...record, clientId: 'other-driver', collectorId: 'two' });
  fail = true;
  await assert.rejects(queue.syncCapacityQueue('token', 'one'), /offline/);
  assert.equal(sql.prepare('SELECT count(*) AS count FROM driver_capacity_events WHERE synced = 0').get().count, 3);
  fail = false;
  reply = ['first', 'other-driver'];
  await queue.syncCapacityQueue('token', 'one');
  assert.deepEqual(new Set(sent.map(item => item.clientId)), new Set(['first', 'second']));
  assert.equal(sql.prepare("SELECT synced FROM driver_capacity_events WHERE client_id = 'second'").get().synced, 0, 'partial failures remain queued');
  assert.equal(sql.prepare("SELECT synced FROM driver_capacity_events WHERE client_id = 'other-driver'").get().synced, 0, 'cannot acknowledge another owner');
  queue = load('driver-capacity-queue', imports);
  assert.equal(await queue.getLocalCapacityReset(context), Date.parse(after), 'acknowledged reset survives restart offline');
  assert.equal(await queue.getLocalCapacityReset({ ...context, cycleLogId: 'new-cycle' }), 0);
  assert.equal(await queue.getLocalCapacityReset({ ...context, truckId: 'new-truck' }), 0);
  reply = ['second'];
  await queue.syncCapacityQueue('token', 'one');
  assert.deepEqual(sent.map(item => item.clientId), ['second'], 'retry only outstanding records');
  sql.close();
  console.log('PASS: fill, reset cutoff, deduplication, shift isolation, offline persistence, partial acknowledgement, owner isolation, retry.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
