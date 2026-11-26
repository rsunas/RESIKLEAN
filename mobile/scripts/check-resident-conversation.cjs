// Native contracts plus a mounted React Native Web browser regression below.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { themeDependencies } = require('./mobile-theme-fixture.cjs');
const load = (file, mocks) => {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)(name => mocks[name] || require(name), exports);
  return exports;
};

for (const platform of ['android', 'ios']) {
  let state = [], cursor = 0, effects = [], removed = 0;
  const events = {};
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useEffect: effect => effects.push(effect),
  };
  const keyboard = { isVisible: () => false, addListener: (event, callback) => { events[event] = callback; return { remove() { removed++; } }; } };
  const { useKeyboardViewport } = load('src/hooks/use-keyboard-viewport.ts', {
    react, 'react-native': { Platform: { OS: platform }, Keyboard: keyboard, useWindowDimensions: () => ({ height: 800, fontScale: 1 }) },
  });
  const renderHook = active => { cursor = 0; effects = []; return useKeyboardViewport(active); };
  assert.equal(renderHook(true).keyboardOpen, false);
  const cleanup = effects[0]();
  events[platform === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow']();
  assert.equal(renderHook(true).keyboardOpen, true);
  events[platform === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide']();
  assert.equal(renderHook(true).keyboardOpen, false);
  cleanup(); assert.equal(removed, 2, 'Native listeners must be removed on close');
  renderHook(false); effects[0](); assert.equal(Object.keys(events).length, 2);

  let managed = false;
  const wrappers = load('src/components/keyboard-viewport.tsx', {
    react: { ...React, useRef: value => ({ current: value }), useEffect: () => {}, useContext: () => ({ managed, keyboardOpen: true }) },
    'react-native': { ...RN, Platform: { OS: platform } },
    '@/hooks/use-keyboard-viewport': { useKeyboardViewport: () => ({ keyboardOpen: true }) },
  });
  const owner = wrappers.KeyboardViewport({ children: null }).props.children;
  assert.equal(owner.props.behavior, platform === 'ios' ? 'padding' : 'height');
  assert.equal(owner.props.enabled, true);
  assert.equal(wrappers.KeyboardAvoidingView({}).props.enabled, true);
  managed = true;
  assert.equal(wrappers.KeyboardAvoidingView({}).props.enabled, false, 'Nested avoidance must not add a second keyboard gap');

  let viewport = { keyboardOpen: false, visibleHeight: 800, fontScale: 1 };
  const { ResidentComplaintConversation, reportStep } = load('src/components/resident-complaint-conversation.tsx', {
    ...themeDependencies(),
    react: { ...React, useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {} },
    'react-native': { ...RN, Platform: { OS: platform } },
    '@/components/keyboard-viewport': { useKeyboardViewportState: () => viewport },
    '@/lib/waste-categories': load('src/lib/waste-categories.ts', {}),
    './resident-avatar': { ResidentAvatar: () => null },
    'expo/node_modules/@expo/vector-icons': { Feather: () => null, MaterialCommunityIcons: () => null },
    'expo-image': { Image: RN.View },
    '@/components/app-motion': { MotionPressable: RN.Pressable, MotionModal: RN.Modal, MotionChevron: RN.View, AccordionBody: RN.View },
    '@/components/loading-skeleton': { SkeletonBlock: RN.View, SkeletonRows: RN.View },
  });
  const props = { topInset: 24, bottomInset: 20, report: { _id: 'r', status: 'resolved', createdAt: '2026-11-23', barangay: 'Bagumbayan Sur' }, subject: 'Missed collection', body: 'Please collect it.', bags: '1 bag', metadata: '', messages: [], loading: false, sending: false, error: '', draft: '', setDraft() {}, send: async () => {}, onClose() {} };
  const elements = node => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];
  const tree = ResidentComplaintConversation(props);
  const style = RN.StyleSheet.flatten(tree.props.style);
  assert.equal(style.borderTopLeftRadius, 24); assert.equal(style.maxHeight, '90%');
  assert.deepEqual(tree.props.children.filter(Boolean).slice(0, 4).map(node => node.props.testID), ['complaint-header', 'complaint-tracker', 'complaint-thread', 'complaint-composer']);
  assert.equal(elements(tree).find(node => node.props.testID === 'complaint-thread').props.automaticallyAdjustContentInsets, false);
  for (const [status, step] of [['pending', 0], ['verified', 1], ['scheduled', 1], ['resolved', 2], ['rejected', 0]]) assert.equal(reportStep(status), step);
  viewport = { ...viewport, keyboardOpen: true };
  assert.ok(!elements(ResidentComplaintConversation(props)).some(node => node.props.children === 'STATUS TRACKER'));
}
console.log('PASS: Android/iOS keyboard listeners, cleanup, safe area, explicit avoidance, bounded thread, and compact tracker.');
import('./check-resident-conversation-browser.mjs').catch(error => { console.error(error); process.exitCode = 1; });
