// Runs actual hook/recipe source with a deterministic clock. No requests or cache writes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const raw = fs.readFileSync(path.join(__dirname, '../src/components/loading-skeleton.tsx'), 'utf8');
const source = ts.createSourceFile('skeleton.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
for (const statement of source.statements) {
  if (ts.isFunctionDeclaration(statement)) declarations.set(statement.name.text, statement.getText(source).replace(/^export /, ''));
  if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) declarations.set(declaration.name.getText(source), declaration.initializer.getText(source));
}
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn result;`)(...Object.values(context));
}
function harness() {
  const slots = [], timers = new Map();
  let now = 1000, cursor = 0, nextId = 0, dirty = false, effects = [], args = [false, false], result;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const context = {
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: initial };
      return [slots[index].value, update => { const value = typeof update === 'function' ? update(slots[index].value) : update; dirty ||= !Object.is(value, slots[index].value); slots[index].value = value; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    },
  };
  const hook = evaluate(declarations.get('useSkeletonVisible'), context);
  function render(next = args) {
    args = next;
    for (let count = 0; count < 20; count++) {
      cursor = 0; effects = []; dirty = false; result = hook(...args); effects.forEach(effect => effect());
      if (!dirty) return result;
    }
    throw new Error('Infinite render');
  }
  return {
    render,
    advance(ms) {
      const end = now + ms;
      for (let count = 0; count < 100; count++) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) { now = end; return render(); }
        now = next[1].at; timers.delete(next[0]); next[1].fn(); render();
      }
      throw new Error('Infinite timer');
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); assert.equal(timers.size, 0); },
  };
}
const tests = [];
function test(name, fn) { fn(); tests.push(name); }
test('150ms delay and fast success without a flash', () => {
  const h = harness(); assert.equal(h.render([true, false]).pending, true);
  assert.equal(h.advance(149).visible, false);
  assert.equal(h.render([false, true]).pending, false); h.unmount();
});
test('400ms minimum after showing, then content', () => {
  const h = harness(); h.render([true, false]); assert.equal(h.advance(150).visible, true);
  h.advance(50); assert.equal(h.render([false, true]).visible, true);
  assert.equal(h.advance(349).visible, true); assert.equal(h.advance(1).pending, false); h.unmount();
});
test('cached/offline data immediately wins; refresh never replaces it', () => {
  const h = harness(); assert.equal(h.render([true, true]).pending, false); assert.equal(h.advance(11000).pending, false); h.unmount();
  const late = harness(); late.render([true, false]); late.advance(200);
  assert.equal(late.render([true, true]).pending, false); late.unmount();
});
test('offline with no cache times out at 10 seconds', () => {
  const h = harness(); h.render([true, false]); h.advance(9999);
  assert.equal(h.advance(1).timedOut, true); assert.equal(h.advance(10000).pending, false); h.unmount();
});
test('error releases skeleton immediately', () => {
  const h = harness(); h.render([true, false]); h.advance(200);
  assert.equal(h.render([true, false, 'Offline']).pending, false); h.unmount();
});
test('empty results settle and do not skeletonize on refresh', () => {
  const h = harness(); h.render([true, false]); h.advance(200); h.render([false, false]); h.advance(400);
  assert.equal(h.render([true, false]).pending, false); h.unmount();
});
test('refresh during an empty result minimum hold cannot strand the skeleton', () => {
  const h = harness(); h.render([true, false]); h.advance(200); h.render([false, false]);
  assert.equal(h.render([true, false]).pending, false);
  assert.equal(h.advance(11000).visible, false); h.unmount();
});
test('resource switch resets timeout, tab rerenders do not restart it', () => {
  const h = harness(); h.render([true, false, '', 'a']); h.advance(5000); h.render(); h.advance(5000);
  assert.equal(h.render().timedOut, true);
  assert.equal(h.render([true, false, '', 'b']).pending, true);
  assert.equal(h.advance(150).visible, true); h.unmount();
});
test('unmount cancels delayed show and timeout', () => { const h = harness(); h.render([true, false]); h.unmount(); });

const styles = evaluate(declarations.get('styles'), { StyleSheet: RN.StyleSheet });
const contexts = [];
const fixtures = [];
for (const reduced of [false, true]) {
  const calls = [];
  const Skeleton = props => { calls.push(props); return props.isLoading === false ? props.children : React.createElement(RN.View, { style: props.style }); };
  const SkeletonGroup = props => { calls.push(props); return React.createElement(RN.View, null, props.children); };
  SkeletonGroup.Item = props => React.createElement(RN.View, { style: props.style, dataSet: { block: true } });
  const context = { React, View: RN.View, styles, Skeleton, SkeletonGroup, animation: {}, useSkeletonMotion: () => reduced, useRef: () => ({ current: false }), useEffect: () => {} };
  for (const name of ['SkeletonBlock', 'SkeletonRow', 'SkeletonRows', 'SkeletonRegion']) context[name] = evaluate(declarations.get(name), context);
  contexts.push(context);
  test(`accessibility and ${reduced ? 'reduced' : 'normal'} motion`, () => {
    const tree = context.SkeletonRegion({ state: { pending: true, visible: true }, placeholder: React.createElement(context.SkeletonBlock, { height: 100 }) });
    assert.equal(tree.props.accessibilityLabel, 'Loading'); assert.equal(tree.props.accessibilityState.busy, true);
    assert.equal(tree.props.children.props.importantForAccessibility, 'no-hide-descendants');
    renderToStaticMarkup(tree); assert.equal(calls[0].variant, reduced ? 'none' : 'shimmer');
    const cached = context.SkeletonRegion({ state: { pending: false }, children: 'cached data' });
    assert.equal(cached.props.animation, 'disable-all', 'Already cached content must not wait on a fade');
    assert.equal(renderToStaticMarkup(cached), 'cached data');
  });
  for (const scale of [1, 2]) for (const kind of ['weekly', 'report', 'complaint', 'account', 'stop', 'history', 'staff', 'chat', 'faq']) {
    const tree = React.createElement(context.SkeletonRegion, { state: { pending: true, visible: true }, placeholder: React.createElement(context.SkeletonRows, { kind, count: kind === 'complaint' ? 7 : 5 }) });
    fixtures.push(`<section data-kind="${kind}" data-scale="${scale}" style="width:360px;padding:20px;box-sizing:border-box;font-size:${14 * scale}px">${renderToStaticMarkup(tree)}</section>`);
  }
}
console.log(`PASS: ${tests.length} loading-state/accessibility checks: ${tests.join('; ')}`);
if (process.argv.includes('--logic-only')) process.exit(0);
function browserCheck() {
  const failures = [];
  for (const section of document.querySelectorAll('section')) {
    const bounds = section.getBoundingClientRect();
    for (const item of section.querySelectorAll('[data-block]')) {
      const rect = item.getBoundingClientRect();
      if (rect.left < bounds.left || rect.right > bounds.right + 1 || rect.width <= 0 || rect.height <= 0) failures.push(`${section.dataset.kind}: block outside 360px layout`);
    }
  }
  document.getElementById('result').textContent = JSON.stringify({ fixtures: document.querySelectorAll('section').length, failures });
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-skeleton-'));
const target = path.join(dir, 'fixtures.html');
fs.writeFileSync(target, `<!doctype html><html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}body{margin:0}</style></head><body>${fixtures.join('')}<pre id="result"></pre><script>(${browserCheck.toString()})()</script></body></html>`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'edge')}`, '--dump-dom', pathToFileURL(target).href], { timeout: 60000, maxBuffer: 5 * 1024 * 1024, windowsHide: true }).toString();
const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
assert.ok(result, 'Browser result missing');
const parsed = JSON.parse(result.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
console.log(JSON.stringify(parsed)); assert.deepEqual(parsed.failures, []);
