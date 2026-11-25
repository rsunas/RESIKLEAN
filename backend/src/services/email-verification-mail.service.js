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

  await sendEmail({
    to: email,
    subject: 'Verify your ResiKlean account',
    text: `Verify the email address for your ResiKlean account using this link:\n${url.toString()}\n\nIf your email app cannot open the link, return to ResiKlean, choose Verify account, and paste this code:\n\n${token}\n\nThis link and code expire in 24 hours and can only be used once. Only the most recently sent code works.\n\nIf you were not expecting this account, you can ignore this email.`,
  });
}

module.exports = { verificationMailConfiguration, sendEmailVerification };
