const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const { submitTruckLoad, getMyTruckLoads, getAreas, getDrivers } = require('../controllers/staff.controller');

router.use(protect, authorize('staff'));

router.get('/areas',         getAreas);
router.get('/drivers',       getDrivers);
router.post('/truckloads',   submitTruckLoad);
router.get('/truckloads',    getMyTruckLoads);

module.exports = router;
