const mockRequest = jest.fn();
const mockCredentials = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({
  setCredentials: mockCredentials, request: mockRequest,
})) }));
const nodemailer = require('nodemailer');
const { emailConfiguration, sendEmail } = require('../src/services/email-delivery.service');
const { sendPasswordReset, mailConfiguration } = require('../src/services/password-reset-mail.service');
const { sendEmailVerification, verificationMailConfiguration } = require('../src/services/email-verification-mail.service');
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  for (const key of ['MAIL_PROVIDER', 'MAIL_FROM', 'SMTP_USER', 'SMTP_PASS', 'SMTP_HOST', 'SMTP_PORT', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SENDER', 'RESET_PASSWORD_URL', 'VERIFY_EMAIL_URL']) delete process.env[key];
  mockRequest.mockResolvedValue({ data: { id: 'message-id' } });
});
afterEach(() => { process.env = originalEnv; jest.restoreAllMocks(); });
function gmail() {
  Object.assign(process.env, { MAIL_PROVIDER:'gmail-api', GMAIL_CLIENT_ID:'sender-client', GMAIL_CLIENT_SECRET:'fixture-secret', GMAIL_REFRESH_TOKEN:'fixture-refresh', GMAIL_SENDER:'sender@example.com' });
}

test('requires complete configuration and rejects unsupported providers', () => {
  expect(emailConfiguration).toThrow();
  process.env.MAIL_PROVIDER = 'unknown';
  expect(emailConfiguration).toThrow('Unsupported');
  gmail(); delete process.env.GMAIL_REFRESH_TOKEN;
  expect(emailConfiguration).toThrow('not configured');
});
test('Gmail API configuration works without SMTP credentials for both mail flows', () => {
  gmail();
  expect(mailConfiguration().provider).toBe('gmail-api');
  expect(verificationMailConfiguration().provider).toBe('gmail-api');
});
test('sends MIME mail over HTTPS using the sender refresh token', async () => {
  gmail();
  const smtp = jest.spyOn(nodemailer, 'createTransport');
  await sendPasswordReset('resident@example.com', 'test-reset-code');
  expect(smtp).not.toHaveBeenCalled();
  expect(mockCredentials).toHaveBeenCalledWith({ refresh_token:'fixture-refresh' });
  const request = mockRequest.mock.calls[0][0];
  expect(request).toMatchObject({url:'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',method:'POST',timeout:15000,retry:false});
  expect(request.data.raw).toMatch(/^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(request.data.raw, 'base64url').toString();
  expect(mime).toContain('To: resident@example.com');
  expect(mime).toContain('From: sender@example.com');
  expect(mime).toContain('Subject: Reset your ResiKlean password');
  expect(mime).toContain('test-reset-code');
  expect(mime).not.toContain('fixture-refresh');
});
test('verification email uses the same HTTPS sender', async () => {
  gmail();
  await sendEmailVerification('staff@example.com', 'verification-code');
  const mime = Buffer.from(mockRequest.mock.calls[0][0].data.raw, 'base64url').toString();
  expect(mime).toContain('Subject: Verify your ResiKlean account');
  expect(mime).toContain('verification-code');
});
test('delivery errors propagate for controller cleanup without SMTP fallback', async () => {
  gmail();
  mockRequest.mockRejectedValue(new Error('sender authorization expired'));
  const smtp = jest.spyOn(nodemailer, 'createTransport');
  await expect(sendEmail({to:'resident@example.com',subject:'Test',text:'Test'})).rejects.toThrow('sender authorization expired');
  expect(smtp).not.toHaveBeenCalled();
});
test('retains existing SMTP delivery when no provider is specified', async () => {
  Object.assign(process.env, {SMTP_USER:'sender@example.com', SMTP_PASS:'fixture-password'});
  const sendMail = jest.fn().mockResolvedValue({});
  const smtp = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({sendMail});
  await sendEmail({to:'resident@example.com',subject:'Test',text:'Test'});
  expect(smtp).toHaveBeenCalledWith(expect.objectContaining({host:'smtp.gmail.com',port:587,secure:false,requireTLS:true}));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({from:'sender@example.com',to:'resident@example.com'}));
  expect(mockRequest).not.toHaveBeenCalled();
});
test('retains reset and verification link validation', () => {
  gmail();
  process.env.RESET_PASSWORD_URL = 'http://insecure.example.com';
  process.env.VERIFY_EMAIL_URL = 'javascript:alert(1)';
  expect(mailConfiguration).toThrow('Invalid reset URL');
  expect(verificationMailConfiguration).toThrow('Invalid verification URL');
});