// Read-only source extraction: exercises the actual History JSX/styles, without
// loading auth, APIs, SQLite or native camera modules. Browser layout is a proxy,
// not a replacement for an Android accessibility/device check.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const RN = require('react-native-web');

const source = ts.createSourceFile('staff.tsx', fs.readFileSync(path.join(__dirname, '../app/staff.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer?.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
function evaluate(expression, context) {
  const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn result;`)(...Object.values(context));
}
const styles = evaluate(declarations.get('styles'), { StyleSheet: RN.StyleSheet });
const formatTonnage = evaluate(declarations.get('formatTonnage'), {});
const formatHistoryNumber = evaluate(declarations.get('formatHistoryNumber'), {});
const formatHistoryTonnage = evaluate(declarations.get('formatHistoryTonnage'), { formatHistoryNumber });
assert.equal(formatHistoryTonnage(3.41628), '3.42 t');
assert.equal(formatHistoryTonnage(4762800.147), '4.76M t');
assert.equal(formatHistoryTonnage(99999.99), '99,999.99 t');
assert.equal(formatHistoryNumber(999999), '999,999');
assert.equal(formatHistoryNumber(1000000), '1M');
assert.equal(formatHistoryNumber(4762821344421.35), '4.76T');
assert.equal(formatHistoryNumber(0), '0');
assert.equal(formatHistoryNumber(1), '1');
assert.equal(styles.historyCard.height, undefined);
assert.equal(styles.historyCard.overflow, 'visible');
assert.equal(styles.historyMeasurementColumn.flex, 1);
assert.equal(styles.historyMeasurementColumn.minWidth, 0);
assert.equal(styles.totalValue.fontSize, 30);
assert.equal(styles.tonnage.fontSize, 18);
assert.ok(!declarations.get('renderHistory').includes('adjustsFontSizeToFit'));
assert.ok(!declarations.get('renderHistory').includes('truck-outline'));
assert.ok(!declarations.get('renderHistory').includes('historyChip'));

const dimensions = [[5, 2.36, 0.9, 1], [4.57, 2.3, 1, 0], [450, 200, 180, 0.5], [450, 200, 180, 0]];
function fixture(index) {
  const [length, width, height, slope] = index === 4 ? [45000, 20000, 18000, 0] : dimensions[index % 4];
  return {
    id: String(index), length, width, height, slope: `${slope.toFixed(1)} m³`,
    tonnes: (length * width * height + slope) * 0.294,
    barangay: index % 4 === 2 ? '' : index % 4 === 1 ? 'A very long area name with multiple barangays and street names' : 'Area 1C',
    driver: index % 4 === 1 ? 'A very long driver name that should ellipsize at the end' : 'Dr Doom',
    submittedAt: 'Oct 8, 11:36 AM', status: index % 3 === 0 ? 'Pending' : 'Synced',
  };
}
function renderCase(count, fontScale) {
  function View(props) {
    const qa = props.style === styles.historyCard ? 'card'
      : props.style === styles.historyMeasurementColumn ? 'measurement'
      : props.style === styles.historyMeasurements ? 'measurement-row'
      : props.style === styles.totalCard ? 'summary'
      : props.style === styles.totalStat ? 'stat' : undefined;
    return React.createElement(RN.View, { ...props, dataSet: qa ? { qa } : undefined });
  }
  function Text({ style, ...props }) {
    const flat = RN.StyleSheet.flatten(style) || {};
    // Match AppText's existing 1.1 multiplier, then simulate OS font scaling.
    return React.createElement(RN.Text, {
      ...props,
      style: [style, { fontSize: (flat.fontSize || 14) * 1.1 * fontScale, ...(flat.lineHeight ? { lineHeight: flat.lineHeight * fontScale } : {}) }],
    });
  }
  function NativeText({ style, ...props }) {
    const flat = RN.StyleSheet.flatten(style) || {};
    const qa = style === styles.totalValue ? 'summary-value' : style === styles.tonnage ? 'tonnage' : undefined;
    return React.createElement(RN.Text, {
      ...props,
      dataSet: qa ? { qa } : undefined,
      style: [style, { fontSize: (flat.fontSize || 14) * fontScale }],
    });
  }
  const Icon = ({ size }) => React.createElement(RN.View, { style: { width: size, height: size, flexShrink: 0 } });
  const history = Array.from({ length: count }, (_, index) => fixture(index));
  const renderHistory = evaluate(declarations.get('renderHistory'), {
    React, View, Text, NativeText, Card: View, ScrollView: RN.ScrollView, Pressable: RN.Pressable,
    RevealRow: ({ children }) => children, revealHistory: false,
    SkeletonRegion: ({ children }) => children, SkeletonBlock: () => null, SkeletonRows: () => null, historySkeleton: {},
    LinearGradient: ({ style }) => React.createElement(RN.View, { style }),
    MaterialCommunityIcons: Icon, Feather: Icon, ActivityIndicator: RN.ActivityIndicator,
    styles, history, historyLoading: false, historyError: '', pendingSync: 0,
    isSyncing: false, handleManualSync() {}, setSelectedSubmission() {},
    fontScale, totalTonnage: history.reduce((total, row) => total + row.tonnes, 0),
    formatTonnage, formatHistoryTonnage, formatHistoryNumber,
  });
  const html = renderToStaticMarkup(renderHistory());
  assert.equal((html.match(/data-qa="card"/g) || []).length, count);
  assert.equal((html.match(/data-qa="measurement"/g) || []).length, count * 4);
  assert.equal((html.match(/data-qa="summary-value"/g) || []).length, 2);
  if (count === 0) assert.ok(html.includes('No submissions yet'));
  if (count >= 4) assert.ok(html.includes('No area assigned'));
  return `<section data-count="${count}" data-scale="${fontScale}" style="width:360px">${html}</section>`;
}
const cases = [0, 1, 4, 50].flatMap((count) => [1, 2].map((scale) => renderCase(count, scale)));
const browserChecks = function () {
  const failures = [];
  const results = [];
  for (const section of document.querySelectorAll('section')) {
    const cards = [...section.querySelectorAll('[data-qa="card"]')];
    const cardHeights = [];
    const summary = section.querySelector('[data-qa="summary"]');
    const statWidths = [...summary.querySelectorAll('[data-qa="stat"]')].map(stat => stat.getBoundingClientRect().width);
    if (Math.max(...statWidths) - Math.min(...statWidths) > 0.5) failures.push('Unequal summary columns');
    for (const value of summary.querySelectorAll('[data-qa="summary-value"]')) {
      if (parseFloat(getComputedStyle(value).fontSize) !== 30 * Number(section.dataset.scale)) failures.push('Summary font shrank');
    }
    if (summary.scrollWidth > summary.clientWidth + 1) failures.push('Summary overflow');
    for (const [index, card] of cards.entries()) {
      const bounds = card.getBoundingClientRect();
      cardHeights.push(bounds.height);
      const columns = [...card.querySelectorAll('[data-qa="measurement"]')];
      const widths = columns.map(column => column.getBoundingClientRect().width);
      const tops = columns.map(column => column.getBoundingClientRect().top);
      if (Math.max(...widths) - Math.min(...widths) > 0.5) failures.push('Unequal measurement columns');
      if (Math.max(...tops) - Math.min(...tops) > 0.5) failures.push('Measurements wrapped');
      for (const column of columns) {
        const rect = column.getBoundingClientRect();
        if (rect.bottom > bounds.bottom + 0.5 || rect.right > bounds.right + 0.5 || rect.left < bounds.left - 0.5) failures.push(`Clipped measurement: count=${section.dataset.count} scale=${section.dataset.scale} index=${index}`);
      }
      const amount = card.querySelector('[data-qa="tonnage"]');
      if (parseFloat(getComputedStyle(amount).fontSize) !== 18 * Number(section.dataset.scale)) failures.push('Tonnage font shrank');
      if (amount.scrollWidth > amount.clientWidth + 1) failures.push('Tonnage truncated');
      if (card.scrollWidth > card.clientWidth + 1) failures.push(`Card overflow: ${index}`);
      const sectionBounds = section.getBoundingClientRect();
      if (bounds.right > sectionBounds.right + 0.5 || bounds.left < sectionBounds.left - 0.5) failures.push('Card escapes screen');
    }
    if (cardHeights.length && Math.max(...cardHeights) - Math.min(...cardHeights) > 0.5) failures.push('Unequal card heights');
    results.push({ records: cards.length, fontScale: Number(section.dataset.scale), cardHeight: cardHeights[0] || null });
  }
  document.querySelector('#qa-result').textContent = JSON.stringify({ failures, results });
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${RN.StyleSheet.getSheet().textContent}</style></head><body style="margin:0">${cases.join('')}<pre id="qa-result"></pre><script>(${browserChecks.toString()})()</script></body></html>`;
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resiklean-history-qa-'));
const htmlPath = path.join(outputDir, 'history.html');
fs.writeFileSync(htmlPath, html);
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dom = execFileSync(edge, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(outputDir, 'browser')}`, '--dump-dom', pathToFileURL(htmlPath).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const result = JSON.parse(dom.match(/<pre id="qa-result">([^<]+)<\/pre>/)?.[1] || '{}');
assert.ok(Array.isArray(result.failures), 'Browser did not execute layout checks');
console.log(JSON.stringify({ ...result, fixture: htmlPath }, null, 2));
assert.deepEqual(result.failures, []);
