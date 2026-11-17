// Read-only auth regression checks. APIs/Google/session writes are mocked.
// Browser geometry is a proxy, not a claim of native keyboard/animation QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..');
let scale = 1;
let owner;
let keyboardVisible = false;
const keyboardListeners = new Map();
const calls = [];
const C = { primary: '#0A7F4F', tint: '#E3F4EB', darkGreen: '#086B42', ink: '#121A16', muted: '#5A6761', label: '#35463F', field: '#F1F5F3', locked: '#E8EDEA', track: '#DCE4DF', border: '#D5DDD9', error: '#B3261E' };
const hooks = {
  useState(initial) {
    const instance = owner; const i = instance.cursor++;
    if (!(i in instance.state)) instance.state[i] = typeof initial === 'function' ? initial() : initial;
    return [instance.state[i], value => { instance.state[i] = typeof value === 'function' ? value(instance.state[i]) : value; }];
  },
  useEffect(run) { owner.effects?.push(run); },
  useRef(initial) { return hooks.useState({ current: initial })[0]; },
};
const text = ({ style, ...props }) => {
  const flat = RN.StyleSheet.flatten(style) || {};
  return React.createElement(RN.Text, { ...props, style: [style, { fontSize: (flat.fontSize || 14) * scale, ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }] });
};
const input = ({ style, ...props }) => React.createElement(RN.TextInput, { ...props, style: [style, { fontSize: 16 * scale }] });
const Icon = ({ size = 20 }) => React.createElement(RN.View, { style: { width: size, height: size, flexShrink: 0 } });
const Gradient = ({ children, style, colors, locations }) => React.createElement(RN.View, { style: [style, { backgroundImage: `linear-gradient(to bottom, ${(colors || ['#E3F4EB', 'white']).map((color, i) => `${color}${locations ? ` ${locations[i] * 100}%` : ''}`).join(',')})` }] }, children);
const nav = { push: value => calls.push(['push', value]), replace: value => calls.push(['replace', value]) };
const native = { ...RN, Text: text, TextInput: input, StatusBar: () => null, KeyboardAvoidingView: RN.View,
  Keyboard: { isVisible: () => keyboardVisible, addListener(name, callback) { keyboardListeners.set(name, callback); return { remove: () => keyboardListeners.delete(name) }; } },
  useWindowDimensions: () => ({ width: 360, height: 640, fontScale: scale }) };
