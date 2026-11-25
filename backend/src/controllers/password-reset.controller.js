const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { mailConfiguration, sendPasswordReset } = require('../services/password-reset-mail.service');
const { disconnectUserSessions } = require('../services/socket.service');
const { sendSuccess, sendError } = require('../utils/response');

const message = 'If an account exists for that email, you will receive password reset instructions. Check your inbox and spam folder.';
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function forgotPassword(req, res) {
  try { mailConfiguration(); } catch {
    return sendError(res, 'Password recovery is temporarily unavailable. Please try again later.', 503);
  }
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = hashToken(token);
    const now = Date.now();
    // Atomic cooldown also protects against simultaneous requests and multiple servers.
    const user = await User.findOneAndUpdate({
      email: req.body.email.trim().toLowerCase(),
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
    } }, { new: true }).select('email');
    if (user) {
      // SMTP latency must not reveal whether this address belongs to an account.
      void sendPasswordReset(user.email, token).catch(async () => {
        // Do not erase a newer request, expose account existence, or log tokens/credentials.
        await User.updateOne({ _id: user._id, passwordResetHash: hash }, {
          $unset: { passwordResetHash: 1, passwordResetExpires: 1 },
        });
        console.error('Password reset email delivery failed');
      }).catch(() => console.error('Password reset email cleanup failed'));
    }
    return sendSuccess(res, { message });
  } catch {
    return sendError(res, 'Password recovery is temporarily unavailable. Please try again later.', 503);
  }
}

async function resetPassword(req, res) {
  try {
    // updateOne bypasses save hooks: hash explicitly before the atomic token consumption.
    const password = await bcrypt.hash(req.body.password, 12);
    const user = await User.findOneAndUpdate({
      passwordResetHash: hashToken(req.body.token),
      passwordResetExpires: { $gt: new Date() },
    }, {
      $set: { password, isPasswordSet: true },
      $inc: { authVersion: 1 },
      $unset: { passwordResetHash: 1, passwordResetExpires: 1 },
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
