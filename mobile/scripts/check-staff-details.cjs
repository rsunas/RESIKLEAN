// Tests the real component with native image/modal adapters, without fetching
// photos, accessing auth, or contacting the backend. Browser layout is a proxy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');

let current;
let scale = 1;
let styles;
const includesStyle = (style, target) => style === target || (Array.isArray(style) && style.some(item => includesStyle(item, target)));
const View = (props) => {
  const qa = ['screen', 'hero', 'titleCard', 'card', 'bottomBar', 'loadRow', 'receiptRow'].find(key => includesStyle(props.style, styles[key]));
  return React.createElement(RN.View, { ...props, dataSet: qa ? { qa } : undefined });
};
const Text = ({ style, ...props }) => {
  const flat = RN.StyleSheet.flatten(style) || {};
  return React.createElement(RN.Text, { ...props, style: [style, { fontSize: (flat.fontSize || 14) * scale, ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : {}) }] });
};
const MockModal = ({ children, visible }) => visible ? React.createElement(RN.View, { style: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, children }) : null;
const MockImage = (props) => React.createElement(RN.View, { style: props.style, accessibilityLabel: props.accessibilityLabel, dataSet: { imageFit: props.contentFit, uri: props.source.uri } });
const Icon = ({ size }) => React.createElement(RN.View, { style: { width: size, height: size, flexShrink: 0 } });
// Only a structural adapter: native indicator animation/className rendering
// must be checked on-device, not inferred from this browser proxy.
const Tabs = ({ children }) => React.createElement(RN.View, null, children);
Tabs.List = ({ children, accessibilityLabel }) => React.createElement(RN.View, { accessibilityLabel, style: { flexDirection: 'row' } }, children);
Tabs.Indicator = () => null;
Tabs.Trigger = ({ children, accessibilityLabel, accessibilityState }) => React.createElement(RN.Pressable, { accessibilityLabel, accessibilityState, style: { minHeight: 44, paddingHorizontal: 18 } }, children);
Tabs.Label = Text;
const mocks = {
  '@/components/app-motion': { MotionModal: MockModal, MotionPressable: RN.Pressable },
  '@/components/loading-skeleton': { SkeletonRegion: () => null, SkeletonBlock: () => null, useSkeletonVisible: (loading, cached) => ({ pending: loading && !cached, visible: loading && !cached, timedOut: false }) },
  'heroui-native': { Tabs },
  react: { useRef: () => ({ current: null }), useEffect() {}, useState(initial) {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.state)) owner.state[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.state[index], (value) => { owner.state[index] = typeof value === 'function' ? value(owner.state[index]) : value; }];
  } },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-native': { ...RN, View, Text, Modal: MockModal, StyleSheet: { ...RN.StyleSheet, create(value) { styles = RN.StyleSheet.create(value); return styles; } } },
  'expo-image': { Image: MockImage },
  'expo/node_modules/@expo/vector-icons': { Feather: Icon },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
};

const badgeModule = {};
const badgeCode = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/upload-sync-badge.tsx'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','exports',badgeCode)(name=>name==='react-native'?RN:name==='expo/node_modules/@expo/vector-icons'?{Feather:()=>null}:require(name),badgeModule);
const {UploadSyncBadge}=badgeModule;

