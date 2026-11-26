const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { mailConfiguration, sendPasswordReset } = require('../services/password-reset-mail.service');
const { disconnectUserSessions } = require('../services/socket.service');
const { sendSuccess, sendError } = require('../utils/response');
const { emailDeliveryError } = require('../utils/email-delivery-error');

const message = 'If an account exists for that email, you will receive password reset instructions. Check your inbox and spam folder.';
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const hashCode = (email, code) => crypto.createHmac('sha256', process.env.JWT_SECRET)
  .update(`password-reset:${email}:${code}`).digest('hex');
const invalidCode = 'This reset link or code is invalid, expired, or has reached its attempt limit. Please request a new one.';

async function forgotPassword(req, res) {
  try { mailConfiguration(); } catch {
    return sendError(res, 'Password recovery is temporarily unavailable. Please try again later.', 503);
  }
  try {
    // Older installed apps only accept the original 64-character tokens.
    const shortCode = req.body.codeFormat === 'six-digit';
    const email = req.body.email.trim().toLowerCase();
    const token = shortCode ? String(crypto.randomInt(0, 1000000)).padStart(6, '0') : crypto.randomBytes(32).toString('hex');
    const hash = shortCode ? hashCode(email, token) : hashToken(token);
    const now = Date.now();
    // Atomic cooldown also protects against simultaneous requests and multiple servers.
    const user = await User.findOneAndUpdate({
      email,
      // Public/legacy accounts do not require verification. A dashboard-created
      // account must first prove it controls the inbox before reset delivery is
      // available.
      $and: [
        { $or: [{ passwordResetRequestedAt: { $exists: false } },
          { passwordResetRequestedAt: { $lte: new Date(now - 60000) } }] },
        { $or: [
          { emailVerificationRequired: { $ne: true } },
          { emailVerifiedAt: { $type: 'date' } },
        ] },
      ],
    }, { $set: {
      passwordResetHash: hash,
      passwordResetExpires: new Date(now + 15 * 60000),
      passwordResetRequestedAt: new Date(now),
      passwordResetFormat: shortCode ? 'six-digit' : 'legacy',
      passwordResetAttempts: 0,
    } }, { new: true }).select('email');
    if (user) {
      // Delivery latency must not reveal whether this address belongs to an account.
      void sendPasswordReset(user.email, token).catch(async error => {
        console.error('Password reset email delivery failed', JSON.stringify(emailDeliveryError(error)));
        // Do not erase a newer request, expose account existence, or log tokens/credentials.
        await User.updateOne({ _id: user._id, passwordResetHash: hash, passwordResetRequestedAt: new Date(now) }, {
          $unset: { passwordResetHash: 1, passwordResetExpires: 1, passwordResetFormat: 1, passwordResetAttempts: 1 },
        });
      }).catch(() => console.error('Password reset email cleanup failed'));
    }
    return sendSuccess(res, { message });
  } catch {
    return sendError(res, 'Password recovery is temporarily unavailable. Please try again later.', 503);
  }
}

async function resetPassword(req, res) {
  try {
    let filter;
    if (/^\d{6}$/.test(req.body.token)) {
      const email = req.body.email.trim().toLowerCase();
      // Reserve one of five attempts atomically, including wrong guesses. This
      // persists across server restarts and cannot be bypassed by switching IPs.
      const pending = await User.findOneAndUpdate({
        email,
        passwordResetFormat: 'six-digit',
        passwordResetExpires: { $gt: new Date() },
        passwordResetAttempts: { $lt: 5 },
      }, { $inc: { passwordResetAttempts: 1 } }, { new: true })
        .select('+passwordResetHash +passwordResetRequestedAt');
      const hash = hashCode(email, req.body.token);
      if (!pending || typeof pending.passwordResetHash !== 'string'
        || pending.passwordResetHash.length !== hash.length
        || !crypto.timingSafeEqual(Buffer.from(pending.passwordResetHash), Buffer.from(hash))) {
        return sendError(res, invalidCode, 400);
      }
      filter = {
        _id: pending._id,
        passwordResetHash: hash,
        passwordResetFormat: 'six-digit',
        passwordResetRequestedAt: pending.passwordResetRequestedAt,
        passwordResetExpires: { $gt: new Date() },
      };
    } else {
      filter = {
        passwordResetHash: hashToken(req.body.token),
        passwordResetFormat: { $ne: 'six-digit' },
        passwordResetExpires: { $gt: new Date() },
      };
    }
    // updateOne bypasses save hooks: hash explicitly before the atomic token consumption.
    const password = await bcrypt.hash(req.body.password, 12);
    // Check expiry again after hashing, and consume only this exact request.
    filter.passwordResetExpires = { $gt: new Date() };
    const user = await User.findOneAndUpdate(filter, {
      $set: { password, isPasswordSet: true },
      $inc: { authVersion: 1 },
      $unset: { passwordResetHash: 1, passwordResetExpires: 1, passwordResetFormat: 1, passwordResetAttempts: 1 },
    }, { new: false, projection: { _id: 1 } });
    if (!user) {
      return sendError(res, 'This reset link or code is invalid or expired. Please request a new one.', 400);
    }
    try {
      disconnectUserSessions(user._id);
    } catch {
      console.error('Password reset socket cleanup failed');
    }
    return sendSuccess(res, { message: 'Password reset successfully. Sign in with your new password.' });
  } catch {
    return sendError(res, 'Unable to reset your password. Please try again later.', 503);
  }
}

module.exports = { forgotPassword, resetPassword };
