const express = require('express');
const router  = express.Router();

// GET  /api/resident/schedule
router.get('/schedule', (req, res) => res.json({ message: 'getSchedule — TODO' }));

// GET  /api/resident/reports
router.get('/reports', (req, res) => res.json({ message: 'getMyReports — TODO' }));

// POST /api/resident/reports
router.post('/reports', (req, res) => res.json({ message: 'submitReport — TODO' }));

module.exports = router;
