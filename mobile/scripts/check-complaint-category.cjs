const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = (file, mocks = {}) => {
  const exports = {};
  new Function('require', 'exports', compile(fs.readFileSync(path.join(__dirname, file), 'utf8')))(name => mocks[name] || require(name), exports);
  return exports;
};
const categories = load('../src/lib/waste-categories.ts');
assert.deepEqual(categories.WASTE_CATEGORY_OPTIONS.map(option => option.value), require('../../backend/src/utils/wasteCategories'));

// Exercise the existing select, including opening, choosing each option and closing.
let states = [], cursor = 0, selected = '';
const select = load('../src/components/app-select.tsx', {
  react: { ...React, useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; } },
  'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ fontScale: 1 }) },
  'expo/node_modules/@expo/vector-icons': { Feather: 'Icon' },
  '@/components/app-motion': { MotionModal: 'Modal', MotionPressable: 'Pressable' },
  '@/components/app-text': { AppText: 'Text' },
  '@/constants/theme': { AuthColors: {} },
});
const elements = node => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];
const render = () => { cursor = 0; return elements(select.AppSelect({ appearance: 'auth', placeholder: 'Select waste category', value: selected, onChange: value => { selected = value; }, options: categories.WASTE_CATEGORY_OPTIONS })); };
for (const option of categories.WASTE_CATEGORY_OPTIONS) {
  render().find(node => node.type === 'Pressable').props.onPress();
  assert.equal(render().find(node => node.type === 'Modal').props.visible, true);
  render().find(node => node.key === option.value).props.onPress();
  assert.equal(selected, option.value);
  assert.equal(render().find(node => node.type === 'Modal').props.visible, false);
  assert.ok(render().find(node => node.props.accessibilityLabel === option.label));
}

// Execute the actual screen submission handler with isolated transport/state.
const source = fs.readFileSync(path.join(__dirname, '../app/resident.tsx'), 'utf8');
const start = source.indexOf('  const submitReport = async () => {');
const end = source.indexOf('  const saveProfile =', start);
assert.ok(start >= 0 && end > start);
const handler = compile(source.slice(start, end).replace('const submitReport', 'export const submitReport'));
async function submit(category, fail = false) {
  const changes = {}, requests = [];
  const context = {
    session: { token: 'fixture' }, API_URL: 'https://example.invalid/api',
    selectedPhoto: { uri: 'file:///proof.jpg', mimeType: 'image/jpeg', fileSize: 30 }, photoMetadata: {},
    reportSubject: 'Missed collection', description: 'Two bags awaiting collection', wasteCategory: category,
    WASTE_CATEGORY_OPTIONS: categories.WASTE_CATEGORY_OPTIONS,
    FormData: class { constructor() { this.fields = new Map(); } append(key, value) { this.fields.set(key, value); } },
    fetch: async (url, options) => { requests.push({ url, options }); if (fail) throw Error('Offline'); return { ok: true, json: async () => ({ success: true }) }; },
    loadReports: async () => {},
  };
  for (const name of ['setReportMessage', 'setIsSubmitting', 'setSelectedPhoto', 'setPhotoMetadata', 'setAiDetection', 'setReportSubject', 'setWasteCategory', 'setDescription', 'setIsCreatingReport']) context[name] = value => { changes[name] = value; };
  const exports = {};
  new Function(...Object.keys(context), 'exports', handler)(...Object.values(context), exports);
  await exports.submitReport();
  return { changes, requests };
}
(async () => {
  for (const invalid of ['', 'unknown']) {
    const { requests, changes } = await submit(invalid);
    assert.equal(requests.length, 0);
    assert.equal(changes.setReportMessage, 'Select a waste category for your complaint.');
  }
  for (const option of categories.WASTE_CATEGORY_OPTIONS) {
    const { requests, changes } = await submit(option.value);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.body.fields.get('wasteCategory'), option.value);
    assert.equal(requests[0].options.body.fields.get('description'), 'Missed collection\n\nTwo bags awaiting collection');
    assert.equal(changes.setWasteCategory, '');
    assert.equal(changes.setIsCreatingReport, false);
  }
  const failed = await submit('hazardous', true);
  assert.equal(failed.changes.setReportMessage, 'Offline');
  assert.equal(failed.changes.setIsSubmitting, false);
  assert.ok(!('setWasteCategory' in failed.changes), 'Failed submissions retain the selected category');
  assert.ok(!('setDescription' in failed.changes), 'Failed submissions retain the message');
  let persisted;
  const recovery = load('../src/lib/camera-recovery.ts', { 'expo-secure-store': { setItemAsync: async (key, value) => { persisted = value; }, getItemAsync: async () => persisted, deleteItemAsync: async () => { persisted = null; } } });
  await recovery.savePendingCameraContext({ type: 'resident', category: 'Complaint subject', notes: 'Two bags', wasteCategory: 'recyclable' });
  assert.equal((await recovery.getPendingCameraContext()).wasteCategory, 'recyclable');
  assert.equal((await recovery.getPendingCameraContext()).category, 'Complaint subject');
  const web = await import('../../web-dashboard/src/components/wasteCategories.js');
  for (const option of categories.WASTE_CATEGORY_OPTIONS) assert.equal(web.wasteCategoryLabel(option.value), option.label);
  for (const value of [undefined, null, '', 'unknown', 'toString']) { assert.equal(web.wasteCategoryLabel(value), 'Not specified'); assert.equal(categories.wasteCategoryLabel(value), 'Not specified'); }
  console.log('PASS: dropdown choices, required selection, all four submission payloads, retry draft retention, camera recovery, and consistent resident/admin labels.');
})().catch(error => { console.error(error); process.exitCode = 1; });
