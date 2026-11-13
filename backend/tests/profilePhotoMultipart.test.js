jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/middlewares/auth', () => ({ protect: (req, res, next) => { req.user = { _id: 'self' }; next(); } }));
const express = require('express');
const User = require('../src/models/User');
const { uploadPhoto } = require('../src/services/cloudinary.service');
const router = require('../src/routes/auth.routes');
const { errorHandler } = require('../src/middlewares/errorHandler');
let server, url, user;
beforeAll(async () => {
  const app = express();
  app.use(express.json()); app.use('/auth', router); app.use(errorHandler);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}/auth/me`;
});
afterAll(async () => { await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  jest.clearAllMocks();
  user = { _id: 'self', role: 'collector', name: 'Driver', profilePhotoUrl: 'https://images/old.jpg',
    save: jest.fn().mockResolvedValue(), toObject() { return { name: this.name, phone: this.phone, location: this.location, profilePhotoUrl: this.profilePhotoUrl, password: 'secret' }; } };
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  uploadPhoto.mockResolvedValue({ url: 'https://images/new.jpg' });
});
function photoForm(type = 'image/jpeg', size = 100) {
  const form = new FormData();
  form.append('name', 'Updated'); form.append('phone', '09123456789'); form.append('location', 'Abella');
  form.append('avatar', new Blob([new Uint8Array(size)], { type }), 'profile.jpg');
  return form;
}
it.each(['resident', 'collector', 'staff'])('parses a real multipart PATCH for %s and saves its avatar', async role => {
  user.role = role;
  const response = await fetch(url, { method: 'PATCH', body: photoForm() });
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(uploadPhoto).toHaveBeenCalledWith(expect.any(Buffer), 'resiklean/profiles');
  expect(user.save).toHaveBeenCalledTimes(1);
  expect(result.data).toMatchObject({ name: 'Updated', phone: '09123456789', location: 'Abella', profilePhotoUrl: 'https://images/new.jpg' });
  expect(result.data.password).toBeUndefined();
});
it('accepts a photo-only update', async () => {
  const form = photoForm(); ['name', 'phone', 'location'].forEach(key => form.delete(key));
  const response = await fetch(url, { method: 'PATCH', body: form });
  expect(response.status).toBe(200); expect(user.save).toHaveBeenCalledTimes(1);
});
it.each([['text/plain', 100], ['image/jpeg', 5 * 1024 * 1024 + 1]])('rejects invalid or oversized uploads before saving', async (type, size) => {
  const response = await fetch(url, { method: 'PATCH', body: photoForm(type, size) });
  expect(response.ok).toBe(false); await response.json();
  expect(uploadPhoto).not.toHaveBeenCalled(); expect(user.save).not.toHaveBeenCalled();
});
it('reports upload failure without saving partial fields', async () => {
  uploadPhoto.mockRejectedValue(new Error('Upload unavailable'));
  const response = await fetch(url, { method: 'PATCH', body: photoForm() });
  expect(response.status).toBe(500); expect((await response.json()).error).toBe('Upload unavailable');
  expect(user.save).not.toHaveBeenCalled();
});
it('still accepts JSON edits and photo removal', async () => {
  const response = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Updated', profilePhotoUrl: '' }) });
  expect(response.status).toBe(200); expect((await response.json()).data.profilePhotoUrl).toBe('');
  expect(uploadPhoto).not.toHaveBeenCalled();
});
