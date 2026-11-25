const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { OAuth2Client } = require('google-auth-library');

function emailConfiguration() {
  const provider = process.env.MAIL_PROVIDER || 'smtp';
  if (provider === 'gmail-api') {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER } = process.env;
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_SENDER) {
      throw new Error('Gmail API email is not configured');
    }
    return { provider, from: process.env.MAIL_FROM || GMAIL_SENDER };
  }
  if (provider !== 'smtp') throw new Error('Unsupported email provider');
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP email is not configured');
  return { provider, SMTP_USER, SMTP_PASS, from: process.env.MAIL_FROM || SMTP_USER };
}

async function sendEmail(message) {
  const config = emailConfiguration();
  const mail = { ...message, from: config.from };
  if (config.provider === 'gmail-api') {
    // HTTPS works on Render Free, where Gmail's SMTP ports are blocked.
    // These credentials belong to the sender, independently of user Google login.
    const client = new OAuth2Client({
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      transporterOptions: { timeout: 15000, retry: false },
    });
    client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const mime = await new MailComposer(mail).compile().build();
    await client.request({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: mime.toString('base64url') },
      timeout: 15000,
      retry: false,
    });
    return;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: port === 465, requireTLS: port !== 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  await transport.sendMail(mail);
}

module.exports = { emailConfiguration, sendEmail };