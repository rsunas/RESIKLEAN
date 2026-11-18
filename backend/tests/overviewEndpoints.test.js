const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Route = require('../src/models/Route');
const Log = require('../src/models/RouteLog');
const Session = require('../src/models/RouteTrailSession');
const Report = require('../src/models/MissedReport');
const endpoints = ['coverage', 'daily-completion', 'complaints-by-status', 'stops-by-hour', 'frequently-uncompleted'];
let server, base;
const chain = value => { const q = { select: () => q, sort: () => q, lean: async () => value }; return q; };
const auth = role => {
  jest.spyOn(User, 'findById').mockReturnValue({ select: async () => ({ _id: 'admin', role }) });
  return { Authorization: `Bearer ${jwt.sign({ id: 'admin' }, process.env.JWT_SECRET)}` };
};
beforeAll(async () => {
  process.env.JWT_SECRET = 'overview-test-secret';
  const app = express();
  app.use('/api/admin', require('../src/routes/admin.routes'));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/admin/overview/`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
afterEach(() => jest.restoreAllMocks());

test('all five endpoints require JWT and the admin role', async () => {
  for (const endpoint of endpoints) expect((await fetch(base + endpoint)).status).toBe(401);
  for (const role of ['resident', 'collector', 'staff']) {
    const headers = auth(role);
    for (const endpoint of endpoints) expect((await fetch(base + endpoint, { headers })).status).toBe(403);
  }
});

test('validates range and area before database queries', async () => {
  const headers = auth('admin');
  for (const query of ['coverage?range=bad', 'coverage?area[x]=bad', 'daily-completion?range=month', 'coverage?range[]=today', 'complaints-by-status?range=5y']) expect((await fetch(base + query, { headers })).status).toBe(400);
});

test('empty database returns real empty states and no fabricated sync times', async () => {
  const headers = auth('admin');
  jest.spyOn(Route, 'find').mockReturnValue(chain([]));
  jest.spyOn(Session, 'find').mockReturnValue(chain([]));
  jest.spyOn(Log, 'aggregate').mockResolvedValue([]);
  jest.spyOn(Report, 'aggregate').mockResolvedValue([]);
  for (const endpoint of endpoints) {
    const response = await fetch(base + endpoint, { headers });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.lastSyncedAt).toBeNull();
    expect(data.timezone).toBe('Asia/Manila');
  }
});

test('scheduled complaints map to Verified with four categories and exact counts', async () => {
  const headers = auth('admin');
  const aggregate = jest.spyOn(Report, 'aggregate').mockResolvedValue([{ _id: 'verified', count: 2 }, { _id: 'scheduled', count: 3 }, { _id: 'pending', count: 5, receivedAt: new Date('2026-11-18T01:00:00Z') }]);
  const response = await fetch(base + 'complaints-by-status?range=7d&area=Dayangdang', { headers });
  const { data } = await response.json();
  expect(data.statuses).toHaveLength(4);
  expect(data.statuses.find(item => item.status === 'verified')).toMatchObject({ count: 5, percent: 50 });
  expect(data.total).toBe(10);
  expect(data.lastSyncedAt).toBe('2026-11-18T01:00:00.000Z');
  expect(aggregate.mock.calls[0][0][0].$match.barangay).toBe('Dayangdang');
});

test('complaints default to all dates and empty results return four zero-count slices', async () => {
  const headers = auth('admin');
  const aggregate = jest.spyOn(Report, 'aggregate').mockResolvedValue([]);
  const response = await fetch(base + 'complaints-by-status', { headers });
  const { data } = await response.json();
  expect(data).toMatchObject({ range: 'all', start: null, end: null, total: 0 });
  expect(data.statuses).toEqual([
    { status: 'pending', count: 0, percent: 0 },
    { status: 'verified', count: 0, percent: 0 },
    { status: 'resolved', count: 0, percent: 0 },
    { status: 'rejected', count: 0, percent: 0 },
  ]);
  expect(aggregate.mock.calls[0][0][0].$match).toEqual({});
});

test('hour buckets use exit time in Manila and aggregation deduplicates across drivers', async () => {
  const headers = auth('admin');
  const now = new Date();
  const date = require('../src/services/overviewMetrics').dayKey(now);
  jest.spyOn(Route, 'find').mockReturnValue(chain([{ _id: 'route', name: 'Actual route', barangay: ['Area'], isActive: true, collectorId: 'driver', schedule: [0, 1, 2, 3, 4, 5, 6], stops: [{ _id: 'stop', name: 'Actual stop' }] }]));
  jest.spyOn(Session, 'find').mockReturnValue(chain([]));
  const aggregate = jest.spyOn(Log, 'aggregate').mockResolvedValue([{ routeId: 'route', stopId: 'stop', date, completedAt: new Date(`${date}T06:30:00+08:00`), receivedAt: now }]);
  const response = await fetch(base + 'stops-by-hour', { headers });
  expect((await response.json()).data).toMatchObject({ total: 1, peakHour: 6, hours: [{ hour: 6, count: 1 }] });
  const groupId = aggregate.mock.calls[0][0][1].$group._id;
  expect(groupId.collectorId).toBeUndefined();
  expect(groupId.date.$dateToString.timezone).toBe('Asia/Manila');
});
