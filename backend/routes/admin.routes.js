const express = require('express');
const router  = express.Router();

// GET /api/admin/compliance
router.get('/compliance', (req, res) => res.json({ message: 'getComplianceReport — TODO' }));

// GET /api/admin/routes
router.get('/routes', (req, res) => res.json({ message: 'getAllRoutes — TODO' }));

// GET /api/admin/users
router.get('/users', (req, res) => res.json({ message: 'getAllUsers — TODO' }));

module.exports = router;
