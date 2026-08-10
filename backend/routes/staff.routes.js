const express   = require('express');
const router    = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');

// All staff routes require a valid JWT + staff role
router.use(protect, authorize('staff'));

// POST /api/staff/truckloads
router.post('/truckloads', (req, res) => res.json({ message: 'submitTruckLoad — TODO' }));

// GET  /api/staff/truckloads
router.get('/truckloads', (req, res) => res.json({ message: 'getMyTruckLoads — TODO' }));

module.exports = router;
