// Isolated API checks: no database, Cloudinary account or resident push traffic.
const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Announcement = require('../src/models/Announcement');
const Route = require('../src/models/Route');
const Truck = require('../src/models/Truck');
const User = require('../src/models/User');
const cloud = require('../src/services/cloudinary.service');
const push = require('../src/services/notification.service');
const socket = require('../src/services/socket.service');
const auth = require('../src/middlewares/auth');
const ADMIN = '000000000000000000000001', AREA = '000000000000000000000002', TRUCK = '000000000000000000000003';
let records, uploaded, deletedImages, notifications, socketEvents, uploadFailure, writeFailure, deleteFailure, residents, lastFilter;
const query = value => ({ populate() { return this; }, select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, lean() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
mock.method(auth, 'protect', (req, res, next) => {
  const role = req.headers.authorization?.replace('Bearer ', '');
  if (!role) return res.status(401).json({ success: false });
  req.user = { _id: ADMIN, role, barangay: 'Abella', home_segment_id: AREA }; next();
});
mock.method(cloud, 'uploadPhoto', async () => { if (uploadFailure) throw Error('Upload failed'); uploaded++; return { url: `https://example.test/image-${uploaded}.jpg`, publicId: `test-${uploaded}` }; });
mock.method(cloud, 'deletePhoto', async id => { if (deleteFailure) throw Error('Delete failed'); deletedImages.push(id); });
mock.method(push, 'sendPushNotifications', async messages => notifications.push(...messages));
mock.method(socket, 'emitToResidents', (...args) => socketEvents.push(args));
mock.method(Route, 'findOne', async () => ({ _id: AREA, name: 'Area 4 Collection Route', barangay: ['Abella'] }));
mock.method(Truck, 'exists', async () => ({ _id: TRUCK }));
mock.method(User, 'find', filter => { lastFilter = filter; return query(residents); });
mock.method(Announcement, 'findOne', filter => query([...records.values()].find(item => item.requestKey === filter.requestKey) || null));
mock.method(Announcement, 'findById', id => query(records.get(id) || null));
mock.method(Announcement, 'create', async value => {
  if (writeFailure) throw Error('Write failed');
  const item = { ...value, _id: '000000000000000000000004', __v: 0, async populate() { return this; }, set(data) { Object.assign(this, data); }, async save() { if (writeFailure) throw Error('Write failed'); this.__v++; }, async deleteOne() { records.delete(this._id); } };
  records.set(item._id, item); return item;
});
mock.method(Announcement, 'findOneAndUpdate', async filter => {
  const item = records.get(filter._id);
  if (item.notifiedAt) return null;
  item.notifiedAt = new Date(); return item;
});
mock.method(Announcement, 'find', filter => { lastFilter = filter; return query([...records.values()]); });
mock.method(Announcement, 'countDocuments', async () => records.size);
const routes = require('../src/routes/announcement.routes');
const controller = require('../src/controllers/announcement.controller');
let server, base, shared;
before(async () => {
  shared = await import('../src/shared/announcements.mjs');
  const app = express(); app.use(express.json());
  app.use('/admin', routes.admin); app.use('/resident', routes.resident);
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => {
  records = new Map(); uploaded = 0; deletedImages = []; notifications = []; socketEvents = [];
  uploadFailure = false; writeFailure = false; deleteFailure = false;
  residents = [{ _id: ADMIN, pushTokens: [{ token: 'enabled' }, { token: 'disabled', isEnabled: false }] }, { _id: AREA, settings: { notifications: { announcements: false } }, pushTokens: [{ token: 'opted-out' }] }];
});
const payload = overrides => ({ type: 'Service delay', reason: 'Flat tire', impact: 'Delays may occur', areaId: AREA, affectedTruckId: TRUCK, date: '2026-11-18', time: '13:00', message: 'Collection may be delayed.', status: 'draft', requestKey: 'announcement-test-key-0001', ...overrides });
async function call(path, { method = 'GET', body, role = 'admin' } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(role ? { Authorization: `Bearer ${role}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, ...(await response.json()) };
}
function multipart(data, bytes = [255, 216, 255, 217], type = 'image/jpeg') {
  const form = new FormData(); Object.entries(data).forEach(([key, value]) => form.set(key, String(value)));
  form.set('image', new Blob([new Uint8Array(bytes)], { type }), 'test.jpg'); return form;
}
test('Manila defaults roll forward at midnight and reject impossible dates', () => {
  assert.deepEqual(shared.nextHour(new Date('2026-11-18T15:31:00Z')), { date: '2026-11-19', time: '00:00' });
  assert.equal(shared.scheduledDate('2026-11-18', '13:00').toISOString(), '2026-11-18T05:00:00.000Z');
  assert.throws(() => shared.scheduledDate('2026-02-30', '13:00'));
  assert.throws(() => shared.scheduledDate('2026-11-18', '24:00'));
});
test('templates cover every type and impact without revealing trucks', () => {
  for (const type of shared.types) for (const impact of shared.impacts) {
    const message = shared.generateMessage({ ...payload(), areaLabel: 'Area 4 Collection Route', newDate: '2026-11-20', type, impact, affectedTruck: 'SECRET TRUCK' }, new Date('2026-11-18T01:00:00Z'));
    assert(message.includes('Area 4 Collection Route')); assert(message.includes('today')); assert(!message.includes('SECRET')); assert(!message.includes('undefined')); assert(message.length <= 500);
  }
});
test('admin writes require authentication and the admin role', async () => {
  assert.equal((await call('/admin', { method: 'POST', body: payload(), role: '' })).status, 401);
  assert.equal((await call('/admin', { method: 'POST', body: payload(), role: 'resident' })).status, 403);
  assert.equal((await call('/resident', { role: 'collector' })).status, 403);
});
test('drafts save without images, strip HTML, validate fields, dates and length', async () => {
  const result = await call('/admin', { method: 'POST', body: payload({ message: '<b>Hello</b>' }) });
  assert.equal(result.status, 201); assert.equal(result.data.message, 'Hello'); assert.equal(uploaded, 0);
  for (const bad of [{ reason: '' }, { type: 'x'.repeat(81) }, { impact: { text: 'bad' } }, { reason: '<b>Reason</b>' }, { status: 'unknown' }, { areaId: 'bad' }, { message: 'x'.repeat(501) }, { date: '2026-02-30' }, { impact: 'Rescheduled', newDate: '' }]) {
    assert.equal((await call('/admin', { method: 'POST', body: payload({ ...bad, requestKey: 'another-request-0001' }) })).status, 400);
  }
});
test('custom announcement details persist and appear in generated messages', async () => {
  const details = { type: 'Collection update', reason: 'Truck maintenance', impact: 'Expect a two-hour delay' };
  const result = await call('/admin', { method: 'POST', body: payload(details) });
  assert.equal(result.status, 201);
  for (const [key, value] of Object.entries(details)) assert.equal(result.data[key], value);
  const text = shared.generateMessage({ ...payload(), ...details });
  for (const value of Object.values(details)) assert(text.includes(value));
  assert(!text.includes('undefined'));
});
test('publishing requires message and valid image; upload limits are enforced', async () => {
  assert.equal((await call('/admin', { method: 'POST', body: payload({ status: 'published' }) })).status, 400);
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published', message: '' })) })).status, 400);
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload(), [1, 2, 3]) })).status, 400);
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload(), [1, 2, 3], 'image/gif') })).status, 400);
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload(), new Uint8Array(2 * 1024 * 1024 + 1)) })).status, 400);
});
test('publish stores image, targets residents and respects notification preferences', async () => {
  const result = await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) });
  assert.equal(result.status, 201); assert.equal(result.data.imageUrl, 'https://example.test/image-1.jpg');
  assert.equal(result.data.scheduledFor, '2026-11-18T05:00:00.000Z');
  assert.equal(lastFilter.role, 'resident'); assert.equal(lastFilter.$or[0].home_segment_id, AREA);
  assert.deepEqual(notifications.map(message => message.to), ['enabled']);
  assert.equal(socketEvents[0][0], 'announcement:new');
  const publicData = socketEvents[0][2];
  for (const field of ['affectedTruckId', 'createdBy', 'imagePublicId', 'audienceBarangays', 'requestKey']) assert.equal(publicData[field], undefined);
});
test('repeated requests and republishing do not duplicate records or notifications', async () => {
  const body = () => multipart(payload({ status: 'published' }));
  const created = await call('/admin', { method: 'POST', body: body() });
  await call('/admin', { method: 'POST', body: body() });
  assert.equal(records.size, 1); assert.equal(uploaded, 1); assert.equal(notifications.length, 1);
  const draft = await call(`/admin/${created.data._id}`, { method: 'PATCH', body: { status: 'draft', version: 0 } });
  assert.equal(draft.data.status, 'draft');
  const republished = await call(`/admin/${created.data._id}`, { method: 'PATCH', body: { status: 'published', version: 1 } });
  assert.equal(republished.status, 200); assert.equal(notifications.length, 1);
});
test('edits require a current version and fresh image when published details change', async () => {
  const created = await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) });
  const path = `/admin/${created.data._id}`;
  assert.equal((await call(path, { method: 'PATCH', body: { reason: 'Accident', version: 99 } })).status, 409);
  assert.equal((await call(path, { method: 'PATCH', body: { reason: 'Accident', version: 0 } })).status, 400);
  const updated = await call(path, { method: 'PATCH', body: multipart({ reason: 'Accident', version: 0 }) });
  assert.equal(updated.data.reason, 'Accident'); assert.deepEqual(deletedImages, ['test-1']); assert.equal(notifications.length, 1);
});
test('failed uploads and DB writes do not leave orphaned new images', async () => {
  uploadFailure = true;
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) })).status, 500);
  assert.equal(records.size, 0);
  uploadFailure = false; writeFailure = true;
  assert.equal((await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) })).status, 500);
  assert.deepEqual(deletedImages, ['test-1']); assert.equal(records.size, 0);
});
test('resident feed filters to published matching areas and returns only public fields', async () => {
  await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) });
  const result = await call('/resident?page=1&limit=10', { role: 'resident' });
  assert.equal(lastFilter.status, 'published'); assert(lastFilter.$or.some(clause => clause.areaId === null));
  assert.deepEqual(result.data.items[0], JSON.parse(JSON.stringify(controller.publicItem([...records.values()][0]))));
});
test('delete removes image and record; failed image deletion leaves a retryable record', async () => {
  const created = await call('/admin', { method: 'POST', body: multipart(payload({ status: 'published' })) });
  deleteFailure = true;
  assert.equal((await call(`/admin/${created.data._id}`, { method: 'DELETE' })).status, 500); assert.equal(records.size, 1);
  deleteFailure = false;
  assert.equal((await call(`/admin/${created.data._id}`, { method: 'DELETE' })).status, 200); assert.equal(records.size, 0); assert.deepEqual(deletedImages, ['test-1']);
});
