const User = require('../models/User');
const Route = require('../models/Route');
const { signToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
    const { name, email, password, barangay, location, phone, home_segment_id } = req.body;

    // Prevent duplicate emails
    const existing = await User.findOne({ email });
    if (existing) return sendError(res, 'Email is already registered', 409);

    // Force role to 'resident' for all public signups
    const user = await User.create({ name, email, password, role: 'resident', barangay, location, phone, home_segment_id });
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

// ── POST /api/auth/google ─────────────────────────────────────────────────────
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    // Verify token with Google (Accepts Web AND Android Client IDs)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID
      ].filter(Boolean), // Safely handles if one is missing in .env
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // Find user by email
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user if they don't exist
      // Generate a random secure password for Google signups
      const randomPassword = crypto.randomBytes(16).toString('hex');

      user = await User.create({
        name,
        email,
        password: randomPassword,
        role: 'resident',
        profilePhotoUrl: picture, // Save Google profile picture
      });
    } else if (!user.profilePhotoUrl && picture) {
      // Optional: Update profile picture if they didn't have one
      user.profilePhotoUrl = picture;
      await user.save();
    }

    tokenResponse(user, 200, res);
  } catch (err) {
    console.error('Google Auth Error:', err);
    sendError(res, 'Invalid Google Token', 401);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  // req.user is already attached by the protect middleware
  sendSuccess(res, req.user);
};

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
// Allows the logged-in user to update their own profile (name, phone, barangay, location, password).
// Sensitive fields like role and email are explicitly blocked.
const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return sendError(res, 'User not found', 404);

    const allowedFields = ['name', 'phone', 'barangay', 'location', 'home_segment_id', 'profilePhotoUrl'];
    let hasUpdates = false;

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
        hasUpdates = true;
      }
    });

    if (req.body.password !== undefined && req.body.password !== '') {
      if (typeof req.body.password !== 'string' || req.body.password.trim().length < 6) {
        return sendError(res, 'Password must be at least 6 characters', 400);
      }
      user.password = req.body.password.trim();
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return sendError(res, 'No valid fields to update', 400);
    }

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;

    sendSuccess(res, { ...userObj, user: userObj });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/auth/areas ───────────────────────────────────────────────────────
// Public endpoint for signup dropdown (fetches active Route segments)
const getPublicAreas = async (req, res) => {
  try {
    const areas = await Route.find({ isActive: true })
      .select('_id barangay name')
      .sort({ barangay: 1, name: 1 })
      .lean();

    sendSuccess(res, { count: areas.length, areas });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { register, login, googleLogin, getMe, updateMe, getPublicAreas };
