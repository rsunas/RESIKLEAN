const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const { getAssignedRoute, markStop, batchSyncLogs, getTodayProgress, getRouteHistory, resolveComplaint } = require('../controllers/collector.controller');

router.use(protect, authorize('collector'));

router.get('/route',                    getAssignedRoute);
router.get('/route/progress',           getTodayProgress);
router.get('/route-history',            getRouteHistory);
router.post('/route/logs/batch',        batchSyncLogs);    // batch must come before :stopId
router.patch('/route/logs/:stopId',     markStop);

// Resolve complaint endpoint with photo upload
router.post('/complaints/:reportId/resolve', upload.single('photo'), resolveComplaint);

module.exports = router;
