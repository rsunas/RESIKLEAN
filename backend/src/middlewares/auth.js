const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifies the JWT in the Authorization header and attaches req.user.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    // Tokens from before this field existed are version 0. A successful recovery
    // increments the user's version, invalidating every older browser/app session.
    if (Number(decoded.v || 0) !== Number(req.user.authVersion || 0)) {
      return res.status(401).json({ success: false, error: 'Not authorized, session expired' });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Not authorized, invalid token' });
  }
};

module.exports = { protect };
