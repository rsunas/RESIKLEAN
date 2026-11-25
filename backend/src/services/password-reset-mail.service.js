const nodemailer = require('nodemailer');

function mailConfiguration() {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('Password reset email is not configured');
  const url = new URL(process.env.RESET_PASSWORD_URL || 'resiklean://reset-password');
  if (!['https:', 'resiklean:'].includes(url.protocol)) throw new Error('Invalid reset URL');
  return { SMTP_USER, SMTP_PASS, url };
}

async function sendPasswordReset(email, token) {
  const { SMTP_USER, SMTP_PASS, url } = mailConfiguration();
  url.searchParams.set('token', token);
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: port === 465, requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || SMTP_USER, to: email,
    subject: 'Reset your ResiKlean password',
    text: `Reset your ResiKlean password using this link:\n${url.toString()}\n\nIf your email app cannot open the link, return to ResiKlean, choose Forgot password, then Already have a reset code, and paste this code:\n\n${token}\n\nThis link and code expire in 15 minutes and can only be used once. Only the most recently requested code works.\n\nIf you did not request this, you can ignore this email. Your password has not changed.`,
  });
}

module.exports = { mailConfiguration, sendPasswordReset };
