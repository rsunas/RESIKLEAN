const express = require('express');
const router = express.Router();
const { register, login, getMe, updateMe, getPublicAreas, googleLogin } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');
const { registerRules, loginRules, googleLoginRules, validate } = require('../validators/auth.validator');

// GET /api/auth/areas (public)
router.get('/areas', getPublicAreas);

// POST /api/auth/register
router.post('/register', registerRules, validate, register);

// POST /api/auth/login
router.post('/login', loginRules, validate, login);

// POST /api/auth/google
router.post('/google', googleLoginRules, validate, googleLogin);

// GET  /api/auth/me  (protected — must send Bearer token)
router.get('/me', protect, getMe);

// PATCH /api/auth/me  (protected — update own profile)
router.patch('/me', protect, updateMe);

module.exports = router;