mocks['@/components/upload-sync-badge'] = { UploadSyncBadge };
const source = fs.readFileSync(path.join(__dirname, '../src/components/staff-submission-details.tsx'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const component = {};
new Function('require', 'exports', js)((name) => {
  assert.ok(mocks[name], `Unexpected dependency ${name}`);
  return mocks[name];
}, component);

const base = {
  id: 'test-only', truckPlate: 'SNA-1476', barangay: ['Centro', 'Triangulo', 'San Francisco'],
  driver: 'Peter Parker', submittedAt: 'Oct 8, 11:36 AM', length: 5, width: 2.36, height: 0.9,
  slope: '1.0 m³', tonnes: 3.41628, status: 'Synced', notes: 'Original audit note.',
  sidePhotoUrl: 'file:///real-submission-side.jpg', backPhotoUrl: 'file:///real-submission-back.jpg',
};
function harness(overrides = {}) {
  const owner = { state: [], cursor: 0 };
  const submission = { ...base, ...overrides };
  let closes = 0;
  return {
    submission,
    render() { current = owner; owner.cursor = 0; return component.StaffSubmissionDetails({ submission, onClose: () => { closes++; } }); },
    get closes() { return closes; },
  };
}
function findAll(tree, predicate) {
  const results = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (predicate(node)) results.push(node);
    visit(node.props.children);
  };
  visit(tree);
  return results;
}
const byLabel = (tree, label) => findAll(tree, node => node.props.accessibilityLabel === label)[0];
const images = tree => findAll(tree, node => node.type === MockImage);
let assertions = 0;
function check(name, run) { run(); assertions++; console.log(`PASS: ${name}`); }

const photoTab = (tree, label) => findAll(tree, node => node.props.accessibilityRole === 'tab' && node.props.accessibilityLabel === label)[0];
check('Native photo tabs keep rounded surfaces, selected state and 44px touch targets', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(styles.photoTabs.borderRadius, 999);
  assert.equal(styles.photoTabs.overflow, 'hidden');
  assert.equal(styles.photoTabSelected.borderRadius, 999);
  for (const trigger of findAll(tree, node => node.props.accessibilityRole === 'tab')) {
    assert.equal(trigger.props.accessibilityRole, 'tab');
    assert.equal(trigger.props.style.height, 44);
  }
  photoTab(tree, 'Back photo').props.onPress();
  tree = h.render();
  assert.equal(photoTab(tree, 'Back photo').props.accessibilityState.selected, true);
  assert.equal(photoTab(tree, 'Side photo').props.accessibilityState.selected, false);
});

check('Side/Back use the actual supplied URLs; hero cover and expanded contain', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(images(tree)[0].props.source.uri, base.sidePhotoUrl);
  assert.equal(images(tree)[0].props.contentFit, 'cover');
  photoTab(tree, 'Back photo').props.onPress();
  tree = h.render();
  assert.equal(images(tree)[0].props.source.uri, base.backPhotoUrl);
  byLabel(tree, 'View full photo').props.onPress();
  tree = h.render();
  const full = images(tree).find(node => node.props.contentFit === 'contain');
  assert.equal(full.props.source.uri, base.backPhotoUrl);
  const modals = findAll(tree, node => node.type === MockModal);
  assert.equal(modals.length, 2);
  modals[1].props.onRequestClose();
  assert.equal(findAll(h.render(), node => node.type === MockModal).length, 1);
  assert.equal(h.closes, 0);
});
check('Back, Done and Android modal back return to History', () => {
  const h = harness();
  const tree = h.render();
  byLabel(tree, 'Back to submission history').props.onPress();
  byLabel(tree, 'Done, return to submission history').props.onPress();
  tree.props.onRequestClose();
  assert.equal(h.closes, 3);
});
check('Unloaded photos show a skeleton; onLoad remembers each URI across Side/Back switches', () => {
  const h = harness();
  const loading = tree => findAll(tree, node => node.type === mocks['@/components/loading-skeleton'].SkeletonRegion).length;
  let tree = h.render();
  assert.equal(loading(tree), 1);
  images(tree)[0].props.onLoad();
  tree = h.render(); assert.equal(loading(tree), 0);
  photoTab(tree, 'Back photo').props.onPress();
  tree = h.render(); assert.equal(loading(tree), 1);
  images(tree)[0].props.onLoad();
  tree = h.render(); assert.equal(loading(tree), 0);
  photoTab(tree, 'Side photo').props.onPress();
  assert.equal(loading(h.render()), 0);
});
check('Missing and failed photos use placeholders and disable expand', () => {
  const h = harness({ backPhotoUrl: undefined });
  let tree = h.render();
  photoTab(tree, 'Back photo').props.onPress();
  tree = h.render();
  assert.equal(images(tree).length, 0);
  assert.ok(byLabel(tree, 'Back photo unavailable'));
  assert.equal(byLabel(tree, 'View full photo').props.disabled, true);
  photoTab(tree, 'Side photo').props.onPress();
  tree = h.render();
  images(tree)[0].props.onError();
  tree = h.render();
  assert.ok(byLabel(tree, 'Side photo unavailable'));
  assert.equal(images(tree).length, 0);
});
check('Legacy photo preserved and back-only entry starts with its real image', () => {
  const legacy = harness({ sidePhotoUrl: undefined, backPhotoUrl: undefined, photoUrl: 'file:///legacy.jpg' });
  assert.equal(images(legacy.render())[0].props.source.uri, 'file:///legacy.jpg');
  assert.equal(images(harness({ sidePhotoUrl: undefined }).render())[0].props.source.uri, base.backPhotoUrl);
});
check('Area formatting does not mutate source; absent area has fallback', () => {
  const area = [...base.barangay];
  assert.equal(component.formatDetailsArea(area), 'Centro, Triangulo, San Francisco');
  assert.deepEqual(area, base.barangay);
  assert.equal(component.formatDetailsArea([]), 'No area assigned');
});
check('Receipt formula, notes and statuses; no fabricated sync timeline', () => {
  const html = renderToStaticMarkup(harness().render());
  assert.ok(html.includes('10.62 m³'));
  assert.ok(html.includes('+1.0 m³'));
  assert.ok(html.includes('3.42 t'));
  assert.ok(html.includes('Original audit note.'));
  const empty = renderToStaticMarkup(harness({ notes: '' }).render());
  assert.ok(!empty.includes('>Notes<'));
  assert.ok(!html.includes('>Status<'));
  for (const status of ['Synced', 'Pending', 'Failed']) assert.ok(renderToStaticMarkup(harness({ status }).render()).includes(`>${status}<`));
});

