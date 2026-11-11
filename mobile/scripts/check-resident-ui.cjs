// Actual screen JSX in isolated fixtures. No network, camera, notifications or account mutations.
// Browser layout is a React Native Web proxy, not an Android device test.
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
function read(relative) {
  const raw = fs.readFileSync(path.join(__dirname, relative), 'utf8').replace(/\r\n/g, '\n');
  const source = ts.createSourceFile(relative, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map(), functions = new Map();
  let header;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer?.getText(source));
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(source).replace(/^export /, ''));
    if (ts.isJsxElement(node) && node.openingElement.getText(source).includes('styles.brandHeader')) header = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { raw, declarations, functions, header };
}
const resident = read('../app/resident.tsx');
const settings = read('../src/components/resident-settings-modal.tsx');
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn result;`)(...Object.values(context));
}
function elements(node, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => elements(child, result)); return result; }
  result.push(node);
  elements(node.props?.children, result);
  return result;
}
const styles = evaluate(resident.declarations.get('styles'), { StyleSheet: RN.StyleSheet });
const ss = evaluate(settings.declarations.get('ss'), { StyleSheet: RN.StyleSheet });
const named = new Map([...Object.entries(styles), ...Object.entries(ss)].map(([name, value]) => [value, name]));
assert.equal(styles.navIcon.width, 56);
assert.equal(styles.navIcon.height, 32);
assert.equal(styles.navIcon.borderRadius, 16);
assert.equal(styles.newsThumbnail.height, 180);
assert.equal(styles.photoEmptyPicker.borderStyle, 'dashed');
assert.equal(styles.newComplaintSendButton.minHeight, 56);
assert.equal(ss.pill.minHeight, 44);
assert.equal(ss.pillRow.overflow, 'hidden');
assert.equal(ss.pillIndicator.borderRadius, 12);
assert.equal(styles.profileContent.paddingTop, 56);
assert.equal(styles.profileTitle.letterSpacing, -0.6);
assert.equal(styles.profileHero.borderRadius, 24);
assert.equal(styles.avatar.width, 72);
assert.equal(styles.menuRow.minHeight, 64);
assert.equal(styles.menuRow.height, undefined, 'Menu rows must grow with large text');
assert.equal(styles.editProfileButton.minHeight, 48);
assert.equal(styles.signOutButton.minHeight, 52);
assert.ok(resident.declarations.get('reportScreen').includes('</ScrollView>\n      <View style={styles.newComplaintFooter}>'));
const requests = [];
const fixtures = [];
function fixture(scale, count, category, expanded) {
  const actions = [];
  const action = name => (...args) => actions.push({ name, args });
  const tag = style => named.get(Array.isArray(style) ? style[0] : style) || '';
  function View({ style, ...props }) { return React.createElement(RN.View, { ...props, style, dataSet: { qa: tag(style) } }); }
  function Pressable({ style, ...props }) { return React.createElement(RN.Pressable, { ...props, style, dataSet: { qa: tag(style) } }); }
  function Text({ style, ...props }) {
    const flat = RN.StyleSheet.flatten(style) || {};
    const effectiveScale = props.maxFontSizeMultiplier ? Math.min(scale, props.maxFontSizeMultiplier) : scale;
    return React.createElement(RN.Text, { ...props, style: [style, { fontSize: (flat.fontSize || 14) * 1.1 * effectiveScale }] });
  }
  function TextInput({ style, ...props }) {
    const flat = RN.StyleSheet.flatten(style) || {};
    return React.createElement(RN.TextInput, { ...props, style: [style, { fontSize: (flat.fontSize || 14) * scale }], dataSet: { qa: tag(style) } });
  }
  const Icon = ({ size = 20 }) => React.createElement(View, { style: { width: size, height: size, flexShrink: 0 } });
  const LinearGradient = ({ colors, start: _start, end: _end, ...props }) => React.createElement(View, { ...props, style: [props.style, { backgroundImage: `linear-gradient(${colors.join(',')})` }] });
  const ctx = { React, View, Text, Pressable, ScrollView: View, Card: View, Modal: View, TextInput, LinearGradient, Image: RN.Image, ExpoImage: RN.Image, ActivityIndicator: () => null,
    RevealRow: ({ children }) => children, ToastMotion: View, MotionChevron: View, AccordionBody: ({ expanded, children }) => expanded ? children : null,
    useSlidingTabPill: () => ({ indicator: null, itemLayout() {}, iconLayout() {} }), revealReports: false, revealSchedule: false,
    SkeletonRegion: ({ children }) => children, SkeletonBlock: () => null, SkeletonRows: () => null, useSkeletonVisible: () => ({ pending: false }), scheduleSkeleton: {}, reportsSkeleton: {}, messagesSkeleton: {},
    Switch: RN.Switch, Feather: Icon, MaterialCommunityIcons: Icon, House: Icon, MessageCircleWarning: Icon, Newspaper: Icon, UserRound: Icon, styles, ss,
    StyleSheet: RN.StyleSheet, BrandMark: ({ width, height }) => React.createElement(View, { style: { width, height, flexShrink: 0 } }),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0 }), useEffect: () => {}, useCallback: fn => fn,
    useState: initial => [initial, action('state')],
    displayName: 'A resident with a very long name', isLoadingSchedule: false, scheduleError: '',
    location: 'Abella, Naga City',
    isLoadingReports: false, reportError: '', setActiveTab: action('tab'), setSelectedReport: action('detail'),
    isCreatingReport: false, isSubmitting: false, isCapturingPhoto: false, reportSubject: '', description: '', reportMessage: '', socketStatus: 'connected',
    setReportSubject: action('subject'), setDescription: action('message'), setSelectedPhoto: action('photo'), setPhotoMetadata: action('metadata'), setAiDetection: action('ai'), setReportMessage: action('report-message'), setIsCreatingReport: action('create'),
    capturePhoto: action('camera'), submitReport: action('submit'), selectedPhoto: null,
  };
  for (const name of ['formatDate', 'getReportSubject', 'getReportBody', 'toWasteLabel', 'realtimeStatusText']) {
    ctx[name] = evaluate(resident.functions.get(name) || resident.declarations.get(name), ctx);
  }
  const statuses = ['pending', 'verified', 'scheduled', 'resolved', 'rejected'];
  ctx.pastReports = Array.from({ length: count }, (_, index) => ({ _id: String(index), description: `A very long complaint title that must not collide with its chevron\n\nA long complaint preview and reference`, createdAt: '2026-10-18T08:00:00Z', status: statuses[index % statuses.length] }));
  ctx.schedule = { nextCollection: '2026-10-21', nextWasteType: category };
  ctx.todayCollection = { wasteType: category };
  ctx.weeklyCollections = [{ date: '2026-10-21', dayName: 'Wednesday', wasteType: category }];
  ctx.nextTimeWindows = ['4:00 AM–8:00 AM', '9:00 AM–1:00 PM'];
  ctx.CITY_NEWS = [{ id: 'news', category: 'Solid Waste Management Office', headline: 'DENR Secretary & Mayor Leni Address Naga City Solid Waste Concerns', date: 'May 22, 2026', excerpt: 'The City Solid Waste Management Office (SWMO), headed by Engr. Joel P. Martin, met with DENR Secretary to discuss collection.', image: { uri: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E' } }];
  for (const name of ['StatusPill', 'WastePill', 'HomeSectionLabel', 'ReportList', 'NewsListItem', 'RealtimeStatus', 'BottomNavigation']) ctx[name] = evaluate(resident.functions.get(name), ctx);
  const homeTree = evaluate(resident.declarations.get('homeScreen'), ctx);
  const firstSection = elements(homeTree).find(node => node.type === ctx.HomeSectionLabel);
  assert.equal(firstSection.props.label, 'Next collection');
  assert.equal(firstSection.props.first, true);
  assert.equal(RN.StyleSheet.flatten(ctx.HomeSectionLabel(firstSection.props).props.style).marginTop, 0);
  assert.equal(styles.scrollContent.padding, 20);
  assert.ok(!renderToStaticMarkup(homeTree).includes('Collection is happening right now'));
  ctx.renderPhotoProofSection = evaluate(resident.declarations.get('renderPhotoProofSection'), ctx);
  const sections = [
    ['header', evaluate(resident.header, ctx)],
    ['home', evaluate(resident.declarations.get('homeScreen'), ctx)],
    ['news', evaluate(resident.declarations.get('scheduleScreen'), ctx)],
    ['complaints', evaluate(resident.declarations.get('reportScreen'), ctx)],
    ['new', evaluate(resident.declarations.get('reportScreen'), { ...ctx, isCreatingReport: true })],
    ['tabs', ctx.BottomNavigation({ activeTab: 'report', onChange: action('tab') })],
  ];
  const list = ctx.ReportList({ reports: ctx.pastReports, onSelect: action('detail') });
  elements(list).filter(item => item.props?.onPress).forEach(item => item.props.onPress());
  assert.equal(actions.filter(item => item.name === 'detail').length, count);
  const newTree = sections.find(([name]) => name === 'new')[1];
  elements(newTree).find(item => item.props?.style?.includes?.(styles.newComplaintSendButton)).props.onPress();
  assert.ok(actions.some(item => item.name === 'submit'));
  ctx.renderPhotoProofSection().props.onPress();
  assert.ok(actions.some(item => item.name === 'camera'));
  const listHtml = renderToStaticMarkup(list);
  if (count >= 5) for (const label of ['Pending', 'Acknowledged-Scheduled', 'Resolved', 'Rejected']) assert.ok(listHtml.includes(label));

  // HeroUI parts are native dependencies; this fixture checks the actual composition,
  // props and callbacks, while rendering equivalent Views for browser layout only.
  const Tabs = ({ children }) => React.createElement(View, null, children);
  Tabs.List = View; Tabs.Trigger = Pressable; Tabs.Label = Text; Tabs.Indicator = View;
  const settingsCtx = { ...ctx, Tabs, ChangePasswordModal: () => null, Linking: { openURL: action('link') }, Alert: { alert: action('alert') },
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ success: true }) }; },
  };
  settingsCtx.DEFAULT_SETTINGS = evaluate(settings.declarations.get('DEFAULT_SETTINGS'), {});
  for (const name of ['SectionHeader', 'SettingRow', 'PreferenceTabs', 'ThemePills', 'LanguageSelector']) settingsCtx[name] = evaluate(settings.functions.get(name), settingsCtx);
  for (const name of ['FaqItem', 'WasteGuideCard']) settingsCtx[name] = evaluate(settings.functions.get(name), { ...settingsCtx, useState: () => [expanded, action('expand')] });
  const appInfo = { faqs: [{ q: 'API question is visible?', a: 'API answer remains unchanged.' }], wasteGuide: [
    { category: 'Biodegradable', color: '#0A7F4F', accentColor: '#0A7F4F', items: ['Food scraps'] },
    { category: 'Non-Biodegradable', color: '#1A56C4', accentColor: '#1A56C4', items: ['Plastic'] },
    { category: 'Recyclables', color: '#B45309', accentColor: '#B45309', items: ['Bottles'] },
    { category: 'Hazardous', color: '#B3261E', accentColor: '#B3261E', items: ['Batteries'] },
  ] };
  for (const theme of ['light', 'dark', 'system']) {
    for (const language of ['en', 'fil']) {
      const renderSettings = evaluate(settings.functions.get('ResidentSettingsModal'), { ...settingsCtx, useState: initial => [initial === null ? appInfo : initial === settingsCtx.DEFAULT_SETTINGS ? { ...initial, theme, language, notifications: { ...initial.notifications, pushEnabled: !expanded } } : initial, action('settings-state')] });
      const tree = renderSettings({ visible: true, session: { token: 'fixture', user: { name: 'A resident with a very long name', email: 'averylongemailaddress@example.com', role: 'resident' } }, apiUrl: 'https://fixture.invalid/api', onClose: action('close'), onSignOut: action('signout'), onSessionUpdate: action('session') });
      const html = renderToStaticMarkup(tree);
      assert.ok(html.includes('API question is visible?'));
      assert.equal(html.includes('API answer remains unchanged.'), expanded);
      const nodes = elements(tree);
      const themeControl = nodes.find(item => item.type === settingsCtx.ThemePills);
      assert.equal(themeControl.props.value, theme);
      themeControl.props.onChange(theme);
      const languageControl = nodes.find(item => item.type === settingsCtx.LanguageSelector);
      assert.equal(languageControl.props.value, language);
      languageControl.props.onChange(language);
      const rows = nodes.filter(item => item.type === settingsCtx.SettingRow && item.props.right);
      assert.equal(rows.length, 4);
      for (const row of rows) {
        const control = row.props.right;
        assert.equal(control.props.accessibilityLabel, row.props.label);
        if (row.props.label !== 'Push Notifications') assert.equal(control.props.disabled, expanded);
        control.props.onValueChange(false);
      }
      sections.push([`settings-${theme}-${language}`, tree]);
    }
  }
  const profileContext = { ...ctx, CITY: 'Naga City', isEditingProfile: false, profileMessage: '', isSavingProfile: false,
    displayName: count ? 'An exceptionally long resident name with several family names' : 'Richard', firstInitial: count ? 'A' : 'R',
    setProfileMessage: action('profile-message'), setIsEditingProfile: action('edit'), setIsSettingsVisible: action('settings'), signOut: action('signout'),
    profileName: 'Richard', profilePhone: '09661488173', profileLocation: 'Abella', setProfileName: action('profile-name'), setProfilePhone: action('profile-phone'), setProfileLocation: action('profile-location'), saveProfile: action('profile-save'), BarangayPicker: () => null,
  };
  for (const hasPhone of [false, true]) for (const hasAddress of [false, true]) {
    const session = { user: { phone: hasPhone ? '09661488173' : '   ', location: hasAddress ? 'Abella, Triangulo, San Francisco' : '', barangay: '' } };
    const tree = evaluate(resident.declarations.get('profileScreen'), { ...profileContext, session, phone: session.user.phone || 'Phone number not set', location: session.user.location || 'Location not set' });
    const nodes = elements(tree);
    assert.equal(nodes.filter(item => item.props?.style === styles.profileContactRow).length, Number(hasPhone) + Number(hasAddress));
    const menuRows = nodes.filter(item => item.props?.style === styles.menuRow || item.props?.style?.[0] === styles.menuRow);
    assert.equal(menuRows.length, 3);
    assert.equal(menuRows[2].props.onPress, undefined, 'Privacy Policy must retain its existing behavior');
    menuRows[0].props.onPress();
    assert.equal(actions.at(-1).name, 'settings');
    assert.equal(actions.at(-1).args[0], true);
    menuRows[1].props.onPress();
    assert.equal(actions.at(-1).args[0], 'schedule');
    nodes.find(item => item.props?.style === styles.editProfileButton).props.onPress();
    assert.equal(actions.at(-1).name, 'edit');
    assert.equal(actions.at(-1).args[0], true);
    nodes.find(item => item.props?.style === styles.signOutButton).props.onPress();
    assert.equal(actions.at(-1).name, 'signout');
    assert.equal(nodes.filter(item => item.props?.accessibilityLabel === 'Settings').length, 0, 'Duplicate gear button is removed');
    sections.push([`profile-${hasPhone}-${hasAddress}`, tree]);
  }
  const editing = evaluate(resident.declarations.get('profileScreen'), { ...profileContext, isEditingProfile: true });
  const editNodes = elements(editing);
  editNodes.find(item => item.props?.style?.[0] === styles.profileSaveButton).props.onPress();
  assert.equal(actions.at(-1).name, 'profile-save');
  editNodes.find(item => item.props?.style === styles.profileCancelButton).props.onPress();
  assert.ok(actions.some(item => item.name === 'edit' && item.args[0] === false));
  assert.equal(editNodes.filter(item => item.type === TextInput).length, 2);
  sections.push(['profile-edit', editing]);
  for (const [name, tree] of sections) fixtures.push(`<section data-screen="${name}" data-scale="${scale}" data-count="${count}" style="width:360px">${renderToStaticMarkup(tree)}</section>`);
}
for (const scale of [1, 2]) for (const count of [0, 1, 5]) for (const category of ['Biodegradable', 'Non-Biodegradable']) for (const expanded of [false, true]) fixture(scale, count, category, expanded);
assert.ok(requests.some(request => JSON.parse(request.init.body).theme === 'dark'));
assert.ok(requests.some(request => JSON.parse(request.init.body).language === 'fil'));
assert.ok(requests.some(request => JSON.parse(request.init.body).notifications?.pushEnabled === false));
console.log(`PASS: ${fixtures.length} isolated layout fixtures, including Profile long names, missing contact lines, original edit/menu callbacks, FAQ expansion, every report status and Settings controls.`);
if (process.argv.includes('--logic-only')) process.exit(0);
function browserCheck() {
  const failures = [];
  const checked = new Set(['brandHeader', 'collectionBanner', 'nextCollectionCard', 'weeklyRow', 'complaintRow', 'newsCard', 'complaintsHeader', 'newComplaintHeader', 'photoEmptyPicker', 'newComplaintFooter', 'bottomNav', 'accountCard', 'settingRow', 'pillRow', 'hotlineRow', 'faqItem', 'wasteCard', 'dangerCard', 'profileHero', 'profileHeroRow', 'profileHeroCopy', 'profileContactRow', 'menuRow', 'editProfileButton', 'signOutButton']);
  const sections = [...document.querySelectorAll('section')];
  for (const section of sections) {
    const frame = section.getBoundingClientRect();
    for (const item of section.querySelectorAll('[data-qa]')) {
      if (!checked.has(item.dataset.qa)) continue;
      const rect = item.getBoundingClientRect();
      if (rect.left < frame.left - 1 || rect.right > frame.right + 1 || item.scrollWidth > item.clientWidth + 1) failures.push(`${section.dataset.screen}/${section.dataset.count}/${section.dataset.scale}: ${item.dataset.qa} overflow`);
    }
  }
  document.getElementById('result').textContent = JSON.stringify({ sections: sections.length, failures });
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-resident-ui-'));
const target = path.join(directory, 'fixtures.html');
const sheet = RN.StyleSheet.getSheet();
fs.writeFileSync(target, `<!doctype html><html><head><meta charset="utf-8"><style>${sheet.textContent}body{margin:0}section{margin-bottom:24px;border-bottom:4px solid #aaa}</style></head><body>${fixtures.join('')}<pre id="result"></pre><script>(${browserCheck.toString()})()</script></body></html>`);
console.log(`Fixtures: ${target}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(directory, 'edge')}`, '--dump-dom', pathToFileURL(target).href], { timeout: 60000, maxBuffer: 30 * 1024 * 1024, windowsHide: true }).toString();
const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
assert.ok(result, 'Browser result missing');
const parsed = JSON.parse(result.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
console.log(JSON.stringify(parsed));
assert.deepEqual(parsed.failures, []);
