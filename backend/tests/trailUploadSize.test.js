jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/middlewares/auth', () => ({ protect: (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ success: false });
  req.user = { _id: 'test-driver', role: 'collector' }; next();
} }));
jest.mock('../src/controllers/collector.controller', () => ({
  ...jest.requireActual('../src/controllers/collector.controller'),
  batchSyncTrails: (req, res) => res.json({ success: true, count: req.body.sessions[0].points.length, last: req.body.sessions[0].points.at(-1).clientId }),
}));
const app = require('../app');
let server, base;
beforeAll(async () => {
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const post = (url, body, authenticated = true) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(body) });
test('a saved long trip reaches the trail controller with its final GPS point', async () => {
  const points = Array.from({ length: 6000 }, (_, i) => ({ clientId: `point-${i}`, recordedAt: new Date(Date.UTC(2026, 10, 23, 2, 0, i * 5)).toISOString(), latitude: 13.62, longitude: 123.18 + i / 1000000, accuracyMeters: 5, altitudeMeters: 12, headingDegrees: 90, speedMetersPerSecond: 3 }));
  const body = { sessions: [{ clientSessionId: 'saved-trip', points }] };
  expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(102400);
  // Demonstrate the original cutoff with Express's default parser.
  const express = require('express');
  const oldApp = express(); oldApp.use(express.json());
  oldApp.post('/trail', (req, res) => res.json({ count: req.body.sessions[0].points.length }));
  oldApp.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  let oldServer; await new Promise(resolve => { oldServer = oldApp.listen(0, '127.0.0.1', resolve); });
  try {
    const rejected = await fetch('http://127.0.0.1:' + oldServer.address().port + '/trail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(rejected.status).toBe(413); await rejected.text();
  } finally { oldServer.closeAllConnections(); await new Promise(resolve => oldServer.close(resolve)); }
  const response = await post('/api/collector/trails/batch', body);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, count: 6000, last: 'point-5999' });
});
test('the larger trail limit stays bounded and does not relax other endpoints', async () => {
  expect((await post('/api/collector/trails/batch', { padding: 'x'.repeat(10 * 1024 * 1024) })).status).toBe(413);
  expect((await post('/api/auth/login', { padding: 'x'.repeat(110000) })).status).toBe(413);
  expect((await post('/api/collector/trails/batch', { sessions: [] }, false)).status).toBe(401);
});