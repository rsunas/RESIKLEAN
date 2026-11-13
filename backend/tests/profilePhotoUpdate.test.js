jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
const User = require('../src/models/User');
const { uploadPhoto } = require('../src/services/cloudinary.service');
const { updateMe } = require('../src/controllers/auth.controller');

describe('Profile photo persistence', () => {
  let user, res;
  beforeEach(() => {
    jest.clearAllMocks();
    user = { name: 'Resident', profilePhotoUrl: 'https://images/old.jpg', save: jest.fn().mockResolvedValue(), toObject() { return { name: this.name, profilePhotoUrl: this.profilePhotoUrl, password: 'secret' }; } };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });
  it('uploads the avatar and returns the saved URL without a password', async () => {
    uploadPhoto.mockResolvedValue({ url: 'https://images/new.jpg' });
    const buffer = Buffer.from('photo');
    await updateMe({ user: { _id: 'resident' }, body: { name: 'Updated' }, file: { buffer } }, res);
    expect(uploadPhoto).toHaveBeenCalledWith(buffer, 'resiklean/profiles');
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].data).toMatchObject({ name: 'Updated', profilePhotoUrl: 'https://images/new.jpg' });
    expect(res.json.mock.calls[0][0].data.password).toBeUndefined();
  });
  it('preserves the existing photo for JSON profile edits', async () => {
    await updateMe({ user: { _id: 'resident' }, body: { name: 'Updated' } }, res);
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(user.profilePhotoUrl).toBe('https://images/old.jpg');
    expect(user.save).toHaveBeenCalledTimes(1);
  });
  it('does not save a partial update when upload fails', async () => {
    uploadPhoto.mockRejectedValue(new Error('Upload unavailable'));
    await updateMe({ user: { _id: 'resident' }, body: { name: 'Updated' }, file: { buffer: Buffer.from('photo') } }, res);
    expect(user.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Upload unavailable' });
  });
  it.each(['collector', 'staff'])('syncs %s work contact without changing assigned area or role', async role => {
    user.role = role; user.barangay = 'Assigned area'; user.assignedRouteId = 'route-1';
    await updateMe({ user: { _id: 'worker' }, body: { phone: '09123456789', location: 'Abella', role: 'admin', assignedRouteId: 'other' } }, res);
    expect(user.contact).toBe('09123456789');
    expect(user.phone).toBe('09123456789');
    expect(user.location).toBe('Abella');
    expect(user.barangay).toBe('Assigned area');
    expect(user.role).toBe(role);
    expect(user.assignedRouteId).toBe('route-1');
  });
  it('removes a saved profile photo without uploading', async () => {
    await updateMe({ user: { _id: 'worker' }, body: { profilePhotoUrl: '' } }, res);
    expect(user.profilePhotoUrl).toBe(''); expect(uploadPhoto).not.toHaveBeenCalled();
  });

});
