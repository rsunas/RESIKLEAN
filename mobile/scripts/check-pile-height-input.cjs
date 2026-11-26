const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

let theme = 'light';
let dismissed = 0;
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/pile-height-input.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const output = {};
new Function('require', 'exports', compiled)(name => {
  if (name === 'react') return { useRef: () => ({ current: { blur() {} } }), useState: initial => [initial, () => {}] };
  if (name === 'react/jsx-runtime') return require(name);
  if (name === 'react-native') return { View: 'View', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Keyboard: { dismiss: () => dismissed++ }, StyleSheet: { create: value => value } };
  if (name.endsWith('/vector-icons')) return { Feather: 'Icon' };
  if (name.endsWith('/app-text')) return { AppText: 'Text' };
  if (name.endsWith('/app-preferences')) return { useAppTheme: () => theme };
  if (name.endsWith('/mobile-palette')) return { darkPalette: { text: '#F3F7F4', muted: '#B4C4BB', field: '#24332B', surface: '#1A2420', border: '#42574B', tint: '#173E2D' } };
  throw new Error(`Unexpected import: ${name}`);
}, output);

function nodes(tree) {
  if (!React.isValidElement(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}

for (const unit of ['cm', 'm']) {
  for (theme of ['light', 'dark']) {
    const changes = [], visibility = [];
    const props = { label: 'Pile height', unit, value: unit === 'cm' ? '150' : '0.5', open: true, onChange: value => changes.push(value), onOpenChange: value => visibility.push(value) };
    const tree = nodes(output.PileHeightInput(props));
    const input = tree.find(node => node.type === 'TextInput');
    const choices = tree.filter(node => node.type === 'Pressable' && 'selected' in node.props.accessibilityState);
    assert.equal(choices.length, 31);
    const labels = choices.map(choice => choice.props.children.props.children);
    assert.equal(labels[0], unit === 'cm' ? '100' : '0');
    assert.equal(labels.at(-1), unit === 'cm' ? '400' : '3.0');
    assert.equal(new Set(labels).size, 31);
    for (let i = 1; i < labels.length; i++) assert.ok(Math.abs(Number(labels[i]) - Number(labels[i - 1]) - (unit === 'cm' ? 10 : 0.1)) < 1e-9);
    assert.equal(choices.filter(choice => choice.props.accessibilityState.selected).length, 1);
    choices[10].props.onPress();
    assert.equal(changes.at(-1), unit === 'cm' ? '200' : '1.0');
    assert.equal(visibility.at(-1), false);
    // Manual decimals and values outside the suggestion range stay editable.
    for (const value of unit === 'cm' ? ['125.5', '90', '450', ''] : ['0.35', '3.25', '']) {
      input.props.onChangeText(value);
      assert.equal(changes.at(-1), value);
    }
    input.props.onFocus();
    assert.equal(visibility.at(-1), true);
    assert.equal(input.props.style[1].color, theme === 'dark' ? '#F3F7F4' : '#121A16');
    const closed = nodes(output.PileHeightInput({ ...props, open: false }));
    assert.equal(closed.some(node => node.type === 'ScrollView'), false);
    closed.find(node => node.type === 'Pressable').props.onPress();
    assert.equal(visibility.at(-1), true);
  }
}
assert.ok(dismissed > 0);
console.log('PASS: both suggestion ranges, selection/closing, custom manual values, toggling, and light/dark input text.');
