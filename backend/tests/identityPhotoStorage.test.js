jest.mock('../src/config/cloudinary', () => ({ uploader: { upload_stream: jest.fn(), destroy: jest.fn() }, utils: { private_download_url: jest.fn() } }));
const cloudinary = require('../src/config/cloudinary');
const { uploadPhoto, deletePhoto, getIdentityPhotoUrl } = require('../src/services/cloudinary.service');
test('ID uploads use authenticated delivery and temporary downloads', async () => {
  const end = jest.fn(); cloudinary.uploader.upload_stream.mockImplementation((options, callback) => { callback(null, { secure_url: 'private', public_id: 'identity/1', format: 'png' }); return { end }; });
  const data = Buffer.from('id'); const photo = await uploadPhoto(data, 'resiklean/identity', { type: 'authenticated' });
  expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith({ folder: 'resiklean/identity', resource_type: 'image', type: 'authenticated' }, expect.any(Function));
  expect(end).toHaveBeenCalledWith(data);
  getIdentityPhotoUrl(photo);
  expect(cloudinary.utils.private_download_url).toHaveBeenCalledWith('identity/1', 'png', expect.objectContaining({ type: 'authenticated', expires_at: expect.any(Number) }));
  const options = cloudinary.utils.private_download_url.mock.calls[0][2]; expect(options.expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThan(115); expect(options.expires_at - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(120);
  await deletePhoto(photo.publicId, { type: 'authenticated' }); expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('identity/1', { type: 'authenticated' });
});
