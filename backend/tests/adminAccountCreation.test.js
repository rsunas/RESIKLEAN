jest.mock('../src/models/DailyCycleLog', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/User', () => ({ findOne: jest.fn(), findById: jest.fn(), create: jest.fn(), find: jest.fn(), deleteOne: jest.fn() }));
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn(), deletePhoto: jest.fn(), getIdentityPhotoUrl: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ sendUserPush: jest.fn() }));
jest.mock('../src/services/email-verification-mail.service', () => ({ verificationMailConfiguration: jest.fn(), sendEmailVerification: jest.fn() }));
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const DailyCycleLog = require('../src/models/DailyCycleLog');
const photos = require('../src/services/cloudinary.service');
const { verificationMailConfiguration, sendEmailVerification } = require('../src/services/email-verification-mail.service');
const adminRouter = require('../src/routes/admin.routes');
const { login } = require('../src/controllers/auth.controller');
const { errorHandler } = require('../src/middlewares/errorHandler');
const { isValidBirthday } = require('../src/utils/birthday');
const id = '507f1f77bcf86cd799439011';
const seedId = '507f1f77bcf86cd799439012';
let server, base, created;
const token = (userId = seedId) => jwt.sign({ id: userId }, process.env.JWT_SECRET);
const valid = { name: 'New Admin', email: 'admin@example.test', password: 'testing123', role: 'admin' };
beforeAll(async () => {
  process.env.JWT_SECRET = 'local-account-test-secret';
  const app = express(); app.use(express.json()); app.post('/login', login); app.use('/admin', adminRouter); app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  jest.clearAllMocks(); created = null;
  verificationMailConfiguration.mockReturnValue({});
  sendEmailVerification.mockResolvedValue(undefined);
  DailyCycleLog.findOne.mockReturnValue({ sort: () => ({ populate: () => ({ lean: async () => null }) }) });
  User.findOne.mockImplementation(() => ({ then: resolve => resolve(null), select: async () => created }));
  User.create.mockImplementation(async fields => {
    const hashed = await bcrypt.hash(fields.password, 4);
    created = { ...fields, _id: id, password: hashed, matchPassword: plain => bcrypt.compare(plain, hashed), toObject() { return { ...fields, _id: id, password: hashed }; } };
    return created;
  });
  User.findById.mockImplementation(userId => ({ select: () => {
    const user = userId === seedId ? { _id: seedId, role: 'admin' } : userId === id ? created : { _id: userId, role: 'staff' };
    const promise = Promise.resolve(user); promise.lean = () => Promise.resolve(user); return promise;
  } }));
  photos.uploadPhoto.mockImplementation(async (_, folder) => ({ publicId: folder + '/test', url: 'https://photos.test/avatar.jpg', format: 'jpg' }));
  photos.getIdentityPhotoUrl.mockReturnValue('https://photos.test/temporary-private-id');
});
const post = (body, auth = token()) => fetch(base + '/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
function form(extra = {}) {
  const data = new FormData(); for (const [key, value] of Object.entries({ ...valid, ...extra })) data.append(key, value); return data;
}
const upload = data => fetch(base + '/admin/users', { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: data });
test('new Admin receives a verification invitation before it can log in', async () => {
  const response = await post(valid); expect(response.status).toBe(201);
  const payload = await response.json(); expect(payload.data.role).toBe('admin'); expect(payload.data.password).toBeUndefined();
  expect(payload.data.emailVerificationPending).toBe(true);
  expect(created.emailVerificationRequired).toBe(true);
  expect(created.emailVerificationHash).toEqual(expect.any(String));
  expect(sendEmailVerification).toHaveBeenCalledWith(valid.email, expect.stringMatching(/^\d{6}$/));
  const loggedIn = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: valid.email, password: valid.password }) });
  expect(loggedIn.status).toBe(403);
  expect((await loggedIn.json()).code).toBe('EMAIL_VERIFICATION_REQUIRED');
  expect(payload.data.emailVerificationAttempts).toBeUndefined();
  expect(payload.data.emailVerificationFormat).toBeUndefined();
  expect(created.emailVerificationExpires - created.emailVerificationRequestedAt).toBe(10 * 60000);
  created.emailVerifiedAt = new Date();
  const verifiedLogin = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: valid.email, password: valid.password }) });
  const session = await verifiedLogin.json(); expect(verifiedLogin.status).toBe(200); expect(session.data.user.role).toBe('admin');
  const details = await fetch(base + `/admin/users/${id}/identity`, { headers: { Authorization: `Bearer ${session.data.token}` } });
  expect(details.status).toBe(200); expect(details.headers.get('cache-control')).toBe('no-store');
});
test.each(['collector', 'staff'])('still creates %s without birthday or files', async role => {
  expect((await post({ ...valid, role })).status).toBe(201); expect(created.birthday).toBeUndefined();
});
test('unauthenticated and staff cannot create admins or read IDs', async () => {
  expect((await post(valid, '')).status).toBe(401);
  const staff = token('507f1f77bcf86cd799439099');
  expect((await post(valid, staff)).status).toBe(403);
  expect((await fetch(base + `/admin/users/${id}/identity`, { headers: { Authorization: `Bearer ${staff}` } })).status).toBe(403);
  expect(User.create).not.toHaveBeenCalled(); expect(photos.getIdentityPhotoUrl).not.toHaveBeenCalled();
});
test('birthday and separate ID persist; create response does not disclose them', async () => {
  const data = form({ birthday: '2000-02-29' });
  data.append('avatar', new Blob(['avatar'], { type: 'image/jpeg' }), 'avatar.jpg');
  data.append('idPhoto', new Blob(['identity'], { type: 'image/jpeg' }), 'id.jpg');
  const response = await upload(data); expect(response.status).toBe(201); const body = await response.json();
  expect(created.birthday).toBe('2000-02-29'); expect(created.identityPhoto.publicId).toBe('resiklean/identity/test');
  expect(photos.uploadPhoto).toHaveBeenCalledWith(expect.any(Buffer), 'resiklean/identity', { type: 'authenticated' });
  expect(body.data.identityPhoto).toBeUndefined(); expect(body.data.birthday).toBeUndefined();
  const details = await fetch(base + `/admin/users/${id}/identity`, { headers: { Authorization: `Bearer ${token()}` } });
  expect((await details.json()).data).toEqual({ birthday: '2000-02-29', hasIdPhoto: true, assignedTruck: null });
  expect(photos.getIdentityPhotoUrl).not.toHaveBeenCalled();
  const revealed = await fetch(base + `/admin/users/${id}/identity?reveal=true`, { headers: { Authorization: `Bearer ${token()}` } });
  expect(revealed.headers.get('cache-control')).toBe('no-store');
  expect((await revealed.json()).data).toEqual({ idPhotoUrl: 'https://photos.test/temporary-private-id' });
  expect(photos.getIdentityPhotoUrl).toHaveBeenCalledTimes(1);
});
test.each(['2001-02-29', '2999-01-01', '1899-12-31', '11/13/2000'])('rejects invalid birthday %s before upload', async birthday => {
  expect((await post({ ...valid, birthday })).status).toBe(400); expect(User.create).not.toHaveBeenCalled(); expect(photos.uploadPhoto).not.toHaveBeenCalled();
});
test.each(['resident', 'superadmin'])('rejects unsupported role %s', async role => { expect((await post({ ...valid, role })).status).toBe(400); });
test('duplicate email detected after normalization', async () => {
  User.findOne.mockResolvedValue({ _id: 'exists' });
  expect((await post({ ...valid, email: ' ADMIN@EXAMPLE.TEST ' })).status).toBe(400);
  expect(User.findOne).toHaveBeenCalledWith({ email: 'admin@example.test' }); expect(User.create).not.toHaveBeenCalled();
});
test.each([['image/jpeg', 5 * 1024 * 1024 + 1], ['text/plain', 10]])('rejects invalid ID upload %s/%s', async (type, size) => {
  const data = form(); data.append('idPhoto', new Blob([new Uint8Array(size)], { type }), 'id.jpg');
  expect((await upload(data)).ok).toBe(false); expect(User.create).not.toHaveBeenCalled(); expect(photos.uploadPhoto).not.toHaveBeenCalled();
});
test('failed ID upload does not create account and cleans up avatar', async () => {
  photos.uploadPhoto.mockResolvedValueOnce({ publicId: 'avatar-id', url: 'https://photos.test/avatar.jpg' }).mockRejectedValueOnce(new Error('Upload failed'));
  const data = form(); for (const field of ['avatar', 'idPhoto']) data.append(field, new Blob(['test'], { type: 'image/jpeg' }), 'test.jpg');
  expect((await upload(data)).status).toBe(500); expect(User.create).not.toHaveBeenCalled(); expect(photos.deletePhoto).toHaveBeenCalledWith('avatar-id', { type: 'upload' });
});
test('DB failure cleans up authenticated ID', async () => {
  User.create.mockRejectedValueOnce(new Error('Database unavailable'));
  const data = form(); data.append('idPhoto', new Blob(['test'], { type: 'image/jpeg' }), 'id.jpg');
  expect((await upload(data)).status).toBe(500);
  expect(photos.deletePhoto).toHaveBeenCalledWith('resiklean/identity/test', { type: 'authenticated' });
});
test('identity and birthday excluded by default on real model', () => {
  const model = jest.requireActual('../src/models/User');
  expect(model.schema.path('identityPhoto').options.select).toBe(false);
  expect(model.schema.path('birthday').options.select).toBe(false);
  expect(isValidBirthday('2000-02-29')).toBe(true);
});

