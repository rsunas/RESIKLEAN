const User = require('../models/User');
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
    const { name, email, password, barangay, phone } = req.body;

    // Prevent duplicate emails
    const existing = await User.findOne({ email });
    if (existing) return sendError(res, 'Email is already registered', 409);

    // Force role to 'resident' for all public signups
    const user = await User.create({ name, email, password, role: 'resident', barangay, phone });
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

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
// Allows the logged-in user to update their own profile (name, phone, barangay).
// Sensitive fields (role, email, password) are explicitly blocked.
const updateMe = async (req, res) => {
  try {
    // Only allow these fields to be updated
    const allowedFields = ['name', 'phone', 'barangay'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return sendError(res, 'No valid fields to update', 400);
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,            // return the updated document
      runValidators: true,  // enforce schema validations
    });

    sendSuccess(res, user);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { register, login, getMe, updateMe };
