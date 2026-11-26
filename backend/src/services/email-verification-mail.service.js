const { emailConfiguration, sendEmail } = require('./email-delivery.service');

function verificationMailConfiguration() {
  const config = emailConfiguration();

  const url = new URL(process.env.VERIFY_EMAIL_URL || 'resiklean://verify-email');
  if (!['https:', 'resiklean:'].includes(url.protocol)) throw new Error('Invalid verification URL');

  return { ...config, url };
}

async function sendEmailVerification(email, token) {
  const { url } = verificationMailConfiguration();
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);

  await sendEmail({
    to: email,
    subject: 'Verify your ResiKlean account',
    text: `Your ResiKlean email verification code is:\n\n${token}\n\nOpen ResiKlean, tap Verify account on the sign-in screen, and enter your email address and this six-digit code. Then sign in with your password.\n\nYou can also open this link:\n${url.toString()}\n\nThis code expires in 10 minutes and can only be used once. Only the most recently sent code works.\n\nIf you were not expecting this account, you can ignore this email.`,
  });
}

module.exports = { verificationMailConfiguration, sendEmailVerification };
