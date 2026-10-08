const express  = require('express');
const router   = express.Router();
const { protect }   = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const { getAssignedRoute, markStop, batchSyncLogs, getTodayProgress, getRouteHistory, resolveComplaint, getComplaints, batchSyncTrails, getTrailHistory, completeRoute } = require('../controllers/collector.controller');

router.use(protect, authorize('collector'));

router.get('/route',                    getAssignedRoute);
router.get('/route/progress',           getTodayProgress);
router.get('/route-history',            getRouteHistory);
router.post('/route/logs/batch',        batchSyncLogs);    // batch must come before :stopId
router.post('/route/complete',          completeRoute);
router.patch('/route/logs/:stopId',     markStop);

router.get('/trails',                   getTrailHistory);
router.post('/trails/batch',            batchSyncTrails);

// Complaints
router.get('/complaints',                        getComplaints);
router.post('/complaints/:reportId/resolve', upload.single('photo'), resolveComplaint);

module.exports = router;
