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
    const user = await User.create({
      name,
      email,
      password,
      role: 'resident',
      barangay,
      location,
      phone,
      home_segment_id,
      authProvider: 'local',
      isPasswordSet: true,
    });
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
        authProvider: 'google',
        isPasswordSet: false,
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
// Allows the logged-in user to update their own profile (name, phone, barangay, location, password, settings).
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
      user.isPasswordSet = true;
      hasUpdates = true;
    }

    if (req.body.settings && typeof req.body.settings === 'object') {
      user.settings = user.settings || {};
      if (req.body.settings.theme !== undefined) {
        if (!['light', 'dark', 'system'].includes(req.body.settings.theme)) {
          return sendError(res, 'Invalid theme option. Allowed: light, dark, system', 400);
        }
        user.settings.theme = req.body.settings.theme;
      }
      if (req.body.settings.language !== undefined) {
        if (!['en', 'fil'].includes(req.body.settings.language)) {
          return sendError(res, 'Invalid language option. Allowed: en, fil', 400);
        }
        user.settings.language = req.body.settings.language;
      }
      if (req.body.settings.notifications && typeof req.body.settings.notifications === 'object') {
        user.settings.notifications = user.settings.notifications || {};
        ['pushEnabled', 'collectionReminders', 'scheduleUpdates', 'announcements', 'reminderMinutesBefore'].forEach((key) => {
          if (req.body.settings.notifications[key] !== undefined) {
            user.settings.notifications[key] = req.body.settings.notifications[key];
          }
        });
        if (req.body.settings.notifications.pushEnabled !== undefined) {
          user.notificationsEnabled = Boolean(req.body.settings.notifications.pushEnabled);
          if (Array.isArray(user.pushTokens)) {
            user.pushTokens.forEach((pt) => {
              pt.isEnabled = Boolean(req.body.settings.notifications.pushEnabled);
            });
          }
        }
      }
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

// ── PATCH /api/auth/change-password ───────────────────────────────────────────
// Allows logged-in users to change their password securely with old password verification.
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return sendError(res, 'New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return sendError(res, 'User not found', 404);

    const requiresCurrentPassword = user.isPasswordSet !== false && user.authProvider !== 'google';

    if (requiresCurrentPassword || currentPassword) {
      if (!currentPassword) {
        return sendError(res, 'Current password is required', 400);
      }
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return sendError(res, 'Current password is incorrect', 400);
      }
    }

    if (currentPassword && currentPassword === newPassword.trim()) {
      return sendError(res, 'New password cannot be the same as current password', 400);
    }

    user.password = newPassword.trim();
    user.isPasswordSet = true;
    await user.save();

    sendSuccess(res, { message: 'Password changed successfully' });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/auth/settings ────────────────────────────────────────────────────
// Returns user settings, display preferences, notification toggles, and account status
const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return sendError(res, 'User not found', 404);

    const defaultSettings = {
      theme: 'system',
      language: 'en',
      notifications: {
        pushEnabled: true,
        collectionReminders: true,
        scheduleUpdates: true,
        announcements: true,
        reminderMinutesBefore: 30,
      },
    };

    const settings = {
      theme: user.settings?.theme || defaultSettings.theme,
      language: user.settings?.language || defaultSettings.language,
      notifications: {
        ...defaultSettings.notifications,
        ...(user.settings?.notifications || {}),
        pushEnabled: user.settings?.notifications?.pushEnabled ?? user.notificationsEnabled ?? true,
      },
    };

    sendSuccess(res, {
      settings,
      notificationsEnabled: settings.notifications.pushEnabled,
      authProvider: user.authProvider || 'local',
      isPasswordSet: user.isPasswordSet ?? true,
      email: user.email,
      name: user.name,
      phone: user.phone || '',
      barangay: user.barangay || '',
      location: user.location || '',
      profilePhotoUrl: user.profilePhotoUrl || '',
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/auth/settings ──────────────────────────────────────────────────
// Allows updating user theme, language, and notification preferences
const updateSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return sendError(res, 'User not found', 404);

    if (!user.settings) {
      user.settings = {
        theme: 'system',
        language: 'en',
        notifications: {
          pushEnabled: true,
          collectionReminders: true,
          scheduleUpdates: true,
          announcements: true,
          reminderMinutesBefore: 30,
        },
      };
    }

    const { theme, language, notifications } = req.body;

    if (theme !== undefined) {
      if (!['light', 'dark', 'system'].includes(theme)) {
        return sendError(res, 'Invalid theme option. Allowed: light, dark, system', 400);
      }
      user.settings.theme = theme;
    }

    if (language !== undefined) {
      if (!['en', 'fil'].includes(language)) {
        return sendError(res, 'Invalid language option. Allowed: en, fil', 400);
      }
      user.settings.language = language;
    }

    if (notifications && typeof notifications === 'object') {
      const allowedNotificationKeys = [
        'pushEnabled',
        'collectionReminders',
        'scheduleUpdates',
        'announcements',
        'reminderMinutesBefore',
      ];

      allowedNotificationKeys.forEach((key) => {
        if (notifications[key] !== undefined) {
          user.settings.notifications[key] = notifications[key];
        }
      });

      if (notifications.pushEnabled !== undefined) {
        user.notificationsEnabled = Boolean(notifications.pushEnabled);
        if (Array.isArray(user.pushTokens)) {
          user.pushTokens.forEach((pt) => {
            pt.isEnabled = Boolean(notifications.pushEnabled);
          });
        }
      }
    }

    await user.save();

    sendSuccess(res, {
      message: 'Settings updated successfully',
      settings: user.settings,
      notificationsEnabled: user.notificationsEnabled,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── DELETE /api/auth/account (or DELETE /api/auth/me) ─────────────────────────
// Permanently deletes the user's account and cleans up references.
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findByIdAndDelete(userId);
    if (!user) return sendError(res, 'User not found', 404);

    // Keep reports intact for municipal records, but mark resident as deleted
    try {
      const MissedReport = require('../models/MissedReport');
      await MissedReport.updateMany(
        { residentId: userId },
        { $set: { isResidentDeleted: true } }
      );
    } catch (e) {
      // Continue even if report association is empty
    }

    sendSuccess(res, { message: 'Account deleted successfully' });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/auth/app-info ────────────────────────────────────────────────────
// Public/resident information for Contact SWMO, Waste Guidelines, FAQs, App Version
const getAppInfo = async (req, res) => {
  try {
    const appInfo = {
      app: {
        name: 'Resiklean',
        version: '1.0.0',
        buildNumber: '1',
        organization: 'Solid Waste Management Office (SWMO) - Naga City',
        city: 'Naga City, Camarines Sur',
      },
      swmoContact: {
        officeName: 'Solid Waste Management Office (SWMO)',
        agency: 'City Government of Naga',
        address: 'City Hall Complex, J. Miranda Ave., Concepcion Pequeña, Naga City, 4400',
        hotlines: ['(054) 881-2550', '(054) 473-8440'],
        mobile: '+63 917 123 4567',
        email: 'swmo@naga.gov.ph',
        officeHours: 'Monday – Friday, 8:00 AM – 5:00 PM',
        emergencyHotlines: ['911', '166', '(054) 472-3000 (CDRRMO)'],
      },
      wasteSegregationGuide: [
        {
          category: 'biodegradable',
          title: 'Biodegradable (Nabubulok)',
          color: '#2e7d32',
          badgeText: 'Kitchen & Organic Waste',
          examples: [
            'Food waste & meal leftovers',
            'Fruit and vegetable peelings & seeds',
            'Eggshells & coffee grounds',
            'Leaves, grass clippings, and garden trimmings',
            'Fish gills, bones, and animal innards',
          ],
          instructions: 'Drain liquids before bagging. Use green bins or biodegradable bags. Put out only on scheduled Biodegradable collection days.',
        },
        {
          category: 'non-biodegradable',
          title: 'Non-Biodegradable (Di-nabubulok / Residuals)',
          color: '#c62828',
          badgeText: 'Residual Waste',
          examples: [
            'Single-use food sachets & snack packaging',
            'Used sanitary napkins & diapers',
            'Worn-out rags, clothes, and damaged footwear',
            'Styrofoam food containers & dirty wrappers',
            'Broken ceramic & porcelain pieces',
          ],
          instructions: 'Ensure waste is dry and tightly bound in heavy-duty garbage bags or sacks. Put out only on Non-Biodegradable collection days.',
        },
        {
          category: 'recyclable',
          title: 'Recyclables (Mareresiklo)',
          color: '#1565c0',
          badgeText: 'Recoverable Materials',
          examples: [
            'Plastic bottles (PET 1, HDPE 2)',
            'Clean cardboard boxes, paper & cartons',
            'Glass beverage bottles & jars',
            'Tin cans, metal caps, and scrap metal',
          ],
          instructions: 'Rinse with water and dry before collection. Can also be surrendered or sold to Barangay MRFs (Materials Recovery Facilities).',
        },
        {
          category: 'special-hazardous',
          title: 'Special & Hazardous Waste (Peligroso)',
          color: '#ef6c00',
          badgeText: 'Handled with Care',
          examples: [
            'Fluorescent tubes, light bulbs',
            'Spent dry-cell & car batteries',
            'Paint cans, solvents, and pesticides',
            'Syringes, medical needles, expired medicines',
            'E-waste (old mobile phones, chargers, wires)',
          ],
          instructions: 'Never mix with ordinary household trash. Store safely in sturdy containers and bring directly to your Barangay MRF or schedule special collection with SWMO.',
        },
      ],
      faqs: [
        {
          q: 'What should I do if the garbage truck missed my street?',
          a: 'You can submit a Missed Collection report directly from the Resiklean app under the "Report" tab with an optional photo of your uncollected waste.',
        },
        {
          q: 'What time does the collection truck arrive?',
          a: 'Day shift collections typically begin at 6:00 AM, while night shift collections begin at 6:00 PM. Check your "Schedule" tab for real-time schedule information.',
        },
        {
          q: 'Can I change my collection location?',
          a: 'Yes, go to your Profile or Settings page and tap "Edit Profile" to update your registered collection location or purok.',
        },
      ],
      legal: {
        privacyPolicyTitle: 'Privacy Policy',
        privacyPolicySummary: 'Resiklean respects your privacy. Location and photo uploads are strictly utilized for waste management dispatch, route optimization, and municipal verification.',
        termsTitle: 'Terms of Service',
        termsSummary: 'By using Resiklean, residents agree to follow City Ordinance No. 2004-048 on proper waste segregation at source.',
      },
    };

    sendSuccess(res, appInfo);
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

module.exports = {
  register,
  login,
  googleLogin,
  getMe,
  updateMe,
  changePassword,
  getSettings,
  updateSettings,
  deleteAccount,
  getAppInfo,
  getPublicAreas,
};
