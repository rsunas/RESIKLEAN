const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
function mount(file, params = {}) {
  const state = [], refs = [], dependencies = [], effects = [], requests = [], routes = [];
  let index = 0, refIndex = 0, effectIndex = 0;
  const router = { push: value => routes.push(value), replace: value => routes.push(value), setParams: value => Object.assign(params, value) };
  const hooks = {
    useState: initial => { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }]; },
    useRef: initial => { const slot = refIndex++; return refs[slot] ||= { current: initial }; },
    useEffect: (fn, deps) => { const slot = effectIndex++; if (!dependencies[slot] || deps.some((value, i) => value !== dependencies[slot][i])) effects.push(fn); dependencies[slot] = deps; },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(__dirname + '/../app/' + file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require','exports',code)(name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'expo-router') return { useRouter: () => router, useLocalSearchParams: () => params };
    if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'android' }, Text: 'Text', View: 'View', StatusBar: 'StatusBar', StyleSheet: { create: v => v } };
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name.endsWith('/keyboard-viewport')) return { KeyboardScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView' };
    if (name.endsWith('/auth-ui')) return { AuthField: 'AuthField', AuthFooterLink: 'AuthFooterLink', AuthHeader: 'AuthHeader', authStyles: {} };
    if (name.endsWith('/app-motion')) return { MotionPressable: 'Pressable' };
    if (name.endsWith('/email-verification')) return { emailVerificationRequest: async (path, body) => { requests.push({ path, body }); return 'Request successful'; } };
    if (name.endsWith('/brand-mark')) return { BrandMark: 'BrandMark' };
    if (name.endsWith('/theme')) return { AuthColors: {} };
    if (name.endsWith('/session')) return { saveSession: async () => { throw Error('Unverified login must not save a session'); } };
    if (name.endsWith('/vector-icons')) return { Feather: 'Icon' };
    if (name === 'expo-image') return { Image: 'Image' };
    if (name === 'expo-linear-gradient') return { LinearGradient: 'Gradient' };
    if (name.includes('/assets/')) return 'asset';
    throw Error(name);
  }, exports);
  const flatten = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(flatten)] : [];
  const render = () => { index = refIndex = effectIndex = 0; const tree = exports.default(); effects.splice(0).forEach(fn => fn()); return flatten(tree); };
  return { render, requests, routes };
}
const field = (nodes, label) => nodes.find(node => node.type === 'AuthField' && node.props.label === label);
const link = (nodes, label) => nodes.find(node => node.type === 'AuthFooterLink' && node.props.label === label);
const submit = nodes => nodes.find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && node.props.disabled !== undefined);
(async () => {
  const screen = mount('verify-email.tsx', { email: ' STAFF@EXAMPLE.TEST ' });
  let nodes = screen.render();
  assert.equal(field(nodes, 'Email address').props.value, ' STAFF@EXAMPLE.TEST ');
  assert.equal(field(nodes, 'Verification code').props.keyboardType, 'number-pad');
  field(nodes, 'Verification code').props.onChangeText('012 345'); nodes = screen.render();
  assert.equal(field(nodes, 'Verification code').props.value, '012345');
  await submit(nodes).props.onPress(); nodes = screen.render();
  assert.deepEqual(screen.requests[0], { path: 'verify-email', body: { token: '012345', email: 'staff@example.test' } });
  assert.equal(field(nodes, 'Verification code'), undefined);
  assert.ok(nodes.some(node => node.type === 'AuthHeader' && node.props.title === 'Email verified'));
  link(nodes, 'Back to sign in').props.onPress(); assert.equal(screen.routes.at(-1), '/login');

  const resend = mount('verify-email.tsx', { email: 'staff@example.test' });
  nodes = resend.render(); link(nodes, 'Resend code').props.onPress(); nodes = resend.render();
  await submit(nodes).props.onPress(); nodes = resend.render();
  assert.equal(resend.requests[0].path, 'resend-verification');
  assert.ok(field(nodes, 'Verification code'), 'resend returns directly to code entry');
  field(nodes, 'Verification code').props.onChangeText('12345'); nodes = resend.render();
  await submit(nodes).props.onPress(); assert.equal(resend.requests.length, 1, 'short codes are rejected locally');

  const legacy = mount('verify-email.tsx'); nodes = legacy.render();
  field(nodes, 'Verification code').props.onChangeText('a'.repeat(64)); nodes = legacy.render();
  await submit(nodes).props.onPress(); assert.equal(legacy.requests[0].body.token, 'a'.repeat(64));

  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
  const login = mount('login.tsx'); nodes = login.render();
  field(nodes, 'Email address').props.onChangeText(' Staff+One@Example.test '); nodes = login.render();
  link(nodes, 'Verify account').props.onPress();
  assert.equal(login.routes.at(-1), '/verify-email?email=staff%2Bone%40example.test');
  for (const code of ['EMAIL_VERIFICATION_REQUIRED', undefined]) {
    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ success: false, code, error: 'Verify your email before signing in.' }) });
    await submit(nodes).props.onPress();
    assert.equal(login.routes.at(-1), '/verify-email?email=staff%2Bone%40example.test');
  }
  console.log('PASS: login verification entry and redirect; six-digit entry, resend, legacy paste, success and return to sign-in.');
})().catch(error => { console.error(error); process.exitCode = 1; });
