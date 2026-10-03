const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const {
  getAllUsers,
  createUser,
  getAllRoutes,
  createRoute,
  updateRoute,
  assignCollector,
  getComplianceReport,
  getAllReports,
  updateReportStatus,
  getTonnageSummary,
  createTruck,
  updateTruck,
  archiveTruck,
  createCycleLog,
  getCycleLogs,
} = require('../controllers/admin.controller');
const { getMessages, sendMessage } = require('../controllers/message.controller');

router.use(protect, authorize('admin'));

// Users
router.get('/users', getAllUsers);
router.post('/users', upload.single('avatar'), createUser);

// Routes
router.get('/routes', getAllRoutes);
router.post('/routes', createRoute);
router.patch('/routes/:routeId', updateRoute);
router.patch('/routes/:routeId/assign', assignCollector);

// Compliance
router.get('/compliance', getComplianceReport);

// Missed Reports
router.get('/reports', getAllReports);
router.patch('/reports/:reportId', updateReportStatus);

// Report messaging
router.get('/reports/:reportId/messages', getMessages);
router.post('/reports/:reportId/messages', sendMessage);

// Tonnage
router.get('/tonnage', getTonnageSummary);

// Trucks
router.post('/trucks', createTruck);
router.patch('/trucks/:truckId', updateTruck);
router.delete('/trucks/:truckId', archiveTruck);

// Cycle Logs (driver-truck-shift mapping)
router.post('/cycle-logs', createCycleLog);
router.get('/cycle-logs', getCycleLogs);

module.exports = router;
