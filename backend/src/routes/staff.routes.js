const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const { submitTruckLoad, getMyTruckLoads, getAreas } = require('../controllers/staff.controller');

router.use(protect, authorize('staff'));

router.get('/areas',         getAreas);
router.post('/truckloads',   submitTruckLoad);
router.get('/truckloads',    getMyTruckLoads);

module.exports = router;