test('missing ID does not generate a link and active truck is included in metadata', async () => {
  await post({ ...valid, employeeId: 'PRIVATE-123' });
  const truck = { truckNumber: '36', plateNumber: 'ZF-9449' };
  DailyCycleLog.findOne.mockReturnValue({ sort: () => ({ populate: () => ({ lean: async () => ({ truckId: truck }) }) }) });
  const result = await fetch(base + `/admin/users/${id}/identity`, { headers: { Authorization: `Bearer ${token()}` } });
  expect((await result.json()).data).toEqual({ birthday: null, hasIdPhoto: false, assignedTruck: truck });
  expect(DailyCycleLog.findOne).toHaveBeenCalledWith({ driverId: id, shiftStatus: 'active' });
  const reveal = await fetch(base + `/admin/users/${id}/identity?reveal=true`, { headers: { Authorization: `Bearer ${token()}` } });
  expect((await reveal.json()).data.idPhotoUrl).toBeNull();
  expect(photos.getIdentityPhotoUrl).not.toHaveBeenCalled();
});

test('employee ID is excluded from account creation and list responses', async () => {
  const response = await post({ ...valid, employeeId: 'PRIVATE-123' });
  expect((await response.json()).data.employeeId).toBeUndefined();
  const select = jest.fn(() => ({ sort: () => ({ lean: async () => [] }) }));
  User.find.mockReturnValue({ select });
  await fetch(base + '/admin/users', { headers: { Authorization: `Bearer ${token()}` } });
  expect(select.mock.calls[0][0]).not.toContain('employeeId');
});
