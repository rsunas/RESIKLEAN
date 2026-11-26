const crypto = require('crypto');
jest.mock('../src/models/User', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/services/email-verification-mail.service', () => ({ verificationMailConfiguration: jest.fn(), sendEmailVerification: jest.fn().mockResolvedValue() }));
const User = require('../src/models/User');
const { generateCode, hashCode } = require('../src/utils/email-verification-code');
const { verifyEmail, resendVerification } = require('../src/controllers/email-verification.controller');
const { sendEmailVerification } = require('../src/services/email-verification-mail.service');
const express = require('express');
const routes = require('../src/routes/email-verification.routes');
const email = 'staff@example.test';
const code = '012345';
let record;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-verification-secret';
  record = { _id: 'staff', email, emailVerificationRequired: true, emailVerificationFormat: 'six-digit',
    emailVerificationHash: hashCode(email, code), emailVerificationAttempts: 0,
    emailVerificationRequestedAt: new Date(), emailVerificationExpires: new Date(Date.now() + 600000) };
  // Stateful database stand-in: apply the atomic filters, then the update.
  User.findOneAndUpdate.mockImplementation((filter, update) => {
    const matches = Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return !record.emailVerifiedAt;
      if (value === null) return record[key] == null;
      if (value instanceof Date) return +record[key] === +value;
      if (value && typeof value === 'object') {
        if ('$gt' in value) return record[key] > value.$gt;
        if ('$lt' in value) return record[key] < value.$lt;
        if ('$ne' in value) return record[key] !== value.$ne;
      }
      return record[key] === value;
    });
    if (matches) {
      for (const [key, amount] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + amount;
      Object.assign(record, update.$set);
      for (const key of Object.keys(update.$unset || {})) delete record[key];
    }
    const promise = Promise.resolve(matches ? { ...record } : null);
    promise.select = () => promise;
    return promise;
  });
});
async function verify(token = code, address = email) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await verifyEmail({ body: { token, email: address } }, res);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}
test('generates exactly six digits, including leading zeroes, and binds hashes to email', () => {
  jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(7);
  expect(generateCode()).toBe('000007');
  crypto.randomInt.mockRestore();
  for (let i = 0; i < 100; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  expect(hashCode(email, code)).not.toBe(hashCode('another@example.test', code));
});
test('activates once with a leading-zero code and normalized email', async () => {
  expect((await verify(code, ' STAFF@EXAMPLE.TEST ')).status).toBe(200);
  expect(record.emailVerifiedAt).toBeInstanceOf(Date);
  expect(record.emailVerificationHash).toBeUndefined();
  expect(record.emailVerificationAttempts).toBeUndefined();
  expect((await verify()).status).toBe(400);
});
test('same code cannot activate a different account', async () => {
  expect((await verify(code, 'another@example.test')).status).toBe(400);
  expect(record.emailVerifiedAt).toBeUndefined();
});
test('five wrong guesses exhaust the account limit even with a valid code afterwards', async () => {
  for (let i = 0; i < 5; i++) expect((await verify('999999')).status).toBe(400);
  expect(record.emailVerificationAttempts).toBe(5);
  expect((await verify()).status).toBe(400);
  expect(record.emailVerifiedAt).toBeUndefined();
});
test('the fifth attempt can succeed', async () => {
  for (let i = 0; i < 4; i++) await verify('999999');
  expect((await verify()).status).toBe(200);
});
test('expired codes cannot activate an account', async () => {
  record.emailVerificationExpires = new Date(Date.now() - 1);
  expect((await verify()).status).toBe(400);
  expect(record.emailVerifiedAt).toBeUndefined();
});
test('simultaneous correct submissions only activate once', async () => {
  const results = await Promise.all([verify(), verify()]);
  expect(results.map(result => result.status).sort()).toEqual([200, 400]);
});
test('a resend between validation and consumption invalidates the original request', async () => {
  const pending = { ...record };
  User.findOneAndUpdate.mockImplementationOnce(() => ({ select: async () => {
    record.emailVerificationRequestedAt = new Date(+record.emailVerificationRequestedAt + 1);
    return pending;
  } }));
  expect((await verify()).status).toBe(400);
  expect(record.emailVerifiedAt).toBeUndefined();
});
test('resend replaces legacy codes with a ten-minute code and resets attempts', async () => {
  User.findOneAndUpdate.mockReturnValueOnce({ select: async () => ({ _id: 'staff', email }) });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await resendVerification({ body: { email } }, res);
  const [filter, update] = User.findOneAndUpdate.mock.calls[0];
  const sentCode = sendEmailVerification.mock.calls[0][1];
  expect(sentCode).toMatch(/^\d{6}$/);
  expect(filter.email).toBe(email);
  expect(update.$set.emailVerificationHash).toBe(hashCode(email, sentCode));
  expect(update.$set.emailVerificationAttempts).toBe(0);
  expect(update.$set.emailVerificationExpires - update.$set.emailVerificationRequestedAt).toBe(600000);
});
test('six-digit requests require an email; malformed codes never reach the database', async () => {
  const app = express(); app.use(express.json()); app.use(routes);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    for (const body of [{ token: code }, { token: code, email: 'bad' }, { token: '12345', email }, { token: '1234567', email }]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/verify-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
