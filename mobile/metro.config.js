const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

const metroConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});

// SQLite's web worker loads its database engine as a WebAssembly asset.
if (!metroConfig.resolver.assetExts.includes('wasm')) {
  metroConfig.resolver.assetExts.push('wasm');
}

// SQLite uses SharedArrayBuffer, which needs a cross-origin isolated page.
const previousEnhanceMiddleware = metroConfig.server?.enhanceMiddleware;
metroConfig.server = {
  ...metroConfig.server,
  enhanceMiddleware(middleware, server) {
    const enhancedMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(middleware, server)
      : middleware;
    return (request, response, next) => {
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      return enhancedMiddleware(request, response, next);
    };
  },
};

module.exports = metroConfig;
