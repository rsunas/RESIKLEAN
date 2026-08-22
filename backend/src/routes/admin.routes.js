const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const {
  getAllUsers,
  createUser,
  getAllRoutes,
  createRoute,
  assignCollector,
  getComplianceReport,
  getAllReports,
  updateReportStatus,
  getTonnageSummary,
  createTruck,
  createCycleLog,
  getCycleLogs,
} = require('../controllers/admin.controller');

router.use(protect, authorize('admin'));

// Users
router.get('/users', getAllUsers);
router.post('/users', createUser);

// Routes
router.get('/routes', getAllRoutes);
router.post('/routes', createRoute);
router.patch('/routes/:routeId/assign', assignCollector);

// Compliance
router.get('/compliance', getComplianceReport);

// Missed Reports
router.get('/reports', getAllReports);
router.patch('/reports/:reportId', updateReportStatus);

// Tonnage
router.get('/tonnage', getTonnageSummary);

// Trucks
router.post('/trucks', createTruck);

// Cycle Logs (driver-truck-shift mapping)
router.post('/cycle-logs', createCycleLog);
router.get('/cycle-logs', getCycleLogs);

module.exports = router;
