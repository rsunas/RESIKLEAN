const { emailConfiguration, sendEmail } = require('./email-delivery.service');

function mailConfiguration() {
  const config = emailConfiguration();
  const url = new URL(process.env.RESET_PASSWORD_URL || 'resiklean://reset-password');
  if (!['https:', 'resiklean:'].includes(url.protocol)) throw new Error('Invalid reset URL');
  return { ...config, url };
}

async function sendPasswordReset(email, token) {
  const { url } = mailConfiguration();
  if (/^\d{6}$/.test(token)) {
    await sendEmail({
      to: email,
      subject: 'Reset your ResiKlean password',
      text: `Your ResiKlean password reset code is:\n\n${token}\n\nEnter this code with your email address on the Reset password screen.\n\nExpires in 15 minutes. Use the newest code. You have 5 attempts.\n\nDo not share this code. If you did not request it, ignore this email. Your password has not changed.`,
      html: `<div style="font-family:Arial,sans-serif;color:#17382b;max-width:480px;margin:auto;padding:24px"><h2>Reset your ResiKlean password</h2><p>Your password reset code is:</p><p style="font-size:36px;font-weight:bold;letter-spacing:6px">${token}</p><p>Enter this code with your email address on the Reset password screen.</p><p>Expires in 15 minutes. Use the newest code. You have 5 attempts.</p><p>Do not share this code. If you did not request it, ignore this email. Your password has not changed.</p></div>`,
    });
    return;
  }
  url.searchParams.set('token', token);
  await sendEmail({
    to: email,
    subject: 'Reset your ResiKlean password',
    text: `Reset your ResiKlean password using this link:\n${url.toString()}\n\nIf your email app cannot open the link, return to ResiKlean, choose Forgot password, then Already have a reset code, and paste this code:\n\n${token}\n\nThis link and code expire in 15 minutes and can only be used once. Only the most recently requested code works.\n\nIf you did not request this, you can ignore this email. Your password has not changed.`,
  });
}

module.exports = { mailConfiguration, sendPasswordReset };
