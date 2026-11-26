const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const ts = require('typescript');
const React = require('react');

// Exercise the installed native component, including its Android hide event
// calculation. Only the OS events and native View rendering are substituted.
const listeners = new Map();
const platform = { OS: 'android' };
const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value || {};
const Keyboard = {
  isVisible: () => false,
  addListener: (name, listener) => {
    listeners.set(name, listener);
    return { remove: () => listeners.delete(name) };
  },
};
const nativePath = require.resolve('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView');
const nativeCode = babel.transformSync(fs.readFileSync(nativePath, 'utf8'), {
  filename: nativePath, babelrc: false, configFile: false,
  plugins: ['@babel/plugin-transform-flow-strip-types', '@babel/plugin-transform-modules-commonjs'],
  presets: ['@babel/preset-react'],
}).code;
const nativeExports = {};
new Function('require', 'exports', nativeCode)(name => {
  if (name === 'react') return React;
  if (name.endsWith('/Platform')) return platform;
  if (name.endsWith('/StyleSheet')) return { compose: (a, b) => [a, b] };
  if (name.endsWith('/Keyboard')) return Keyboard;
  if (name.endsWith('/View')) return 'NativeView';
  if (name.endsWith('/LayoutAnimation')) return { configureNext() {}, Types: {} };
  if (name.endsWith('/AccessibilityInfo')) return { prefersCrossFadeTransitions: async () => false };
  throw new Error('Unexpected native import: ' + name);
}, nativeExports);
const NativeKeyboardAvoidingView = nativeExports.default;

let viewportState = { keyboardOpen: false, frame: undefined };
const wrapperPath = path.join(__dirname, '../src/components/keyboard-viewport.tsx');
const wrapperCode = ts.transpileModule(fs.readFileSync(wrapperPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const wrapperExports = {};
new Function('require', 'exports', wrapperCode)(name => {
  if (name === 'react') return { ...React, useRef: () => ({ current: null }), useEffect() {} };
  if (name === 'react/jsx-runtime') return require(name);
  if (name === 'react-native') return { KeyboardAvoidingView: NativeKeyboardAvoidingView, Platform: platform, View: 'NativeView' };
  if (name === '@/hooks/use-keyboard-viewport') return { useKeyboardViewport: () => viewportState };
  throw new Error('Unexpected wrapper import: ' + name);
}, wrapperExports);
const propsFor = (open, active = true) => {
  viewportState = { keyboardOpen: open, frame: undefined };
  return wrapperExports.KeyboardViewport({ active, children: null }).props.children.props;
};
const layout = async (view, height) => view._onLayout({ persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 360, height } } });
const emit = async (name, screenY, height) => {
  listeners.get(name)({ duration: 0, endCoordinates: { screenX: 0, screenY, width: 360, height } });
  await new Promise(resolve => setImmediate(resolve));
};

(async () => {
  for (const systemInsets of [0, 24, 48]) {
    const view = new NativeKeyboardAvoidingView(propsFor(false));
    view.setState = next => { view.state = { ...view.state, ...next }; };
    view.componentDidMount();
    await layout(view, 800);
    for (let cycle = 0; cycle < 3; cycle++) {
      view.props = propsFor(true);
      await emit('keyboardDidShow', 500, 300);
      // Feed each rendered height back as native layout would, until settled.
      for (let pass = 0; pass < 4; pass++) {
        await layout(view, flatten(view.render().props.style).height ?? 500);
      }
      assert.equal(flatten(view.render().props.style).height, 500, 'keyboard space is reserved while typing');
      await emit('keyboardDidHide', 800 - systemInsets, 0);
      view.props = propsFor(false);
      const closed = flatten(view.render().props.style);
      assert.equal(closed.height, undefined, `keyboard hide must release explicit height (${systemInsets}px system insets, cycle ${cycle})`);
      assert.equal(closed.flex, 1, 'root fills the available screen after keyboard dismissal');
      await layout(view, 800);
    }
    view.componentWillUnmount();
    assert.equal(listeners.size, 0);
  }
  platform.OS = 'ios';
  assert.equal(propsFor(true).behavior, 'padding');
  platform.OS = 'web';
  assert.equal(propsFor(true).enabled, false);
  console.log('PASS: native Android keyboard open/hide/reopen restores full layout at 0/24/48px system insets; iOS padding and web viewport behavior preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; });
