const jwt = require('jsonwebtoken');

/**
 * Sign a JWT for the given user ID.
 * @param {string} id - MongoDB ObjectId
 * @param {number} authVersion - Session version for password-recovery invalidation
 * @returns {string} signed JWT
 */
const signToken = (id, authVersion = 0) =>
  jwt.sign({ id, v: Number(authVersion) || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/**
 * Verify a JWT and return the decoded payload.
 * Throws if invalid or expired.
 * @param {string} token
 */
const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { signToken, verifyToken };
