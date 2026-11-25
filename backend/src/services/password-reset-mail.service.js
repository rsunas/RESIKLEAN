const { emailConfiguration, sendEmail } = require('./email-delivery.service');

function mailConfiguration() {
  const config = emailConfiguration();
  const url = new URL(process.env.RESET_PASSWORD_URL || 'resiklean://reset-password');
  if (!['https:', 'resiklean:'].includes(url.protocol)) throw new Error('Invalid reset URL');
  return { ...config, url };
}

async function sendPasswordReset(email, token) {
  const { url } = mailConfiguration();
  url.searchParams.set('token', token);
  await sendEmail({
    to: email,
    subject: 'Reset your ResiKlean password',
    text: `Reset your ResiKlean password using this link:\n${url.toString()}\n\nIf your email app cannot open the link, return to ResiKlean, choose Forgot password, then Already have a reset code, and paste this code:\n\n${token}\n\nThis link and code expire in 15 minutes and can only be used once. Only the most recently requested code works.\n\nIf you did not request this, you can ignore this email. Your password has not changed.`,
  });
}

module.exports = { mailConfiguration, sendPasswordReset };