const cases = [
  ['both-photos', {}],
  ['missing-photo', { sidePhotoUrl: undefined, backPhotoUrl: undefined }],
  ['long-area', { barangay: ['Centro', 'Triangulo', 'San Francisco', 'A very long additional barangay name'], driver: 'A very long staff name for accessibility testing' }],
  ['no-notes', { notes: '' }],
  ['pending', { status: 'Pending' }],
  ['failed', { status: 'Failed', length: 45000, width: 20000, height: 18000, tonnes: 4762800000000 }],
];
const rendered = cases.flatMap(([name, overrides]) => [1, 2].map(fontScale => {
  scale = fontScale;
  return `<section data-case="${name}" data-scale="${fontScale}" style="position:relative;width:360px;height:800px">${renderToStaticMarkup(harness(overrides).render())}</section>`;
}));
const browserChecks = function () {
  const failures = [];
  for (const section of document.querySelectorAll('section')) {
    const root = section.getBoundingClientRect();
    const footer = section.querySelector('[data-qa="bottomBar"]').getBoundingClientRect();
    if (Math.abs(footer.bottom - root.bottom) > 1) failures.push(`${section.dataset.case}: footer not fixed at bottom`);
    const hero = section.querySelector('[data-qa="hero"]').getBoundingClientRect();
    if (Math.abs(hero.height - 210) > 0.5) failures.push('Hero height changed');
    for (const card of section.querySelectorAll('[data-qa="card"], [data-qa="titleCard"], [data-qa="bottomBar"]')) {
      const rect = card.getBoundingClientRect();
      if (rect.left < root.left - 1 || rect.right > root.right + 1 || card.scrollWidth > card.clientWidth + 1) failures.push(`${section.dataset.case}/${section.dataset.scale}: horizontal overflow`);
    }
    for (const button of section.querySelectorAll('[role="button"], [role="tab"]')) {
      const rect = button.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) failures.push('Touch target smaller than 44px');
    }
  }
  document.querySelector('#result').textContent = JSON.stringify({ failures, layoutCases: document.querySelectorAll('section').length });
};
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-details-qa-'));
const htmlPath = path.join(folder, 'details.html');
fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}</style></head><body style="margin:0">${rendered.join('')}<pre id="result"></pre><script>(${browserChecks.toString()})()</script></body></html>`);
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dom = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(folder, 'browser')}`, '--dump-dom', pathToFileURL(htmlPath).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const result = JSON.parse(dom.match(/<pre id="result">([^<]+)<\/pre>/)?.[1] || '{}');
console.log(JSON.stringify({ ...result, interactionCases: assertions, fixture: htmlPath }, null, 2));
assert.deepEqual(result.failures, []);
