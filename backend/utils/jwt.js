const jwt = require('jsonwebtoken');

/**
 * Sign a JWT for the given user ID.
 * @param {string} id - MongoDB ObjectId
 * @returns {string} signed JWT
 */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/**
 * Verify a JWT and return the decoded payload.
 * Throws if invalid or expired.
 * @param {string} token
 */
const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

module.exports = { signToken, verifyToken };
