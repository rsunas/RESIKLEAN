jest.mock('../src/models/User', () => ({ findOne: jest.fn(), create: jest.fn() }));
jest.mock('../src/utils/jwt', () => ({ signToken: jest.fn(() => 'session-token') }));
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));

const User = require('../src/models/User');
const { signToken } = require('../src/utils/jwt');
const { register, login } = require('../src/controllers/auth.controller');

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('local registration and login regression', () => {
  beforeEach(() => jest.clearAllMocks());

  test('registers a local resident and creates a normal session', async () => {
    const user = { _id: 'resident-id', name: 'Resident', email: 'resident@example.test', password: 'hashed' };
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(user);
    const res = response();

    await register({ body: {
      name: 'Resident', email: 'resident@example.test', password: 'password123', barangay: 'Centro',
    } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(User.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'resident', authProvider: 'local', isPasswordSet: true,
    }));
    expect(signToken).toHaveBeenCalledWith('resident-id', 0);
  });

  test('logs a local account in with its existing password', async () => {
    const user = {
      _id: 'resident-id', name: 'Resident', email: 'resident@example.test', password: 'hashed',
      matchPassword: jest.fn().mockResolvedValue(true),
    };
    const select = jest.fn().mockResolvedValue(user);
    User.findOne.mockReturnValue({ select });
    const res = response();

    await login({ body: { email: 'resident@example.test', password: 'password123' } }, res);

    expect(select).toHaveBeenCalledWith('+password');
    expect(user.matchPassword).toHaveBeenCalledWith('password123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(signToken).toHaveBeenCalledWith('resident-id', 0);
  });
});
