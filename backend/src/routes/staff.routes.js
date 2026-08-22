const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload        = require('../middlewares/upload');
const { submitTruckLoad, getMyTruckLoads, getAreas, getDrivers, getDriverByTruck } = require('../controllers/staff.controller');

router.use(protect, authorize('staff'));

router.get('/areas',                    getAreas);
router.get('/drivers',                  getDrivers);
router.get('/drivers/by-truck/:truckId', getDriverByTruck);
router.post('/truckloads',              upload.single('photo'), submitTruckLoad);
router.get('/truckloads',               getMyTruckLoads);

module.exports = router;
