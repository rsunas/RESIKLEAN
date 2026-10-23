const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const { getSchedule, submitReport, getMyReports, registerPushToken, removePushToken, verifyPhotoOnly } = require('../controllers/resident.controller');
const { getMessages, sendMessage } = require('../controllers/message.controller');

router.use(protect, authorize('resident'));

router.post('/push-token', registerPushToken);
router.delete('/push-token', removePushToken);

router.get('/schedule', getSchedule);
router.get('/reports', getMyReports);
router.post('/reports/verify-photo', upload.single('photo'), verifyPhotoOnly);
router.post('/reports', upload.single('photo'), submitReport);

// Report messaging
router.get('/reports/:reportId/messages', getMessages);
router.post('/reports/:reportId/messages', sendMessage);

// App & SWMO Information (hotlines, waste guide, FAQs)
const { getAppInfo } = require('../controllers/auth.controller');
router.get('/app-info', getAppInfo);

module.exports = router;
