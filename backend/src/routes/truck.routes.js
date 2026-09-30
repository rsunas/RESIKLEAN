const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const Truck = require('../models/Truck');
const { sendSuccess, sendError } = require('../utils/response');

// All truck routes require login as staff or admin
router.use(protect, authorize('staff', 'admin'));

// ── GET /api/trucks ───────────────────────────────────────────────────────────
// Returns all active, registered trucks (for the Staff volumetric-input dropdown).
// Includes the computed virtual `capacity` (cu.m.) field.
router.get('/', async (req, res) => {
  try {
    const trucks = await Truck.find({ isActive: true })
      .sort({ plateNumber: 1 });

    sendSuccess(res, { count: trucks.length, trucks });
  } catch (err) {
    sendError(res, err.message, 500);
  }
});

module.exports = router;
