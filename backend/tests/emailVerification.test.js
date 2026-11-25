const crypto = require('crypto');
const express = require('express');

jest.mock('../src/models/User', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/services/email-verification-mail.service', () => ({
  verificationMailConfiguration: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

const User = require('../src/models/User');
const { verificationMailConfiguration, sendEmailVerification } = require('../src/services/email-verification-mail.service');
const verificationRoutes = require('../src/routes/email-verification.routes');

let server;
let baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', verificationRoutes);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  verificationMailConfiguration.mockReturnValue({});
  sendEmailVerification.mockResolvedValue(undefined);
});

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test('consumes an admin-created account verification code atomically', async () => {
  const token = 'a'.repeat(64);
  User.findOneAndUpdate.mockResolvedValue({ _id: 'created-account' });

  const { response, body } = await post('/auth/verify-email', { token });

  expect(response.status).toBe(200);
  expect(body.data.message).toMatch(/Email verified successfully/i);
  const [filter, update, options] = User.findOneAndUpdate.mock.calls[0];
  expect(filter.emailVerificationRequired).toBe(true);
  expect(filter.emailVerificationHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  expect(filter.emailVerificationExpires.$gt).toBeInstanceOf(Date);
  expect(update.$set.emailVerifiedAt).toBeInstanceOf(Date);
  expect(update.$unset).toEqual({ emailVerificationHash: 1, emailVerificationExpires: 1, emailVerificationRequestedAt: 1 });
  expect(options).toEqual({ new: false, projection: { _id: 1 } });
});

test('rejects an expired or previously used verification code', async () => {
  User.findOneAndUpdate.mockResolvedValue(null);
  const { response, body } = await post('/auth/verify-email', { token: 'b'.repeat(64) });
  expect(response.status).toBe(400);
  expect(body.error).toMatch(/invalid or expired/i);
});

test('resend response does not disclose whether a pending account exists', async () => {
  const select = jest.fn().mockResolvedValue(null);
  User.findOneAndUpdate.mockReturnValue({ select });

  const { response, body } = await post('/auth/resend-verification', { email: 'unknown@example.test' });
  expect(response.status).toBe(200);
  expect(body.data.message).toMatch(/If a pending account exists/i);
  expect(body.data.message).not.toContain('unknown@example.test');
  expect(sendEmailVerification).not.toHaveBeenCalled();
});

test('resend rotates a pending account code before sending the new invitation', async () => {
  const select = jest.fn().mockResolvedValue({ _id: 'created-account', email: 'person@example.test' });
  User.findOneAndUpdate.mockReturnValue({ select });

  const { response } = await post('/auth/resend-verification', { email: 'person@example.test' });
  expect(response.status).toBe(200);
  const [filter, update] = User.findOneAndUpdate.mock.calls[0];
  expect(filter).toEqual(expect.objectContaining({ email: 'person@example.test', emailVerificationRequired: true }));
  expect(update.$set.emailVerificationHash).toEqual(expect.any(String));
  expect(update.$set.emailVerificationExpires).toBeInstanceOf(Date);
  expect(sendEmailVerification).toHaveBeenCalledWith('person@example.test', expect.stringMatching(/^[a-f0-9]{64}$/));
});
