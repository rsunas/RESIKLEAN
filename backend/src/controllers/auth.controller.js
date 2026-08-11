const User          = require('../models/User');
const { signToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

// ── Helper: sign token and send response ──────────────────────────────────────
const tokenResponse = (user, statusCode, res) => {
  const token = signToken(user._id);

  // Strip password from response (already select:false, but just in case)
  user.password = undefined;

  sendSuccess(res, { token, user }, statusCode);
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, email, password, role, barangay } = req.body;

    // Prevent duplicate emails
    const existing = await User.findOne({ email });
    if (existing) return sendError(res, 'Email is already registered', 409);

    const user = await User.create({ name, email, password, role, barangay });
    tokenResponse(user, 201, res);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Explicitly select password (select:false by default)
    const user = await User.findOne({ email }).select('+password');
    if (!user) return sendError(res, 'Invalid email or password', 401);

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return sendError(res, 'Invalid email or password', 401);

    tokenResponse(user, 200, res);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  // req.user is already attached by the protect middleware
  sendSuccess(res, req.user);
};

module.exports = { register, login, getMe };
