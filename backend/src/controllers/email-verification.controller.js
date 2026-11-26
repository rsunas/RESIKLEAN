const crypto = require('crypto');
const User = require('../models/User');
const { CODE_TTL_MS, generateCode, hashCode } = require('../utils/email-verification-code');
const { verificationMailConfiguration, sendEmailVerification } = require('../services/email-verification-mail.service');
const { sendSuccess, sendError } = require('../utils/response');

const RESEND_MESSAGE = 'If a pending account exists for that email, a verification email has been sent. Check the inbox and spam folder.';
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const invalidCode = 'This verification link or code is invalid, expired, or has reached its attempt limit. Please request a new one.';

async function verifyEmail(req, res) {
  try {
    let codeFilter;
    if (/^\d{6}$/.test(req.body.token)) {
      const email = req.body.email.trim().toLowerCase();
      // Reserve every guess atomically across devices and API instances.
      const pending = await User.findOneAndUpdate({
        email, emailVerificationRequired: true, emailVerifiedAt: null,
        emailVerificationFormat: 'six-digit',
        emailVerificationExpires: { $gt: new Date() },
        emailVerificationAttempts: { $lt: 5 },
      }, { $inc: { emailVerificationAttempts: 1 } }, { new: true })
        .select('+emailVerificationHash +emailVerificationRequestedAt');
      const hash = hashCode(email, req.body.token);
      if (!pending || typeof pending.emailVerificationHash !== 'string'
        || pending.emailVerificationHash.length !== hash.length
        || !crypto.timingSafeEqual(Buffer.from(pending.emailVerificationHash), Buffer.from(hash))) {
        return sendError(res, invalidCode, 400);
      }
      codeFilter = {
        _id: pending._id, email,
        emailVerificationHash: hash,
        emailVerificationFormat: 'six-digit',
        emailVerificationRequestedAt: pending.emailVerificationRequestedAt,
      };
    } else {
      // Previously delivered activation links remain usable until they expire.
      codeFilter = { emailVerificationHash: hashToken(req.body.token), emailVerificationFormat: { $ne: 'six-digit' } };
    }
    // Consume only this request, once; a concurrent resend invalidates it.
    const user = await User.findOneAndUpdate({
      ...codeFilter,
      emailVerificationRequired: true,
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
        emailVerificationFormat: 1,
        emailVerificationAttempts: 1,
      },
    }, { new: false, projection: { _id: 1 } });

    if (!user) {
      return sendError(res, invalidCode, 400);
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
    const token = generateCode();
    const email = req.body.email.trim().toLowerCase();
    const hash = hashCode(email, token);
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
        emailVerificationExpires: new Date(now + CODE_TTL_MS),
        emailVerificationRequestedAt: new Date(now),
        emailVerificationFormat: 'six-digit',
        emailVerificationAttempts: 0,
      },
    }, { new: true }).select('email');

    if (user) {
      // Do not expose whether the account exists. If delivery fails, remove only
      // this code so the user can safely request another one.
      void sendEmailVerification(user.email, token).catch(async () => {
        await User.updateOne({ _id: user._id, emailVerificationHash: hash, emailVerificationRequestedAt: new Date(now) }, {
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
