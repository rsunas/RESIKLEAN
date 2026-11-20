const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const TruckLoad = require('../src/models/TruckLoad');
const cloud = require('../src/services/cloudinary.service');
mock.method(TruckLoad, 'create', async value => value);
mock.method(cloud, 'uploadPhoto', async () => ({ url: 'https://example.test/photo.jpg' }));
const { submitTruckLoad } = require('../src/controllers/staff.controller');
async function submit(overrides = {}, files) {
  const req = { user: { _id: '000000000000000000000001' }, body: { truckPlate: 'TEST-1', length: 4, width: 2, height: 1, pileHeightsCm: JSON.stringify({ front: 10, middle: 20, back: 30 }), ...overrides }, files };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await submitTruckLoad(req, res);
  return res;
}
test('pile heights convert cm to additional cubic metres without requiring photos', async () => {
  const result = await submit({ slope: 999 });
  assert.equal(result.code, 201);
  assert.equal(result.body.data.slope, 1.6);
  assert.deepEqual(result.body.data.pileHeightsCm, { front: 10, middle: 20, back: 30 });
});
test('zero pile heights are valid', async () => {
  const result = await submit({ pileHeightsCm: { front: 0, middle: 0, back: 0 } });
  assert.equal(result.code, 201);
  assert.equal(result.body.data.slope, 0);
});
test('invalid, negative and incomplete measurements are rejected', async () => {
  for (const value of ['bad json', { front: -1, middle: 0, back: 0 }, { front: 2 }, { front: '', middle: 0, back: 0 }]) {
    assert.equal((await submit({ pileHeightsCm: value })).code, 400);
  }
});
test('either optional photo can be submitted independently', async () => {
  for (const field of ['sidePhoto', 'backPhoto']) {
    const result = await submit({}, { [field]: [{ buffer: Buffer.from('test') }] });
    assert.equal(result.code, 201);
    assert.equal(result.body.data[field + 'Url'], 'https://example.test/photo.jpg');
  }
});
test('legacy queued submissions still accept volume correction', async () => {
  const result = await submit({ pileHeightsCm: undefined, slope: 0.5 });
  assert.equal(result.code, 201);
  assert.equal(result.body.data.slope, 0.5);
});
