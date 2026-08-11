const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const { getAssignedRoute, markStop, getTodayProgress } = require('../controllers/collector.controller');

router.use(protect, authorize('collector'));

router.get('/route',                    getAssignedRoute);
router.get('/route/progress',           getTodayProgress);
router.patch('/route/logs/:stopId',     markStop);

module.exports = router;
