const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60000;
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (email, code) => crypto.createHmac('sha256', process.env.JWT_SECRET)
  .update(`email-verification:${email.trim().toLowerCase()}:${code}`).digest('hex');

module.exports = { CODE_TTL_MS, generateCode, hashCode };
