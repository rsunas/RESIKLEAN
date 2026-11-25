// Exercise the actual style hooks and screenshot foreground/surface pairs.
// React Native Web is a rendering proxy; this does not replace an Android device check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const RN = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.join(__dirname, '..');
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', js)(name => name in dependencies ? dependencies[name] : require(name), exports);
  return exports;
}
const palette = load('src/constants/mobile-palette.ts');
const { darkPalette, darkCategoryColors } = palette;
const guide = load('src/constants/segregation-guide.ts');
let theme = 'light';
const preferences = { useAppTheme: () => theme, useAppLanguage: () => 'en' };
const hooks = load('src/hooks/use-themed-styles.ts', { react: React, 'react-native': RN, '@/hooks/app-preferences': preferences });
function renderHook(run) {
  let result;
  function Probe() { result = run(); return null; }
  renderToStaticMarkup(React.createElement(Probe));
  return result;
}
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), `${js}; return result;`)(...Object.values(context));
}
function styleSheet(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), 99, true, 4);
  const declarations = new Map();
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) if (declaration.initializer) declarations.set(declaration.name.getText(source), declaration.initializer.getText(source));
  }
  const context = { StyleSheet: RN.StyleSheet, darkPalette, UI: guide.GUIDE_UI, C: { field: '#F1F5F3', ink: '#121A16', muted: '#5A6761', primary: '#0A7F4F', error: '#B3261E' }, GAP: 8, ROW_HEIGHT: 84 };
  const light = evaluate(declarations.get('styles') || declarations.get('ss') || declarations.get('s'), context);
  const dark = evaluate(declarations.get('darkStyles'), context);
  const snapshot = JSON.stringify(light);
  theme = 'light';
  assert.equal(renderHook(() => hooks.useThemedStyles(light, dark)), light, `${file}: light styles retain identity`);
  theme = 'dark';
  const result = renderHook(() => hooks.useThemedStyles(light, dark));
  assert.equal(JSON.stringify(light), snapshot, `${file}: switching must not mutate light styles`);
  assert.equal(renderHook(() => hooks.useThemedStyles(light, dark, true)), light, 'Auth controls retain light styling');
  for (const [name, style] of Object.entries(light)) for (const [property, value] of Object.entries(style)) {
    if (!/color/i.test(property)) assert.deepEqual(result[name][property], value, `${file}:${name}.${property}: preserve layout and touch targets`);
  }
  return result;
}
function luminance(hex) {
  if (hex === 'white') hex = '#ffffff';
  const [r, g, b] = hex.slice(1).match(/../g).map(value => {
    const c = parseInt(value, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
let checks = 0;
function contrast(text, surface, label) {
  assert.ok(text && surface, `${label}: missing color`);
  const [a, b] = [luminance(text), luminance(surface)].sort((x, y) => y - x);
  const ratio = (a + 0.05) / (b + 0.05);
  assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 (${text} on ${surface})`);
  checks++;
}
const cases = {
  'src/components/searchable-select.tsx': [['input', 'field'], ['input', 'focus'], ['optionText', 'panel'], ['optionText', 'selected'], ['description', 'selected'], ['empty', 'panel']],
  'src/components/app-select.tsx': [['filterText', 'filterTrigger'], ['optionLabel', 'modalCard'], ['selectedOptionLabel', 'selectedOption']],
  'src/components/resident-settings-modal.tsx': [['headerTitle', 'header'], ['settingText', 'card'], ['settingSubtext', 'card'], ['hotlineNumber', 'card'], ['callBadgeText', 'callBadge'], ['pillTextActive', 'pillIndicator'], ['pillText', 'pillRow'], ['cpTitle', 'cpSheet'], ['cpInput', 'cpInputRow'], ['dangerTitle', 'dangerCard']],
  'src/components/route-monitoring-consent-modal.tsx': [['title', 'card'], ['message', 'card'], ['detailText', 'details'], ['cancelText', 'cancelButton'], ['enableText', 'enableButton']],
  'src/components/phone-notification-controls.tsx': [['title', 'card'], ['body', 'card'], ['buttonText', 'card']],
  'src/components/staff-controls.tsx': [['historySearchInput', 'historySearch'], ['sheetTitle', 'sheet'], ['filterChipText', 'filterChip']],
  'app/resident.tsx': [['newComplaintTitle', 'newComplaintHeader'], ['newComplaintSubtitle', 'newComplaintHeader'], ['newComplaintInput', 'newComplaintInput']],
  'app/collector.tsx': [['syncBottomText', 'profileSyncCard'], ['syncCount', 'profileSyncCard'], ['offlineMapTitle', 'offlineMapCard'], ['offlineMapCaption', 'offlineMapCard'], ['offlineMapButtonText', 'offlineMapButton']],
  'app/staff.tsx': [['emptyHistoryTitle', 'emptyHistoryCard'], ['emptyHistoryText', 'emptyHistoryCard']],
};
for (const [file, pairs] of Object.entries(cases)) {
  const styles = styleSheet(file);
  for (const [foreground, background] of pairs) contrast(styles[foreground]?.color, styles[background]?.backgroundColor, `${file}: ${foreground}/${background}`);
}
for (const colors of Object.values(darkCategoryColors)) {
  contrast(colors.text, darkPalette.background, 'Upcoming schedule category');
  contrast(colors.text, colors.tint, 'Today schedule category');
  contrast(darkPalette.muted, colors.tint, 'Schedule time');
}
contrast(darkPalette.accent, darkPalette.tint, 'Selected navigation icon');
const AppText = load('src/components/app-text.tsx', {
  'react-native': RN, '@/hooks/app-preferences': preferences, '@/constants/mobile-palette': palette,
  '@/lib/i18n': { translate: value => value },
}).AppText;
theme = 'dark';
const explicit = RN.StyleSheet.flatten(AppText({ style: { color: '#086B42' }, children: 'Light artwork label' }).props.style);
assert.equal(explicit.color, '#086B42', 'Text must never silently recolor explicit artwork/brand foregrounds');
const defaults = RN.StyleSheet.flatten(AppText({ children: 'Default label' }).props.style);
assert.equal(defaults.color, darkPalette.text);
theme = 'light';
assert.equal(renderHook(() => hooks.useThemeColor())('#121A16', darkPalette.text), '#121A16');
theme = 'dark';
assert.equal(renderHook(() => hooks.useThemeColor())('#121A16', darkPalette.text), darkPalette.text);
assert.equal(renderHook(() => hooks.useThemeColor(true))('#121A16', darkPalette.text), '#121A16');
console.log(`PASS ${checks} screenshot color pairs meet 4.5:1; light/dark switching, explicit text colors, auth controls and layout preservation.`);

if (process.argv.includes('--preview')) {
  const View = RN.View;
  const Modal = ({ visible, children }) => visible ? React.createElement(View, null, children) : null;
  const Tabs = ({ children }) => React.createElement(View, null, children);
  Tabs.List = View; Tabs.Indicator = View; Tabs.Trigger = RN.Pressable; Tabs.Label = RN.Text;
  const Icon = ({ color, size }) => React.createElement(RN.Text, { style: { color, fontSize: size, width: size, flexShrink: 0 } }, '◇');
  preferences.useAppPreferences = () => ({ preferences: { theme, language: 'en' }, updatePreferences() {} });
  const dependencies = {
    react: { ...React, useState: initial => React.useState(initial?.theme ? { ...initial, theme } : initial) },
    'react-native': RN,
    '@/constants/mobile-palette': palette, '@/hooks/use-themed-styles': hooks,
    '@/hooks/app-preferences': preferences, '@/components/app-text': { AppText },
    'expo/node_modules/@expo/vector-icons': { Feather: Icon, MaterialCommunityIcons: Icon },
    'react-native-safe-area-context': { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/app-motion': { MotionModal: Modal, MotionPressable: RN.Pressable, MotionChevron: View, AccordionBody: ({ expanded, children }) => expanded ? children : null },
    './resident-avatar': { ResidentAvatar: () => React.createElement(View, { style: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0A7F4F' } }) },
    '@/lib/notifications': { setCollectionReminderPreference() {} },
    'heroui-native': { Tabs },
  };
  const Settings = load('src/components/resident-settings-modal.tsx', dependencies).ResidentSettingsModal;
  const Consent = load('src/components/route-monitoring-consent-modal.tsx', dependencies).RouteMonitoringConsentModal;
  const sections = [];
  for (const scheme of ['light', 'dark']) {
    theme = scheme;
    for (const role of ['resident', 'staff', 'collector']) {
      const html = renderToStaticMarkup(React.createElement(Settings, { visible: true, session: { token: 'fixture', user: { name: 'Preview User', email: 'preview@example.test', role } }, apiUrl: '', onClose() {}, onSignOut() {}, onSessionUpdate() {} }));
      assert.ok(html.includes('Change Password') && html.includes('CONTACT SWMO'), `${scheme}/${role}: actual settings sections render`);
      sections.push(`<section><h2>${scheme} · ${role}</h2>${html}</section>`);
    }
    sections.push(`<section><h2>${scheme} · start trip</h2>${renderToStaticMarkup(React.createElement(Consent, { visible: true, onCancel() {}, onEnable() {} }))}</section>`);
  }
  RN.AppRegistry.registerComponent('ThemePreview', () => () => null);
  const css = renderToStaticMarkup(RN.AppRegistry.getApplication('ThemePreview').getStyleElement());
  const target = path.join(root, '.theme-check', 'preview.html');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `<!doctype html><html><head><meta charset="utf-8">${css}<style>body{margin:0;background:#d9e0db;font-family:Arial;display:flex;align-items:flex-start;gap:20px;padding:20px}section{width:390px;flex:none;border:1px solid #87958e}h2{font-size:18px;padding:12px;margin:0;background:white}section>div{min-height:700px}</style></head><body>${sections.join('')}</body></html>`);
  console.log(`PASS settings rendered for all three roles in both themes. Preview: ${target}`);
}
