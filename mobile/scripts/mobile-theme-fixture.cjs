// Supply the real theme implementation to isolated component interaction fixtures.
const fs = require('node:fs');
const ts = require('typescript');
const RN = require('react-native-web');
function load(file, dependencies = {}) {
  const js = ts.transpileModule(fs.readFileSync(__dirname + '/../' + file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', js)(key => dependencies[key] || require(key), exports);
  return exports;
}
const palette = load('src/constants/mobile-palette.ts');
function themeDependencies(theme = 'light') {
  const preferences = { useAppTheme: () => theme };
  const hooks = load('src/hooks/use-themed-styles.ts', {
    react: { useMemo: run => run(), useCallback: callback => callback },
    'react-native': RN, '@/hooks/app-preferences': preferences,
  });
  return {
    '@/constants/mobile-palette': palette,
    '@/hooks/use-themed-styles': hooks,
    '@/hooks/app-preferences': preferences,
    'expo-status-bar': { StatusBar: 'StatusBar' },
  };
}
module.exports = { themeDependencies, ...palette };
