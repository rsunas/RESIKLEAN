const nodemailer = require('nodemailer');

function verificationMailConfiguration() {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('Email verification is not configured');

  const url = new URL(process.env.VERIFY_EMAIL_URL || 'resiklean://verify-email');
  if (!['https:', 'resiklean:'].includes(url.protocol)) throw new Error('Invalid verification URL');

  return { SMTP_USER, SMTP_PASS, url };
}

async function sendEmailVerification(email, token) {
  const { SMTP_USER, SMTP_PASS, url } = verificationMailConfiguration();
  url.searchParams.set('token', token);

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  await transport.sendMail({
    from: process.env.MAIL_FROM || SMTP_USER,
    to: email,
    subject: 'Verify your ResiKlean account',
    text: `Verify the email address for your ResiKlean account using this link:\n${url.toString()}\n\nIf your email app cannot open the link, return to ResiKlean, choose Verify account, and paste this code:\n\n${token}\n\nThis link and code expire in 24 hours and can only be used once. Only the most recently sent code works.\n\nIf you were not expecting this account, you can ignore this email.`,
  });
}

module.exports = { verificationMailConfiguration, sendEmailVerification };