const artwork = `data:image/webp;base64,${fs.readFileSync(path.join(root, 'assets/images/swmo-login-800.webp')).toString('base64')}`;
const logo = `data:image/png;base64,${fs.readFileSync(path.join(root, 'assets/images/swmo-resiklean-logo-mobile.png')).toString('base64')}`;
const safe = { SafeAreaView: ({ edges, style, ...props }) => React.createElement(RN.View, { ...props, style: [style, edges?.includes('top') && { paddingTop: 24 }] }), useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) };
const baseMocks = {
  '@/components/app-motion': { MotionPressable: RN.Pressable, SignupStepTransition: ({ children }) => children },
  '@/hooks/use-app-reduced-motion': { useAppReducedMotion: () => false },
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
  'expo/node_modules/@expo/vector-icons': { Feather: Icon }, 'expo-linear-gradient': { LinearGradient: Gradient },
  'expo-image': { Image: ({ style }) => React.createElement(RN.View, { style: [style, { backgroundImage: `url(${artwork})`, backgroundSize: 'cover', backgroundPosition: '14% center' }] }) },
  '@/assets/images/swmo-login-800.webp': 1,
  'react-native-safe-area-context': safe, '@/constants/theme': { AuthColors: C },
  '@/components/brand-mark': { BrandMark: ({ width, height }) => React.createElement(RN.View, { accessibilityLabel: 'ResiKlean logo', style: { width, height, backgroundImage: `url(${logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' } }) },
};
function load(relative, overrides = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mocks = { ...baseMocks, ...overrides };
  new Function('require', 'exports', 'process', js)(name => { assert.ok(mocks[name], `Unmocked ${name}`); return mocks[name]; }, exports, { env: { EXPO_PUBLIC_API_URL: 'https://mock.invalid', EXPO_PUBLIC_GOOGLE_CLIENT_ID: 'test-only' } });
  return exports;
}
const ui = load('src/components/auth-ui.tsx');
const picker = ({ value, invalid }) => React.createElement(RN.View, { style: { minHeight: 56, borderWidth: 2, borderColor: invalid ? C.error : 'transparent', backgroundColor: C.field, borderRadius: 16, justifyContent: 'center', paddingHorizontal: 16 } }, React.createElement(text, { numberOfLines: 1 }, value || 'Select your collection location'));
const progress = load('src/components/signup-progress.tsx', {
  'react-native-reanimated': {
    __esModule: true, default: { View: RN.View, Text: text },
    useSharedValue: value => React.useRef({ value }).current,
    useReducedMotion: () => false, useAnimatedStyle: compute => compute(),
    cancelAnimation() {}, Easing: { cubic: 'cubic', out: value => value, in: value => value }, ReduceMotion: { System: 'system' },
    withTiming: value => value, withDelay: (delay, value) => value,
    interpolateColor: (value, range, colors) => colors[value === 1 ? 1 : 0],
  },
}).SignupProgress;
const privacy = load('src/components/signup-privacy.tsx', { '@/components/app-motion': { MotionPressable: RN.Pressable, MotionModal: () => null } });
const common = {
  '@/components/signup-privacy': privacy,
  '@/lib/network-request': { requestJson: async (...args) => { const response = await global.fetch(...args); return { response, payload: await response.json() }; } },
  react: hooks, 'expo-router': { useRouter: () => nav }, '@/components/auth-ui': ui,
  '@/lib/session': { saveSession: async session => calls.push(['saveSession', session]) },
  '@/components/barangay-picker': { BarangayPicker: picker }, '@/components/signup-progress': { SignupProgress: progress },
  'react-native-svg': { __esModule: true, default: Icon, Path: () => null },
  '@react-native-google-signin/google-signin': { GoogleSignin: {
    configure() {}, hasPlayServices: async () => {}, signOut: async () => {},
    signIn: async () => ({ type: 'success', data: { idToken: 'google-id', user: { email: 'verified@example.com', name: 'Verified Person' } } }),
  }, isSuccessResponse: result => result.type === 'success' },
};
const Login = load('app/login.tsx', common).default;
const Signup = load('app/signup.tsx', common).default;
function harness(Screen) {
  const instance = { state: [], cursor: 0, effects: [] };
  return { render() { owner = instance; instance.cursor = 0; instance.effects = []; return Screen(); }, flushEffects() { return instance.effects.map(run => run()); } };
}
function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...findAll(node.props.children, predicate)];
}
function words(node) { return Array.isArray(node) ? node.map(words).join('') : React.isValidElement(node) ? words(node.props.children) : typeof node === 'string' ? node : ''; }
const field = (tree, name) => findAll(tree, node => node.type === ui.AuthField && node.props.accessibilityLabel === name)[0];
const button = (tree, name) => findAll(tree, node => node.type === RN.Pressable && (words(node).includes(name) || node.props.accessibilityLabel === name))[0];
function response(data, success = true, error) { return { ok: success, json: async () => ({ success, data, error }) }; }
function initializer(source, name) {
  const file = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let value;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) value = node.initializer.getText(file); ts.forEachChild(node, visit); }
  visit(file); return value;
}
// Login remains unchanged; signup is exercised below with the new privacy requirement.
for (const [file, names] of [['login', ['handleLogin']]]) {
  const before = execFileSync('git', ['show', `HEAD:mobile/app/${file}.tsx`], { encoding: 'utf8', cwd: root }).replace(/\r\n/g, '\n');
  const after = fs.readFileSync(path.join(root, `app/${file}.tsx`), 'utf8').replace(/\r\n/g, '\n');
  for (const name of names) assert.equal(initializer(after, name), initializer(before, name), `${name} changed`);
}
async function main() {
  checkProgress();
  const ModalStub = () => null;
  const privacyUI = load('src/components/signup-privacy.tsx', { react: hooks, '@/components/app-motion': { MotionPressable: RN.Pressable, MotionModal: ModalStub } });
  let acknowledged = false;
  const notice = harness(() => privacyUI.SignupPrivacy({ accepted: acknowledged, onChange: value => { acknowledged = value; } }));
  let noticeTree = notice.render();
  findAll(noticeTree, node => node.props.accessibilityRole === 'link')[0].props.onPress();
  assert.equal(findAll(notice.render(), node => node.type === ModalStub)[0].props.visible, true);
  button(notice.render(), 'Close Data Privacy Notice').props.onPress();
  assert.equal(findAll(notice.render(), node => node.type === ModalStub)[0].props.visible, false);
  assert.equal(acknowledged, false, 'Reading/closing does not accept on the user behalf');
  findAll(notice.render(), node => node.props.accessibilityRole === 'checkbox')[0].props.onPress();
  assert.equal(acknowledged, true);
  assert.equal(findAll(notice.render(), node => node.props.accessibilityRole === 'checkbox')[0].props.accessibilityState.checked, true);
  console.log('PASS: privacy hyperlink opens/closes the notice; checkbox acceptance is explicit and accessible.');
  const realFetch = global.fetch;
  try {
    const login = harness(Login);
    let tree = login.render();
    assert.ok(findAll(tree, node => node.props.testID === 'login-scroll').length, 'Sign In form has a scroll container for the keyboard');
    assert.ok(findAll(tree, node => node.props.testID === 'login-footer').length, 'Sign In has a footer in the form');
    field(tree, 'Email Address').props.onChangeText('resident@example.com');
    field(tree, 'Password').props.onChangeText('test-password');
    global.fetch = async (url, options) => { assert.deepEqual(JSON.parse(options.body), { email: 'resident@example.com', password: 'test-password' }); return response({ token: 'test-token', user: { role: 'resident' } }); };
    await button(login.render(), 'Sign In').props.onPress();
    assert.ok(calls.some(call => call[0] === 'replace' && call[1] === '/resident'));
    global.fetch = async () => response(null, false, 'Invalid credentials');
    const submitting = button(login.render(), 'Sign In').props.onPress();
    assert.ok(findAll(login.render(), node => node.type === RN.Pressable && node.props.disabled).length);
    await submitting;
    assert.ok(words(login.render()).includes('Invalid credentials'));
    tree = login.render();
    field(tree, 'Password').props.trailing.props.onPress();
    assert.equal(field(login.render(), 'Password').props.secureTextEntry, false);
    findAll(login.render(), node => node.type === ui.AuthFooterLink)[0].props.onPress();
    assert.ok(calls.some(call => call[0] === 'push' && call[1] === '/signup'));

    const signup = harness(Signup);
    const privacyControl = () => findAll(signup.render(), node => node.type === privacy.SignupPrivacy)[0];
    let blockedRequests = 0;
    global.fetch = async () => { blockedRequests++; throw Error('Must not register without acceptance'); };
    assert.equal(button(signup.render(), 'Continue with Google').props.disabled, true);
    await button(signup.render(), 'Continue with Google').props.onPress();
    assert.equal(blockedRequests, 0);
    assert.ok(words(signup.render()).includes(privacy.PRIVACY_REQUIRED_MESSAGE));
    privacyControl().props.onChange(true);
    global.fetch = async () => response(null, false, 'Google unavailable');
    await button(signup.render(), 'Continue with Google').props.onPress();
    assert.ok(words(signup.render()).includes('Google unavailable'));
    global.fetch = async () => response({ token: 'verified-token', user: { email: 'verified@example.com', name: 'Verified Person' } });
    await button(signup.render(), 'Continue with Google').props.onPress();
    tree = signup.render();
    assert.equal(field(tree, 'Email Address').props.value, 'verified@example.com');
    assert.equal(field(tree, 'Email Address').props.locked, true);
    field(tree, 'Full Name').props.onChangeText('');
    await button(signup.render(), 'Finish sign up').props.onPress();
    assert.equal(field(signup.render(), 'Full Name').props.error, 'Please enter your full name.');
    field(signup.render(), 'Full Name').props.onChangeText('Verified Person');
    await button(signup.render(), 'Finish sign up').props.onPress();
    assert.ok(field(signup.render(), 'Password').props.error);
    field(signup.render(), 'Password').props.onChangeText('secret123');
    await button(signup.render(), 'Finish sign up').props.onPress();
    assert.ok(words(signup.render()).includes('Please select your collection location.'));
    findAll(signup.render(), node => node.type === picker)[0].props.onChange('Area 1');
    global.fetch = async (url, options) => {
      assert.equal(options.method, 'PATCH'); assert.equal(options.headers.Authorization, 'Bearer verified-token');
      assert.equal(JSON.parse(options.body).location, 'Area 1');
      return response({ user: { role: 'resident', email: 'verified@example.com' } });
    };
    privacyControl().props.onChange(false);
    assert.equal(button(signup.render(), 'Finish sign up').props.disabled, true);
    const beforeFinish = calls.filter(call => call[0] === 'saveSession').length;
    await button(signup.render(), 'Finish sign up').props.onPress();
    assert.equal(calls.filter(call => call[0] === 'saveSession').length, beforeFinish);
    assert.ok(words(signup.render()).includes(privacy.PRIVACY_REQUIRED_MESSAGE));
    privacyControl().props.onChange(true);
    await button(signup.render(), 'Finish sign up').props.onPress();
    assert.ok(calls.some(call => call[0] === 'saveSession' && call[1].token === 'verified-token'));
    for (let i = 0; i < 4; i++) {
      button(signup.render(), 'Back').props.onPress();
      assert.equal(findAll(signup.render(), node => node.type === progress)[0].props.step, 1);
      global.fetch = async () => response({ token: 'verified-token', user: { email: 'verified@example.com', name: 'Verified Person' } });
      await button(signup.render(), 'Continue with Google').props.onPress();
      assert.equal(findAll(signup.render(), node => node.type === progress)[0].props.step, 2);
    }
    console.log('PASS: privacy blocks both registration steps until accepted; mocked sign-in success/failure/loading, password toggle, Google success/failure, verification, validation, account completion, Back/forward and links');
    if (process.argv.includes('--logic-only')) return;

    const loading = harness(Login);
    let finishLoading;
    global.fetch = () => new Promise(resolve => { finishLoading = () => resolve(response(null, false, 'Invalid credentials')); });
    const pendingLogin = button(loading.render(), 'Sign In').props.onPress();
    const fixtures = [];
    for (const fontScale of [1, 2]) for (const height of [640, 340]) {
      scale = fontScale;
      for (const [name, screen] of [['login-ready', harness(Login)], ['login-loading', loading], ['login-error', login], ['signup-details', signup], ['signup-google', harness(Signup)]]) {
        fixtures.push(`<section data-case="${name}/${scale}/${height}" style="width:360px;height:${height}px;position:relative;display:flex;flex-direction:column">${renderToStaticMarkup(screen.render())}</section>`);
      }
    }
    finishLoading();
    await pendingLogin;
    const checks = function () {
      const failures = [];
      for (const section of document.querySelectorAll('section')) {
        const bounds = section.getBoundingClientRect();
        for (const el of section.querySelectorAll('input,[role="button"],[role="link"]')) {
          const r = el.getBoundingClientRect();
          if (r.left < bounds.left - 1 || r.right > bounds.right + 1) failures.push(`${section.dataset.case}: horizontal overflow`);
          if (el.matches('[role="button"],[role="link"]') && (r.height < 44 || r.width < 44)) failures.push(`${section.dataset.case}: small target`);
        }
        const link = [...section.querySelectorAll('[role="link"]')].at(-1);
        const loginScroll = section.querySelector('[data-testid="login-scroll"], [data-testid="signup-scroll"]');
        if (loginScroll) {
          const footer = section.querySelector('[data-testid="login-footer"], [data-testid="signup-footer"]');
          const password = section.querySelector('input[aria-label="Password"]');
          if (!loginScroll.contains(footer)) failures.push('Sign In footer must stay in the form flow');
          const footerTop = footer.getBoundingClientRect().top;
          loginScroll.scrollTop = loginScroll.scrollHeight;
          if (Math.abs(footer.getBoundingClientRect().top - footerTop) < 1 && loginScroll.scrollHeight > loginScroll.clientHeight) failures.push('Sign In footer did not scroll with the form');
          if (password && password.getBoundingClientRect().bottom > footer.getBoundingClientRect().top && loginScroll.scrollHeight <= loginScroll.clientHeight) failures.push('Sign In footer overlaps password');
        }
        if (!link || link.getBoundingClientRect().bottom > bounds.bottom + 1) failures.push(`${section.dataset.case}: footer not visible`);
      }
      document.querySelector('#result').textContent = JSON.stringify({ failures, cases: document.querySelectorAll('section').length });
    };
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-auth-qa-'));
    const htmlPath = path.join(folder, 'auth.html');
    fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}</style></head><body>${fixtures.join('')}<pre id="result"></pre><script>(${checks.toString()})()</script></body></html>`);
    const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const dom = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(folder, 'browser')}`, '--dump-dom', pathToFileURL(htmlPath).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const result = JSON.parse(dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1] || '{}');
    console.log(JSON.stringify({ ...result, fixture: htmlPath }, null, 2));
    assert.deepEqual(result.failures, []);
  } finally { global.fetch = realFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

function checkProgress() {
  const state = { state: [], cursor: 0, effects: [], pending: [] };
  const values = [];
  let reductionListener;
  let scheduledCount = 0;
  const fakeHooks = { ...hooks, useEffect(run, deps) {
    const i = owner.cursor++;
    const previous = state.effects[i];
    if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
      state.pending.push(() => { previous?.cleanup?.(); state.effects[i] = { deps, cleanup: run() }; });
    }
  } };
  const reanimated = {
    __esModule: true, default: { View: RN.View, Text: text },
    useReducedMotion: () => false,
    useSharedValue(initial) {
      const i = owner.cursor++;
      if (!state.state[i]) {
        const sv = { current: initial, pending: null };
        Object.defineProperty(sv, 'value', {
          get: () => sv.current,
          set(value) { if (typeof value === 'number') { sv.current = value; sv.pending = null; } else { sv.pending = value; scheduledCount++; } },
        });
        state.state[i] = sv; values.push(sv);
      }
      return state.state[i];
    },
    useAnimatedStyle: compute => compute(),
    cancelAnimation: sv => { sv.pending = null; },
    Easing: { cubic: 'cubic', out: curve => curve, in: curve => curve }, ReduceMotion: { System: 'system' },
    withTiming: (target, config) => ({ target, ...config }),
    withDelay: (delay, animation, reduceMotion) => ({ ...animation, delay, reduceMotion }),
    interpolateColor: (value, range, colors) => colors[value === 1 ? 1 : 0],
  };
  const { SignupProgress } = load('src/components/signup-progress.tsx', {
    react: fakeHooks, 'react-native-reanimated': reanimated,
    '@/hooks/use-app-reduced-motion': { useAppReducedMotion: () => { const [value, setValue] = fakeHooks.useState(false); reductionListener = setValue; return value; } },
    'react-native': { ...native, AccessibilityInfo: {
      addEventListener: (event, listener) => { reductionListener = listener; return { remove() {} }; },
      isReduceMotionEnabled: () => Promise.resolve(false),
    } },
  });
  function render(step) { owner = state; state.cursor = 0; const tree = SignupProgress({ step }); state.pending.splice(0).forEach(run => run()); return tree; }
  function settle() { for (const sv of values) if (sv.pending) { sv.current = sv.pending.target; sv.pending = null; } }
  render(1); settle(); render(2);
  assert.equal(values[0].pending.duration, 250); assert.equal(values[0].pending.delay, undefined);
  assert.equal(values[0].pending.reduceMotion, 'system');
  const before = scheduledCount; render(2); assert.equal(scheduledCount, before, 'same step must not replay');
  render(1); assert.equal(values[0].pending.duration, 250); assert.equal(values[0].pending.delay, undefined);
  render(2); render(1); settle(); assert.ok(values.every(sv => sv.current === 0));
  reductionListener(true); render(2); assert.ok(values.every(sv => sv.current === 1 && sv.pending === null));
  render(1); assert.ok(values.every(sv => sv.current === 0 && sv.pending === null));
  reductionListener(false); render(2); settle(); assert.ok(values.every(sv => sv.current === 1));
  console.log('PASS: synchronized 250ms progress, rapid reversal, stable rerenders and live reduced-motion scheduling (native animation mocked)');
}
