const crypto = require('crypto');
const User = require('../models/User');
const { verificationMailConfiguration, sendEmailVerification } = require('../services/email-verification-mail.service');
const { sendSuccess, sendError } = require('../utils/response');

const RESEND_MESSAGE = 'If a pending account exists for that email, a verification email has been sent. Check the inbox and spam folder.';
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

async function verifyEmail(req, res) {
  try {
    // findOneAndUpdate consumes the code atomically, so two simultaneous taps
    // cannot both activate the same account.
    const user = await User.findOneAndUpdate({
      emailVerificationRequired: true,
      emailVerificationHash: hashToken(req.body.token),
      emailVerificationExpires: { $gt: new Date() },
      $or: [
        { emailVerifiedAt: { $exists: false } },
        { emailVerifiedAt: null },
      ],
    }, {
      $set: { emailVerifiedAt: new Date() },
      $unset: {
        emailVerificationHash: 1,
        emailVerificationExpires: 1,
        emailVerificationRequestedAt: 1,
      },
    }, { new: false, projection: { _id: 1 } });

    if (!user) {
      return sendError(res, 'This verification link or code is invalid or expired. Please request a new one.', 400);
    }

    return sendSuccess(res, {
      message: 'Email verified successfully. You can now sign in and use password recovery.',
    });
  } catch {
    return sendError(res, 'Unable to verify your email. Please try again later.', 503);
  }
}

async function resendVerification(req, res) {
  try {
    verificationMailConfiguration();
  } catch {
    return sendError(res, 'Email verification is temporarily unavailable. Please try again later.', 503);
  }

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = hashToken(token);
    const now = Date.now();

    // The database-level cooldown prevents concurrent resend requests from
    // creating several active codes when the API is deployed on multiple nodes.
    const user = await User.findOneAndUpdate({
      email: req.body.email.trim().toLowerCase(),
      emailVerificationRequired: true,
      $and: [
        { $or: [
          { emailVerifiedAt: { $exists: false } },
          { emailVerifiedAt: null },
        ] },
        { $or: [
          { emailVerificationRequestedAt: { $exists: false } },
          { emailVerificationRequestedAt: { $lte: new Date(now - 60000) } },
        ] },
      ],
    }, {
      $set: {
        emailVerificationHash: hash,
        emailVerificationExpires: new Date(now + 24 * 60 * 60000),
        emailVerificationRequestedAt: new Date(now),
      },
    }, { new: true }).select('email');

    if (user) {
      // Do not expose whether the account exists. If delivery fails, remove only
      // this code so the user can safely request another one.
      void sendEmailVerification(user.email, token).catch(async () => {
        await User.updateOne({ _id: user._id, emailVerificationHash: hash }, {
          $unset: {
            emailVerificationHash: 1,
            emailVerificationExpires: 1,
          },
        });
        console.error('Email verification delivery failed');
      }).catch(() => console.error('Email verification cleanup failed'));
    }

    return sendSuccess(res, { message: RESEND_MESSAGE });
  } catch {
    return sendError(res, 'Email verification is temporarily unavailable. Please try again later.', 503);
  }
}

module.exports = { verifyEmail, resendVerification, RESEND_MESSAGE };
