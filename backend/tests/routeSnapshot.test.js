const mongoose = require('mongoose');
const Route = require('../src/models/Route');
const Session = require('../src/models/RouteTrailSession');
const Point = require('../src/models/RouteTrailPoint');
const Log = require('../src/models/RouteLog');
const User = require('../src/models/User');
const Cycle = require('../src/models/DailyCycleLog');
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/services/mapStaticImage', () => ({ getSegmentTrailImage: jest.fn().mockResolvedValue(null) }));
const { getRouteHistory, batchSyncTrails } = require('../src/controllers/collector.controller');
const { getRouteHistoryDetail } = require('../src/controllers/admin.controller');
const { makeRouteSnapshot, historicalRoute } = require('../src/services/routeSnapshot');
const chain = data => { const q = {}; for (const key of ['select', 'sort', 'limit', 'populate']) q[key] = jest.fn(() => q); q.lean = async () => data; return q; };
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const driver = new mongoose.Types.ObjectId(), routeId = new mongoose.Types.ObjectId();
const original = { name: 'Area 1', barangay: ['Dinaga'], stops: [{ _id: new mongoose.Types.ObjectId(), name: 'Original stop', order: 1, latitude: 13.6, longitude: 123.2 }], routePath: { type: 'LineString', coordinates: [[123.2, 13.6], [123.21, 13.61]] } };
const reassigned = { ...original, _id: routeId, name: 'Area 11', barangay: ['New area'], stops: [], routePath: { type: 'LineString', coordinates: [[124, 14], [124.1, 14.1]] } };
const session = { _id: new mongoose.Types.ObjectId(), clientSessionId: 'trip-1', collectorId: driver, routeId, routeName: original.name, routeSnapshot: original, startedAt: new Date('2026-11-13T01:00:00Z'), endedAt: new Date('2026-11-13T02:00:00Z'), status: 'completed' };
const points = original.routePath.coordinates.map(([longitude, latitude], i) => ({ clientId: `p${i}`, clientSessionId: session.clientSessionId, collectorId: driver, routeId, longitude, latitude, recordedAt: new Date(+session.startedAt + i * 1000) }));
afterEach(() => jest.restoreAllMocks());

test('snapshot preserves original route, and legacy history never borrows a renamed path', () => {
  expect(historicalRoute(reassigned, session)).toMatchObject(original);
  expect(historicalRoute(reassigned, { ...session, routeSnapshot: undefined })).toMatchObject({ name: 'Area 1', routePath: null, stops: [] });
  expect(makeRouteSnapshot({ ...original, routePath: { type: 'LineString', coordinates: [[0, 200]] } }).routePath).toBeUndefined();
});

test('driver history retains original area, stops and GPS points after route changes', async () => {
  jest.spyOn(Log, 'find').mockReturnValue(chain([]));
  jest.spyOn(Session, 'find').mockReturnValue(chain([session]));
  jest.spyOn(Route, 'find').mockReturnValue(chain([reassigned]));
  jest.spyOn(Point, 'find').mockReturnValue(chain(points));
  const res = response();
  await getRouteHistory({ query: { grouped: true }, user: { _id: driver } }, res);
  const result = res.json.mock.calls[0][0];
  expect(result.success).toBe(true);
  expect(result.data.groups[0]).toMatchObject({ routeName: 'Area 1', barangay: ['Dinaga'], totalStops: 1, routePath: original.routePath, trailPath: original.routePath });
});

test('admin detail and report receive the frozen assigned route with the actual GPS trail', async () => {
  jest.spyOn(Route, 'findById').mockReturnValue(chain(reassigned));
  jest.spyOn(User, 'findById').mockReturnValue(chain({ name: 'Driver' }));
  jest.spyOn(Log, 'find').mockReturnValue(chain([]));
  jest.spyOn(Session, 'find').mockReturnValue(chain([session]));
  jest.spyOn(Point, 'find').mockReturnValue(chain(points));
  jest.spyOn(Cycle, 'find').mockReturnValue(chain([]));
  const res = response();
  await getRouteHistoryDetail({ params: { id: `${driver}|${routeId}|2026-11-13` }, user: { name: 'Admin' } }, res);
  const result = res.json.mock.calls[0][0];
  expect(result.success).toBe(true);
  expect(result.data.route).toMatchObject(original);
  expect(result.data.trail.expectedSegments).toEqual([original.routePath.coordinates]);
  expect(result.data.trail.coveredSegments).toEqual([original.routePath.coordinates]);
});

test('delayed upload still syncs an owned old session after reassignment, without replacing its snapshot', async () => {
  jest.spyOn(Session, 'findOne').mockResolvedValue(session);
  jest.spyOn(Route, 'findOne').mockReturnValue({ select: async () => null });
  const updates = jest.spyOn(Session, 'updateOne').mockResolvedValue({});
  const write = jest.spyOn(Point, 'bulkWrite').mockResolvedValue({});
  jest.spyOn(Point, 'find').mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(points));
  jest.spyOn(Point, 'countDocuments').mockResolvedValue(2);
  const res = response();
  await batchSyncTrails({ user: { _id: driver }, body: { sessions: [{ ...session, routeId: String(routeId), routeSnapshot: reassigned, points }] } }, res);
  expect(res.json.mock.calls[0][0].data.syncedSessionIds).toEqual(['trip-1']);
  expect(write.mock.calls[0][0][0].updateOne.update.$setOnInsert.routeName).toBe('Area 1');
  expect(updates.mock.calls.every(([, update]) => !update.$set.routeSnapshot)).toBe(true);
});

test('another driver cannot attach points or snapshots to an old session', async () => {
  jest.spyOn(Session, 'findOne').mockResolvedValue(session);
  const write = jest.spyOn(Point, 'bulkWrite').mockResolvedValue({});
  const res = response();
  await batchSyncTrails({ user: { _id: new mongoose.Types.ObjectId() }, body: { sessions: [{ ...session, routeId: String(routeId), points }] } }, res);
  expect(res.json.mock.calls[0][0].data.syncedSessionIds).toEqual([]);
  expect(write).not.toHaveBeenCalled();
});
