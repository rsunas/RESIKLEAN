const express = require('express');
const router = express.Router();
const { getLocations } = require('../controllers/collectionLocation.controller');

// Public — no auth required (used by registration/profile dropdowns)
router.get('/', getLocations);

module.exports = router;
