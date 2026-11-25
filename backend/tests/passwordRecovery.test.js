const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../src/models/User', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../src/services/password-reset-mail.service', () => ({
  mailConfiguration: jest.fn(),
  sendPasswordReset: jest.fn(),
}));
jest.mock('../src/services/socket.service', () => ({
  disconnectUserSessions: jest.fn(),
}));

const User = require('../src/models/User');
const { mailConfiguration, sendPasswordReset } = require('../src/services/password-reset-mail.service');
const { disconnectUserSessions } = require('../src/services/socket.service');
const passwordResetRoutes = require('../src/routes/password-reset.routes');
const { protect } = require('../src/middlewares/auth');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', passwordResetRoutes);
  app.get('/secure', protect, (req, res) => res.json({ success: true }));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  mailConfiguration.mockReturnValue({});
  sendPasswordReset.mockResolvedValue(undefined);
});

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
};

describe('password recovery routes', () => {
  test('returns the same generic success response for an unknown email', async () => {
    const select = jest.fn().mockResolvedValue(null);
    User.findOneAndUpdate.mockReturnValue({ select });

    const { response, body } = await post('/auth/forgot-password', {
      email: 'unknown@example.test',
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        message: 'If an account exists for that email, you will receive password reset instructions. Check your inbox and spam folder.',
      },
    });
    expect(body.data.message).not.toContain('unknown@example.test');
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'unknown@example.test' }),
      expect.objectContaining({
        $set: expect.objectContaining({
          passwordResetHash: expect.any(String),
          passwordResetExpires: expect.any(Date),
          passwordResetRequestedAt: expect.any(Date),
        }),
      }),
      { new: true },
    );
    expect(select).toHaveBeenCalledWith('email');
    expect(sendPasswordReset).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test('hashes, consumes, and replaces the password for a valid reset code', async () => {
    const token = 'a'.repeat(64);
    const password = 'new resident password';
    User.findOneAndUpdate.mockResolvedValue({ _id: 'resident-id' });

    const { response, body } = await post('/auth/reset-password', { token, password });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { message: 'Password reset successfully. Sign in with your new password.' },
    });
    expect(User.findOneAndUpdate).toHaveBeenCalledTimes(1);

    const [filter, update, options] = User.findOneAndUpdate.mock.calls[0];
    expect(filter.passwordResetHash).toBe(
      crypto.createHash('sha256').update(token).digest('hex'),
    );
    expect(filter.passwordResetExpires.$gt).toBeInstanceOf(Date);
    expect(update.$set.isPasswordSet).toBe(true);
    expect(update.$inc).toEqual({ authVersion: 1 });
    expect(await bcrypt.compare(password, update.$set.password)).toBe(true);
    expect(update.$unset).toEqual({ passwordResetHash: 1, passwordResetExpires: 1 });
    expect(options).toEqual({ new: false, projection: { _id: 1 } });
    expect(disconnectUserSessions).toHaveBeenCalledWith('resident-id');
    expect(User.create).not.toHaveBeenCalled();
  });

  test.each([
    ['expired'],
    ['already used'],
  ])('rejects an %s reset code without changing an account', async label => {
    User.findOneAndUpdate.mockResolvedValue(null);

    const { response, body } = await post('/auth/reset-password', {
      token: label === 'expired' ? 'b'.repeat(64) : 'c'.repeat(64),
      password: 'another valid password',
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'This reset link or code is invalid or expired. Please request a new one.',
    });
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ passwordResetExpires: { $gt: expect.any(Date) } }),
      expect.any(Object),
      { new: false, projection: { _id: 1 } },
    );
    expect(disconnectUserSessions).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test('invalidates a session issued before recovery while accepting the next sign-in session', async () => {
    process.env.JWT_SECRET = 'password-recovery-test-secret';
    const user = { _id: 'resident-id', authVersion: 1 };
    const select = jest.fn().mockResolvedValue(user);
    User.findById.mockReturnValue({ select });
    const oldToken = jwt.sign({ id: user._id, v: 0 }, process.env.JWT_SECRET);
    const oldResponse = await fetch(`${baseUrl}/secure`, { headers: { Authorization: `Bearer ${oldToken}` } });
    expect(oldResponse.status).toBe(401);
    expect((await oldResponse.json()).error).toMatch(/session expired/i);

    const newToken = jwt.sign({ id: user._id, v: 1 }, process.env.JWT_SECRET);
    const newResponse = await fetch(`${baseUrl}/secure`, { headers: { Authorization: `Bearer ${newToken}` } });
    expect(newResponse.status).toBe(200);
    expect(select).toHaveBeenCalledWith('-password');
  });
});
