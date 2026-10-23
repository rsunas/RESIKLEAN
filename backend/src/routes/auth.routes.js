const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');
const { registerRules, loginRules, googleLoginRules, validate } = require('../validators/auth.validator');

// GET /api/auth/areas (public)
router.get('/areas', getPublicAreas);

// GET /api/auth/app-info (public — SWMO contact info, waste guides, app version)
router.get('/app-info', getAppInfo);

// POST /api/auth/register
router.post('/register', registerRules, validate, register);

// POST /api/auth/login
router.post('/login', loginRules, validate, login);

// POST /api/auth/google
router.post('/google', googleLoginRules, validate, googleLogin);

// GET  /api/auth/me  (protected — must send Bearer token)
router.get('/me', protect, getMe);

// PATCH /api/auth/me  (protected — update own profile & optional settings)
router.patch('/me', protect, updateMe);

// DELETE /api/auth/me  (protected — delete account)
router.delete('/me', protect, deleteAccount);

// PATCH /api/auth/change-password  (protected — change password with old password verification)
router.patch('/change-password', protect, changePassword);
router.post('/change-password', protect, changePassword);

// GET /api/auth/settings  (protected — get theme, language, notifications)
router.get('/settings', protect, getSettings);

// PATCH /api/auth/settings  (protected — update theme, language, notifications)
router.patch('/settings', protect, updateSettings);

// DELETE /api/auth/account  (protected — delete account)
router.delete('/account', protect, deleteAccount);

module.exports = router;

