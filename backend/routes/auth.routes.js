const express = require('express');
const router  = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => res.json({ message: 'register — TODO' }));

// POST /api/auth/login
router.post('/login', (req, res) => res.json({ message: 'login — TODO' }));

// GET /api/auth/me
router.get('/me', (req, res) => res.json({ message: 'me — TODO' }));

module.exports = router;
