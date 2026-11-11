// Isolated consent UI/state tests. Never invokes native permissions or route tracking.
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
const raw = fs.readFileSync(path.join(__dirname, '../src/components/route-monitoring-consent-modal.tsx'), 'utf8');
const source = ts.createSourceFile('consent.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
let styleExpression;
for (const statement of source.statements) {
  if (ts.isFunctionDeclaration(statement)) functions.set(statement.name.text, statement.getText(source).replace(/^export /, ''));
  if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (declaration.name.getText(source) === 'styles') styleExpression = declaration.initializer.getText(source);
}
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn result;`)(...Object.values(context));
}
// A hook-slot harness runs the actual consent hook with effect cleanup and rerenders.
function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const context = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, value => { slots[index].value = value; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    },
  };
  const hook = evaluate(functions.get('useRouteMonitoringConsent'), context);
  return {
    render(key = 'driver:route:true') { cursor = 0; effects = []; const value = hook(key); effects.forEach(effect => effect()); return value; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function elements(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) { node.forEach(child => elements(child, found)); return found; }
  found.push(node); elements(node.props?.children, found); return found;
}
async function main() {
  const harness = hookHarness();
  let hook = harness.render();
  const declined = hook.requestConsent();
  assert.equal(hook.requestConsent(), declined, 'Duplicate requests share one dialog');
  hook = harness.render(); assert.equal(hook.visible, true);
  hook.respond(false); assert.equal(await declined, false);
  assert.equal(harness.render().visible, false);
  const accepted = hook.requestConsent(); hook.respond(true); hook.respond(false);
  assert.equal(await accepted, true, 'Double taps cannot resolve twice');
  const stale = hook.requestConsent(); harness.render('driver:different-route:true');
  assert.equal(await stale, false); assert.equal(harness.render('driver:different-route:true').visible, false);
  const unmounted = hook.requestConsent(); harness.unmount();
  assert.equal(await unmounted, false); assert.equal(await hook.requestConsent(), false);

  const styles = evaluate(styleExpression, { StyleSheet: RN.StyleSheet });
  assert.equal(styles.card.borderRadius, 24);
  assert.ok(styles.enableButton.minHeight >= 44 && styles.cancelButton.minHeight >= 44);
  const names = new Map(Object.entries(styles).map(([name, value]) => [value, name]));
  const fixtures = [];
  for (const width of [320, 360]) for (const scale of [1, 2]) {
    const View = ({ style, ...props }) => React.createElement(RN.View, { ...props, style, dataSet: { qa: names.get(style) || '' } });
    const Text = ({ style, ...props }) => React.createElement(RN.Text, { ...props, style: [style, { fontSize: (style?.fontSize || 14) * 1.1 * scale }] });
    const Icon = ({ size }) => React.createElement(View, { style: { width: size, height: size, flexShrink: 0 } });
    const Modal = ({ children }) => React.createElement(View, { style: { height: 640 } }, children);
    const component = evaluate(functions.get('RouteMonitoringConsentModal'), { React, Modal, SafeAreaView: View, ScrollView: RN.ScrollView, View, Pressable: RN.Pressable, Text, Feather: Icon, styles });
    const actions = [];
    const tree = component({ visible: true, onCancel: () => actions.push('cancel'), onEnable: () => actions.push('enable') });
    tree.props.onRequestClose();
    elements(tree).find(item => item.props?.testID === 'route-monitoring-consent-cancel').props.onPress();
    elements(tree).find(item => item.props?.testID === 'route-monitoring-consent-enable').props.onPress();
    assert.deepEqual(actions, ['cancel', 'cancel', 'enable']);
    const html = renderToStaticMarkup(tree);
    for (const disclosure of ['minimized or offline', 'confirmed entry', 'notification stays on', 'Stop anytime', 'Allow all the time']) assert.ok(html.includes(disclosure));
    fixtures.push(`<section data-scale="${scale}" style="width:${width}px">${html}</section>`);
  }
  console.log('PASS: accept/decline, one pending prompt, duplicate taps, changed assignment, unmount cleanup, Back dismissal and permission disclosures.');
  if (process.argv.includes('--logic-only')) return;
  function browserCheck() {
    const failures = [];
    for (const section of document.querySelectorAll('section')) {
      const bounds = section.getBoundingClientRect();
      for (const item of section.querySelectorAll('[data-qa]')) {
        if (!item.dataset.qa) continue;
        const rect = item.getBoundingClientRect();
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || item.scrollWidth > item.clientWidth + 1) failures.push(`${section.dataset.scale}: ${item.dataset.qa} overflow`);
      }
      const cancel = section.querySelector('[data-testid="route-monitoring-consent-cancel"]');
      const enable = section.querySelector('[data-testid="route-monitoring-consent-enable"]');
      if (cancel.getBoundingClientRect().height < 44 || enable.getBoundingClientRect().height < 44) failures.push('Small touch target');
      enable.scrollIntoView();
      const rect = enable.getBoundingClientRect();
      const frame = section.getBoundingClientRect();
      if (rect.bottom > frame.bottom + 1 || rect.top < frame.top - 1) failures.push('Enable button is not scroll-reachable');
    }
    document.getElementById('result').textContent = JSON.stringify({ fixtures: 4, failures });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-route-consent-'));
  const target = path.join(dir, 'fixtures.html');
  fs.writeFileSync(target, `<!doctype html><html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}body{margin:0}section{margin-bottom:24px}</style></head><body>${fixtures.join('')}<pre id="result"></pre><script>(${browserCheck.toString()})()</script></body></html>`);
  console.log(`Fixtures: ${target}`);
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const output = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(dir, 'edge')}`, '--dump-dom', pathToFileURL(target).href], { timeout: 60000, maxBuffer: 5 * 1024 * 1024, windowsHide: true }).toString();
  const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
  assert.ok(result, 'Browser result missing');
  const parsed = JSON.parse(result.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  console.log(JSON.stringify(parsed)); assert.deepEqual(parsed.failures, []);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
