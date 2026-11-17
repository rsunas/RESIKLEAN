const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Report = require('../src/models/MissedReport');
const Message = require('../src/models/ReportMessage');
const Load = require('../src/models/TruckLoad');
const Read = require('../src/models/AdminNotificationRead');
const Route = require('../src/models/Route');
const Log = require('../src/models/RouteLog');
const Session = require('../src/models/RouteTrailSession');
const Cycle = require('../src/models/DailyCycleLog');
const { buildFeedPipeline, listNotifications } = require('../src/services/adminNotifications');
const { completeRoute } = require('../src/controllers/collector.controller');
const adminId = new mongoose.Types.ObjectId();
const id = new mongoose.Types.ObjectId();
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
afterEach(() => jest.restoreAllMocks());

test('feed restricts replies to residents, finish notices to explicit completion, and read status to this admin', () => {
  const pipeline = buildFeedPipeline(adminId, { type: 'route', unread: true, page: 2, limit: 10 });
  const unions = pipeline.filter(step => step.$unionWith).map(step => step.$unionWith);
  expect(unions.find(source => source.coll === Message.collection.name).pipeline[0]).toEqual({ $match: { senderRole: 'resident' } });
  expect(unions.find(source => source.coll === Session.collection.name).pipeline[0]).toEqual({ $match: { routeCompletedAt: { $type: 'date' } } });
  const receipt = pipeline.find(step => step.$lookup).$lookup;
  expect(String(receipt.pipeline[0].$match.adminId)).toBe(String(adminId));
  const facets = pipeline.at(-1).$facet;
  expect(facets.items[0]).toEqual({ $match: { type: 'route', read: false } });
  expect(facets.items).toContainEqual({ $skip: 10 });
  expect(facets.items).toContainEqual({ $limit: 10 });
  expect(facets.unread).toEqual([{ $match: { read: false } }, { $count: 'count' }]);
});

test('formats all four categories and uses unique saved stop records against the finish-time stop snapshot', async () => {
  const date = new Date('2026-11-17T04:00:00Z');
  const rows = [
    { id: 'complaint:1', type: 'complaint', actorId: adminId, date, area: 'Dinaga' },
    { id: 'reply:2', type: 'reply', actorId: adminId, date, subject: 'Still waiting' },
    { id: 'truckload:3', type: 'truckload', actorId: adminId, date, tonnes: 3.24, plate: 'SEA-2342' },
    { id: 'route:4', type: 'route', actorId: adminId, routeId: id, eventDate: '2026-11-17', routeName: 'Route A', stopIds: [id, adminId], date },
  ];
  jest.spyOn(Report, 'aggregate').mockReturnValue({ option: async () => [{ items: rows, total: [{ count: 4 }], unread: [{ count: 3 }] }] });
  jest.spyOn(User, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ _id: adminId, name: 'Peter Parker' }] }) });
  const distinct = jest.spyOn(Log, 'distinct').mockResolvedValue([id]);
  const result = await listNotifications(adminId, { page: 1, limit: 10 });
  expect(result.items.map(item => item.title)).toEqual(['New complaint', 'Resident replied', 'New truckload submission', 'Route collection finished']);
  expect(result.items[2].description).toContain('3.24 t');
  expect(result.items[3]).toMatchObject({ remaining: 1, targetId: `${adminId}|${id}|2026-11-17` });
  expect(result.items[3].description).toContain('1 of 2');
  expect(distinct).toHaveBeenCalledWith('stopId', expect.objectContaining({ stopId: { $in: [id, adminId] }, status: 'collected', eventDate: '2026-11-17' }));
  expect(result.unread).toBe(3);
});

test('Finish route records a first-write-only timestamp and active stop snapshot', async () => {
  const session = { _id: id, save: jest.fn().mockResolvedValue() };
  jest.spyOn(Session, 'findOne').mockReturnValue({ sort: async () => session });
  jest.spyOn(Cycle, 'updateMany').mockResolvedValue({});
  jest.spyOn(Route, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ stops: [{ _id: id }, { _id: adminId, isArchived: true }] }) }) });
  const update = jest.spyOn(Session, 'updateOne').mockResolvedValue({});
  const res = response();
  await completeRoute({ user: { _id: adminId }, body: { routeId: String(id) } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(update).toHaveBeenCalledWith({ _id: id, routeCompletedAt: null }, { $set: { routeCompletedAt: expect.any(Date), completionStopIds: [id] } });
});

describe('admin notification endpoints', () => {
  let server, base;
  beforeAll(async () => {
    process.env.JWT_SECRET = 'notification-test-only';
    const app = express(); app.use(express.json()); app.use('/admin', require('../src/routes/admin.routes'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}/admin/notifications`;
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const auth = role => {
    jest.spyOn(User, 'findById').mockReturnValue({ select: async () => ({ _id: adminId, role }) });
    return { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' };
  };
  test('requires authentication and admin role for list, read, and target', async () => {
    expect((await fetch(base)).status).toBe(401);
    const headers = auth('collector');
    expect((await fetch(base, { headers })).status).toBe(403);
    expect((await fetch(base + '/read', { method: 'POST', headers, body: JSON.stringify({ ids: [`complaint:${id}`] }) })).status).toBe(403);
    expect((await fetch(base + `/complaint:${id}/target`, { headers })).status).toBe(403);
  });
  test('rejects malformed filters and read identifiers before querying', async () => {
    const headers = auth('admin');
    for (const query of ['?type=invalid', '?page=0', '?limit=999', '?unread=anything']) expect((await fetch(base + query, { headers })).status).toBe(400);
    expect((await fetch(base + '/read', { method: 'POST', headers, body: JSON.stringify({ ids: ['bad'] }) })).status).toBe(400);
  });
  test('stores idempotent receipts under authenticated admin, never changes report status', async () => {
    const headers = auth('admin');
    const bulk = jest.spyOn(Read, 'bulkWrite').mockResolvedValue({});
    const reportUpdate = jest.spyOn(Report, 'findByIdAndUpdate');
    const eventId = `complaint:${id}`;
    expect((await fetch(base + '/read', { method: 'POST', headers, body: JSON.stringify({ ids: [eventId, eventId], adminId: String(id) }) })).status).toBe(200);
    expect(bulk.mock.calls[0][0]).toHaveLength(1);
    expect(bulk.mock.calls[0][0][0].updateOne.filter).toEqual({ adminId, eventId });
    expect(reportUpdate).not.toHaveBeenCalled();
  });
  test('failed saves are visible and missing targets return 404', async () => {
    const headers = auth('admin');
    jest.spyOn(Read, 'bulkWrite').mockRejectedValue(Error('offline'));
    const result = await fetch(base + '/read', { method: 'POST', headers, body: JSON.stringify({ ids: [`reply:${id}`] }) });
    expect(result.status).toBe(500);
    expect((await result.json()).error).toContain('retry');
    jest.spyOn(Message, 'findOne').mockReturnValue({ lean: async () => null });
    expect((await fetch(base + `/reply:${id}/target`, { headers })).status).toBe(404);
  });
  test('truckload target returns raw dimensions for the existing detail dialog', async () => {
    const headers = auth('admin');
    const query = { populate: () => query, lean: async () => ({ _id: id, length: 3.8, width: 2.2, height: 1.2 }) };
    jest.spyOn(Load, 'findById').mockReturnValue(query);
    const result = await fetch(base + `/truckload:${id}/target`, { headers });
    expect((await result.json()).data.record.length).toBe(3.8);
  });
});
