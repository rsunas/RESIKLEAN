// Exercise the real modal hooks with deterministic timers and app-state events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies, timers = {}) {
  const source = fs.readFileSync(__dirname + '/../' + file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const result = {};
  new Function('require', 'exports', ...Object.keys(timers), code)(key => {
    assert.ok(key in dependencies, `Unexpected dependency ${key}`);
    return dependencies[key];
  }, result, ...Object.values(timers));
  return result;
}
const intervals = new Set();
const countdown = load('src/lib/route-finish-countdown.ts', {}, {
  setInterval: callback => { intervals.add(callback); return callback; },
  clearInterval: callback => intervals.delete(callback),
});
const tick = () => [...intervals].forEach(callback => callback());
const slots = [];
let cursor = 0, effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const hooks = {
  useState(initial) {
    const i = cursor++; slots[i] ??= { value: initial };
    return [slots[i].value, value => { slots[i].value = value; }];
  },
  useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
  useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
  useEffect(fn, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
  },
};
const listeners = new Set();
const AppState = { currentState: 'active', addEventListener: (_, fn) => {
  listeners.add(fn); return { remove: () => listeners.delete(fn) };
} };
function appState(state) { AppState.currentState = state; [...listeners].forEach(fn => fn(state)); }
const jsx = (type, props) => ({ type, props });
const { FinishRouteModal } = load('src/components/finish-route-modal.tsx', {
  react: hooks,
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { AppState, ScrollView: 'scroll', View: 'view', StyleSheet: { create: value => value } },
  'react-native-safe-area-context': { SafeAreaView: 'safe' },
  'expo/node_modules/@expo/vector-icons': { Feather: 'icon' },
  '@/components/app-motion': { MotionModal: 'modal', MotionPressable: 'button' },
  '@/components/app-text': { AppText: 'text' },
  '@/lib/route-finish-countdown': countdown,
});
let cancelled = 0, confirmed = 0, visible = true, busy = false;
function render() {
  cursor = 0; effects = [];
  const tree = FinishRouteModal({ visible, busy,
    onCancel: () => { cancelled++; visible = false; }, onConfirm: () => { confirmed++; busy = true; },
  });
  effects.forEach(fn => fn());
  return tree;
}
function buttons(tree, result = []) {
  if (!tree || typeof tree !== 'object') return result;
  if (Array.isArray(tree)) { tree.forEach(child => buttons(child, result)); return result; }
  if (tree.type === 'button') result.push(tree);
  buttons(tree.props?.children, result);
  return result;
}
render();
buttons(render())[1].props.onPress();
tick();
// Online parent refreshes supply new callbacks but must preserve the countdown.
for (let i = 0; i < 20; i++) render();
assert.equal(intervals.size, 1);
appState('inactive');
assert.equal(cancelled, 0, 'System UI must not dismiss the dialog');
assert.equal(intervals.size, 0, 'Interrupted countdown must not finish in background');
appState('background'); appState('active');
assert.equal(render().props.visible, true);
assert.equal(buttons(render())[1].props.disabled, false, 'Driver can retry without reopening');
buttons(render())[1].props.onPress();
tick(); render(); tick(); render();
assert.equal(confirmed, 0);
tick(); render();
assert.equal(confirmed, 1);
assert.equal(buttons(render())[1].props.disabled, true);
render().props.onRequestClose();
appState('background'); appState('active');
assert.equal(cancelled, 0, 'Saving cannot be dismissed by Back or app state changes');
visible = false; busy = false; render();
visible = true; render();
buttons(render())[1].props.onPress();
buttons(render())[0].props.onPress();
tick(); tick(); tick();
assert.equal(cancelled, 1); assert.equal(confirmed, 1);
slots.forEach(slot => slot?.cleanup?.());
assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
console.log('PASS: online rerenders, system interruptions, three-second retry, busy protection and explicit cancellation.');
