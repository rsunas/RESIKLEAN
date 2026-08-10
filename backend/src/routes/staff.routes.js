const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const { submitTruckLoad, getMyTruckLoads } = require('../controllers/staff.controller');

router.use(protect, authorize('staff'));

router.post('/truckloads',   submitTruckLoad);
router.get('/truckloads',    getMyTruckLoads);

module.exports = router;
