const express = require('express');
const router  = express.Router();

// POST /api/staff/truckloads
router.post('/truckloads', (req, res) => res.json({ message: 'submitTruckLoad — TODO' }));

// GET  /api/staff/truckloads
router.get('/truckloads', (req, res) => res.json({ message: 'getMyTruckLoads — TODO' }));

module.exports = router;
