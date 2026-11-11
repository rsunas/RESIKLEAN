const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadPhotoHelper({ os = 'android', failure } = {}) {
  const calls = [];
  const rendered = {
    saveAsync: async (options) => {
      calls.push(['save', options]);
      if (failure === 'save') throw new Error('save failed');
      return { uri: 'file:///optimized.jpg', width: 1600, height: 1200 };
    },
    release: () => calls.push(['releaseImage']),
  };
  const context = {
    resize: (options) => calls.push(['resize', options]),
    renderAsync: async () => {
      if (failure === 'render') throw new Error('render failed');
      return rendered;
    },
    release: () => calls.push(['releaseContext']),
  };
  const mocks = {
    'react-native': { Platform: { OS: os } },
    'expo-image-picker': { CameraType: { back: 'back' } },
    'expo-image-manipulator': { ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } },
    'expo-file-system/legacy': { getInfoAsync: async () => {
      if (failure === 'stat') throw new Error('stat failed');
      return { exists: true, size: 123456 };
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/proof-photo.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('require', 'exports', js)((name) => {
    assert.ok(mocks[name], `Unexpected native dependency: ${name}`);
    return mocks[name];
  }, exports);
  return { ...exports, calls };
}

const asset = { uri: 'file:///camera.jpg', fileName: 'camera.png', width: 8000, height: 6000, fileSize: 15000000 };
test('camera avoids base64, cropping and picker recompression', () => {
  const { proofCameraOptions } = loadPhotoHelper();
  assert.equal(proofCameraOptions.base64, false);
  assert.equal(proofCameraOptions.allowsEditing, false);
  assert.equal(proofCameraOptions.quality, 1);
});
test('success downsizes and releases both native objects on first and second capture', async () => {
  const { optimizeProofPhoto, calls } = loadPhotoHelper();
  for (let i = 0; i < 2; i++) {
    const result = await optimizeProofPhoto(asset);
    assert.equal(result.fileSize, 123456);
    assert.equal(result.uri, 'file:///optimized.jpg');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.base64, null);
  }
  assert.equal(calls.filter(([name]) => name === 'releaseImage').length, 2);
  assert.equal(calls.filter(([name]) => name === 'releaseContext').length, 2);
  assert.deepEqual(calls[0], ['resize', { width: 1600 }]);
});
for (const failure of ['render', 'save', 'stat']) {
  test(`${failure} failure still releases native memory`, async () => {
    const { optimizeProofPhoto, calls } = loadPhotoHelper({ failure });
    await assert.rejects(optimizeProofPhoto(asset), new RegExp(`${failure} failed`));
    assert.equal(calls.filter(([name]) => name === 'releaseContext').length, 1);
    assert.equal(calls.filter(([name]) => name === 'releaseImage').length, failure === 'render' ? 0 : 1);
  });
}
test('portrait resize constrains height', async () => {
  const { optimizeProofPhoto, calls } = loadPhotoHelper();
  await optimizeProofPhoto({ ...asset, width: 6000, height: 8000 });
  assert.deepEqual(calls[0], ['resize', { height: 1600 }]);
});
test('web keeps browser upload object untouched', async () => {
  const { optimizeProofPhoto, calls } = loadPhotoHelper({ os: 'web' });
  assert.equal(await optimizeProofPhoto(asset), asset);
  assert.deepEqual(calls, []);
});
