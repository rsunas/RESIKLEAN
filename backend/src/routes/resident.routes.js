const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const { getSchedule, submitReport, getMyReports } = require('../controllers/resident.controller');

router.use(protect, authorize('resident'));

router.get('/schedule', getSchedule);
router.get('/reports', getMyReports);
router.post('/reports', upload.single('photo'), submitReport);

module.exports = router;
