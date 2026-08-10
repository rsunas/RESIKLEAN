const express   = require('express');
const router    = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');

// All collector routes require a valid JWT + collector role
router.use(protect, authorize('collector'));

// GET   /api/collector/route
router.get('/route', (req, res) => res.json({ message: 'getAssignedRoute — TODO' }));

// PATCH /api/collector/route/logs/:stopId
router.patch('/route/logs/:stopId', (req, res) => res.json({ message: 'markCollected — TODO' }));

module.exports = router;
