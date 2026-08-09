const express = require('express');
const router  = express.Router();

// GET   /api/collector/route
router.get('/route', (req, res) => res.json({ message: 'getAssignedRoute — TODO' }));

// PATCH /api/collector/route/logs/:stopId
router.patch('/route/logs/:stopId', (req, res) => res.json({ message: 'markCollected — TODO' }));

module.exports = router;
