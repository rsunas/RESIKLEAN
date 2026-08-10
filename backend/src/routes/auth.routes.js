const express  = require('express');
const router   = express.Router();
const { register, login, getMe } = require('../controllers/auth.controller');
const { protect }                 = require('../middlewares/auth');
const { registerRules, loginRules, validate } = require('../validators/auth.validator');

// POST /api/auth/register
router.post('/register', registerRules, validate, register);

// POST /api/auth/login
router.post('/login', loginRules, validate, login);

// GET  /api/auth/me  (protected — must send Bearer token)
router.get('/me', protect, getMe);

module.exports = router;
