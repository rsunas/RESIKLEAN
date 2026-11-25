jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/models/User', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../src/utils/jwt', () => ({ signToken: jest.fn(() => 'session-token') }));
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerify })) }));
const mockVerify = jest.fn();
const User = require('../src/models/User');
const { signToken } = require('../src/utils/jwt');
const { googleLogin } = require('../src/controllers/auth.controller');

describe('Google signup and login', () => {
  let res, user;
  beforeEach(() => {
    jest.clearAllMocks();
    user = { _id: 'existing-user', email: 'resident@example.com', name: 'Resident', profilePhotoUrl: '', save: jest.fn() };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockVerify.mockResolvedValue({ getPayload: () => ({ email: ' Resident@Example.com ', email_verified: true, name: 'Google Name', picture: 'https://example.com/photo' }) });
  });
  it.each(['google', 'local'])('rejects repeat signup for an existing %s account without modifying it or issuing a session', async authProvider => {
    user.authProvider = authProvider;
    User.findOne.mockResolvedValue(user);
    await googleLogin({ body: { idToken: 'valid', intent: 'signup' } }, res);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'resident@example.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(User.create).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(signToken).not.toHaveBeenCalled();
  });
  it('allows a new Google signup', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(user);
    await googleLogin({ body: { idToken: 'valid', intent: 'signup' } }, res);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'resident@example.com', authProvider: 'google', role: 'resident', isPasswordSet: false }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(signToken).toHaveBeenCalledWith('existing-user', 0);
  });
  it.each([undefined, 'login'])('preserves existing Google login with intent %s', async intent => {
    User.findOne.mockResolvedValue(user);
    await googleLogin({ body: { idToken: 'valid', intent } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.create).not.toHaveBeenCalled();
    expect(signToken).toHaveBeenCalledWith('existing-user', 0);
  });
  it('returns a conflict when simultaneous signups hit the unique email constraint', async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockRejectedValue(Object.assign(new Error('duplicate email'), { code: 11000 }));
    await googleLogin({ body: { idToken: 'valid', intent: 'signup' } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(signToken).not.toHaveBeenCalled();
  });
  it('reuses the existing account when simultaneous first logins race', async () => {
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
    User.create.mockRejectedValue(Object.assign(new Error('duplicate email'), { code: 11000 }));
    await googleLogin({ body: { idToken: 'valid' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(signToken).toHaveBeenCalledWith('existing-user', 0);
  });
  it('rejects unverified email without looking up or creating an account', async () => {
    mockVerify.mockResolvedValue({ getPayload: () => ({ email: 'resident@example.com', email_verified: false }) });
    await googleLogin({ body: { idToken: 'valid', intent: 'signup' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(User.findOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });
  it('rejects an invalid Google token without account writes', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockVerify.mockRejectedValue(new Error('invalid signature'));
    try {
      await googleLogin({ body: { idToken: 'invalid', intent: 'signup' } }, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(User.create).not.toHaveBeenCalled();
      expect(signToken).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
