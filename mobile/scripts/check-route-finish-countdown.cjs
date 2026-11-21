const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(__dirname + '/../src/lib/route-finish-countdown.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let tick;
let cleared = 0;
const exportsObject = {};
new Function('exports', 'setInterval', 'clearInterval', code)(exportsObject, (fn, ms) => {
  assert.equal(ms, 1000);
  tick = fn;
  return 1;
}, () => { cleared += 1; });
const { startRouteFinishCountdown } = exportsObject;
let finished = 0;
const seconds = [];
startRouteFinishCountdown(value => seconds.push(value), () => { finished += 1; });
assert.deepEqual(seconds, [3]);
for (let i = 0; i < 2; i += 1) tick();
assert.deepEqual(seconds, [3, 2, 1]);
assert.equal(finished, 0, 'must not finish before three seconds');
tick();
assert.equal(finished, 1);
tick();
assert.equal(finished, 1, 'cannot submit twice');
for (const cancelAfter of [0, 1, 2]) {
  const cancel = startRouteFinishCountdown(() => {}, () => { finished += 1; });
  for (let i = 0; i < cancelAfter; i += 1) tick();
  cancel();
  for (let i = 0; i < 6; i += 1) tick();
  assert.equal(finished, 1, 'cancel must prevent submission, including a queued timer callback');
}
assert.equal(cleared, 4);
console.log('PASS: three-second grace period, cancellation at 0/1/2 seconds, and single submission.');
