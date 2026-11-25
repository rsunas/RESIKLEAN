// Executes the actual presentation hooks with deterministic Reanimated adapters.
// No network, native permissions, application data, or filesystem writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
let owner;
let reduced = false;
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const hooks = {
  forwardRef: render => props => render(props, null),
  useRef(initial) { const i = owner.cursor++; owner.slots[i] ??= { current: initial }; return owner.slots[i]; },
  useState(initial) {
    const instance = owner, i = instance.cursor++;
    instance.slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [instance.slots[i].value, next => { const value = typeof next === 'function' ? next(instance.slots[i].value) : next; instance.dirty ||= !Object.is(value, instance.slots[i].value); instance.slots[i].value = value; }];
  },
  useEffect(run, deps) {
    const instance = owner, i = instance.cursor++;
    if (!same(instance.slots[i]?.deps, deps)) instance.effects.push(() => { instance.slots[i]?.cleanup?.(); instance.slots[i] = { deps, cleanup: run() }; });
  },
};
function builder(kind) { return { kind, duration(ms) { return { ...this, ms }; }, easing(curve) { return { ...this, curve }; } }; }
const native = { Modal: 'Modal', Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } };
const animated = {
  __esModule: true, default: { View: 'AnimatedView', createAnimatedComponent: () => 'AnimatedPressable' },
  LayoutAnimationConfig: 'LayoutAnimationConfig', FadeIn: builder('fade-in'), FadeOut: builder('fade-out'),
  ReduceMotion: { System: 'system' }, Easing: { cubic: 'cubic', in: () => 'ease-in', out: () => 'ease-out' },
  withTiming: (target, config, callback) => ({ target, ...config, callback }),
  withDelay: (delay, animation, reduceMotion) => ({ delay, animation, reduceMotion }), runOnJS: fn => fn,
  cancelAnimation: value => { value.pending = null; value.cancelled++; },
  useAnimatedStyle: fn => fn(),
  useSharedValue(initial) {
    const ref = hooks.useRef(null);
    if (!ref.current) {
      const sv = { current: initial, pending: null, cancelled: 0 };
      Object.defineProperty(sv, 'value', { get: () => sv.current, set: value => { if (value && typeof value === 'object') sv.pending = value; else { sv.current = value; sv.pending = null; } } });
      ref.current = sv; owner.values.push(sv);
    }
    return ref.current;
  },
};
const raw = fs.readFileSync(path.join(__dirname, '../src/components/app-motion.tsx'), 'utf8');
const js = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const api = {};
const mocks = { react: hooks, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native, 'react-native-reanimated': animated, '@/hooks/use-app-reduced-motion': { useAppReducedMotion: () => reduced } };
Object.assign(mocks, require('./mobile-theme-fixture.cjs').themeDependencies('dark'));
new Function('require', 'exports', js)(name => { assert.ok(mocks[name], `Unexpected dependency: ${name}`); return mocks[name]; }, api);
function harness(fn) {
  const instance = { slots: [], values: [], cursor: 0, effects: [], dirty: false };
  let args;
  return {
    values: instance.values,
    render(...next) {
      if (next.length) args = next;
      for (let n = 0; n < 20; n++) {
        owner = instance; instance.cursor = 0; instance.effects = []; instance.dirty = false;
        const output = fn(...args); instance.effects.forEach(run => run());
        if (!instance.dirty) return output;
      }
      throw new Error('Render loop');
    },
    finish() { instance.values.forEach(sv => { const pending = sv.pending; if (pending) { sv.value = pending.target; pending.callback?.(true); } }); },
    dispose() { instance.slots.forEach(slot => slot?.cleanup?.()); },
  };
}
let count = 0;
function test(name, run) { reduced = false; run(); count++; console.log(`PASS ${name}`); }
test('tab crossfade is 180ms and first mount is skipped; no cloned React screen', () => {
  const child = React.createElement('Screen');
  const h = harness(api.TabTransition), view = h.render({ activeKey: 'home', children: child });
  const config = view.props.children, page = config.props.children;
  assert.equal(config.props.skipEntering, true);
  assert.equal(page.props.entering.ms, 180); assert.equal(page.props.exiting.ms, 180);
  assert.equal(page.props.entering.curve, 'ease-out'); assert.equal(page.props.exiting.curve, 'ease-in');
  assert.equal(page.props.children, child); assert.equal(page.key, 'home');
  reduced = true;
  assert.equal(h.render({ activeKey: 'profile', children: child }).props.children.props.children.props.entering, undefined);
});
test('pill measures actual items, skips initial slide, retargets rapid taps and snaps on resize/reduce motion', () => {
  const h = harness(api.useSlidingTabPill);
  let pill = h.render('home');
  const event = (x, y) => ({ nativeEvent: { layout: { x, y, width: 56, height: 32 } } });
  pill.itemLayout('home', event(0, 8)); pill.iconLayout('home', event(17, 0));
  pill.itemLayout('profile', event(270, 8)); pill.iconLayout('profile', event(17, 0));
  pill = h.render('home'); assert.equal(h.values[0].value, 17); assert.equal(h.values[0].pending, null);
  h.render('profile'); assert.equal(h.values[0].pending.target, 287); assert.equal(h.values[0].pending.duration, 250);
  h.render('home'); assert.equal(h.values[0].pending.target, 17); h.finish();
  pill.itemLayout('home', event(0, 12)); pill.iconLayout('home', event(20, 0)); h.render('home');
  assert.equal(h.values[0].value, 20); assert.equal(h.values[1].value, 12); assert.equal(h.values[0].pending, null);
  reduced = true; h.render('profile'); assert.equal(h.values[0].value, 287); assert.equal(h.values[0].pending, null);
  h.dispose(); assert.ok(h.values[0].cancelled > 0);
});
test('press styles are attached directly, callbacks are forwarded, disabled/reduced buttons do not shrink', () => {
  const calls = [], h = harness(api.MotionPressable);
  const props = { style: ({ pressed }) => ({ opacity: pressed ? 0.8 : 1 }), onPress: () => calls.push('press'), onPressIn: () => calls.push('in'), onPressOut: () => calls.push('out'), accessibilityLabel: 'Unchanged', testID: 'unchanged' };
  let button = h.render(props); assert.ok(Array.isArray(button.props.style));
  button.props.onPressIn({}); assert.equal(h.values[0].pending.target, 0.97); assert.equal(h.values[0].pending.duration, 100);
  button = h.render(props); assert.equal(button.props.style[0].opacity, 0.8);
  button.props.onPress({}); button.props.onPressOut({}); assert.equal(h.values[0].pending.target, 1);
  assert.deepEqual(calls, ['in', 'press', 'out']); assert.equal(button.props.testID, 'unchanged');
  button = h.render({ ...props, disabled: true }); button.props.onPressIn({}); assert.equal(h.values[0].pending, null);
  reduced = true; button = h.render(props); button.props.onPressIn({}); assert.equal(h.values[0].value, 1);
});
test('native modal visibility/close behavior is unchanged; reduce motion replaces slide with fade', () => {
  const close = () => {}, h = harness(api.MotionModal);
  const props = { visible: true, onRequestClose: close, presentationStyle: 'fullScreen', children: 'detail' };
  let modal = h.render(props); assert.equal(modal.props.animationType, 'slide'); assert.equal(modal.props.onRequestClose, close);
  reduced = true; modal = h.render({ ...props, visible: false }); assert.equal(modal.props.visible, false); assert.equal(modal.props.animationType, 'fade');
  assert.equal(h.render({ ...props, animationType: 'none' }).props.animationType, 'none');
});
test('detail data survives closing without changing selected state', () => {
  const h = harness(api.useClosingValue), record = { id: 'one' };
  assert.equal(h.render(null), null); assert.equal(h.render(record), record); assert.equal(h.render(null), record);
  const other = { id: 'two' }; assert.equal(h.render(other), other);
});
test('signup direction reverses, uses 12px/250ms and fades under reduced motion', () => {
  const h = harness(api.SignupStepTransition);
  let config = h.render({ step: 2, children: 'details' }), view = config.props.children;
  assert.equal(config.props.skipEntering, true);
  assert.equal(view.props.entering().initialValues.transform[0].translateX, 12);
  assert.equal(view.props.entering().animations.opacity.duration, 250);
  assert.equal(view.props.exiting().animations.transform[0].translateX.target, 12);
  view = h.render({ step: 1, children: 'verify' }).props.children;
  assert.equal(view.props.entering().initialValues.transform[0].translateX, -12);
  assert.equal(view.props.exiting().animations.transform[0].translateX.target, -12);
  reduced = true; assert.equal(h.render({ step: 2 }).props.children.props.entering.kind, 'fade-in');
});
test('toasts slide down and leave upward with ease-in, reduced motion fades only', () => {
  const h = harness(api.ToastMotion); let view = h.render({ children: 'saved' });
  assert.equal(view.props.entering().initialValues.transform[1].translateY, -12);
  assert.equal(view.props.exiting().animations.opacity.easing, 'ease-in');
  reduced = true; view = h.render({}); assert.equal(view.props.entering.kind, 'fade-in');
});
test('accordion close is delayed, rapid reopen invalidates a stale close callback, reduction settles immediately', () => {
  const h = harness(api.AccordionBody);
  assert.equal(h.render({ expanded: false }), null);
  assert.ok(h.render({ expanded: true, children: 'answer' })); h.finish();
  const closing = h.render({ expanded: false }); assert.equal(closing.props.pointerEvents, 'none');
  const stale = h.values[0].pending.callback;
  assert.equal(h.values[0].pending.duration, 200);
  h.render({ expanded: true }); stale(true); assert.ok(h.render({ expanded: true }));
  reduced = true; assert.equal(h.render({ expanded: false }), null); assert.equal(h.values[0].value, 0);
  h.dispose();
});
test('chevron rotation is 200ms and can stop immediately for reduce motion', () => {
  const h = harness(api.MotionChevron); h.render({ expanded: false }); h.finish(); h.render({ expanded: true });
  assert.equal(h.values[0].pending.target, 180); assert.equal(h.values[0].pending.duration, 200);
  reduced = true; h.render({ expanded: false }); assert.equal(h.values[0].value, 0); assert.equal(h.values[0].pending, null);
});
test('first-load stagger is one-shot, waits for skeleton and never replays on refresh/empty refresh', () => {
  const h = harness(api.useFirstLoadReveal);
  assert.equal(h.render(true, false, true), false);
  assert.equal(h.render(false, true, true), false);
  assert.equal(h.render(false, true, false), true);
  assert.equal(h.render(false, true, false), false);
  assert.equal(h.render(true, true, false), false); assert.equal(h.render(false, true, false), false);
  const empty = harness(api.useFirstLoadReveal);
  empty.render(true, false, true); empty.render(false, false, false);
  empty.render(true, false, true); assert.equal(empty.render(false, true, false), false);
  const cached = harness(api.useFirstLoadReveal); assert.equal(cached.render(false, true, false), false);
});
test('only first six rows animate, 40ms stagger, opacity/transform only', () => {
  const h = harness(api.RevealRow);
  for (let index = 0; index < 29; index++) {
    const view = h.render({ animate: true, index });
    if (index >= 6) { assert.equal(view.props.entering, undefined); continue; }
    const animation = view.props.entering();
    assert.deepEqual(Object.keys(animation.animations).sort(), ['opacity', 'transform']);
    assert.equal(animation.animations.opacity.delay, index * 40);
    assert.equal(animation.animations.opacity.animation.duration, 250);
  }
  assert.equal(h.render({ animate: false, index: 0 }).props.entering, undefined);
  reduced = true; assert.equal(h.render({ animate: true, index: 0 }).props.entering, undefined);
});
function sourceFunction(relative, name, context) {
  const file = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const source = ts.createSourceFile(relative, file, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name);
  assert.ok(declaration, `Missing ${name}`);
  const compiled = ts.transpileModule(`const result = ${declaration.getText(source).replace(/^export /, '')};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${compiled}\nreturn result;`)(...Object.values(context));
}
test('cold index redirect and initial deep links do not animate; subsequent auth navigation fades and back stays animated', () => {
  let state;
  const Stack = Object.assign(() => null, { Screen: () => null });
  const AppStack = sourceFunction('app/_layout.tsx', 'AppStack', { React, Stack, ...hooks, useAppReducedMotion: () => reduced, useRootNavigationState: () => state });
  const h = harness(AppStack);
  const route = (name, key = name) => ({ routes: [{ name, key }], index: 0 });
  state = undefined; assert.equal(h.render({}).props.screenOptions.animation, 'none');
  state = route('index'); assert.equal(h.render({}).props.screenOptions.animation, 'none');
  state = route('login'); assert.equal(h.render({}).props.screenOptions.animation, 'none');
  state = route('signup'); let tree = h.render({});
  assert.equal(tree.props.screenOptions.animation, 'slide_from_right');
  tree.props.children.forEach(screen => assert.equal(screen.props.options.animation, 'fade'));
  state = route('login'); assert.equal(h.render({}).props.children[0].props.options.animation, 'fade');
  state = route('resident'); assert.equal(h.render({}).props.children[2].props.options.animation, 'fade');
  reduced = true; assert.equal(h.render({}).props.screenOptions.animation, 'fade');
  for (const name of ['resident', 'staff', 'collector', 'signup']) {
    const cold = harness(AppStack); state = route(name); assert.equal(cold.render({}).props.screenOptions.animation, 'none');
  }
});
test('one shared reduce-motion listener, live changes win over stale initial read, cleanup removes listener', () => {
  let listener, resolveRead, subscriptions = 0, removals = 0;
  const AppMotionProvider = sourceFunction('src/hooks/use-app-reduced-motion.ts', 'AppMotionProvider', {
    ...hooks, createElement: React.createElement, MotionPreference: { Provider: 'Preference' }, useReducedMotion: () => false,
    // Intentional deferred Promise adapter: release the initial query after a live change.
    // eslint-disable-next-line unicorn/no-thenable
    AccessibilityInfo: { addEventListener: (name, callback) => { assert.equal(name, 'reduceMotionChanged'); subscriptions++; listener = callback; return { remove: () => removals++ }; }, isReduceMotionEnabled: () => ({ then(callback) { resolveRead = callback; return { catch() {} }; } }) },
  });
  const h = harness(AppMotionProvider);
  assert.equal(h.render({}).props.value, false); listener(true);
  assert.equal(h.render({}).props.value, true); resolveRead(false);
  assert.equal(h.render({}).props.value, true); assert.equal(subscriptions, 1);
  listener(false); assert.equal(h.render({}).props.value, false);
  h.dispose(); assert.equal(removals, 1);
});
console.log(`Passed ${count} motion regression checks (native scheduling mocked; device gesture/performance QA still required).`);
